const express = require('express');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
const PORT = 3000;

// ─── Definición de nodos ──────────────────────────────────────────────────────
const DEVICE_IDS = ['sim-01', 'sim-02', 'sim-03'];

// Estado inicial de cada nodo
const nodes = {};
for (const id of DEVICE_IDS) {
    nodes[id] = {
        deviceId: id,
        presence: false,
        lightLevel: 0,
        light: 'off',
        mode: 'manual',
    };
}

// ─── Configuración Express ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * POST /api/update
 * Recibe cambios de estado desde la UI del simulador.
 * Solo publica telemetría cuando hay un cambio real → genera evento en backend.
 */
app.post('/api/update', (req, res) => {
    const { deviceId, presence, lightLevel, light } = req.body;

    if (!deviceId || !nodes[deviceId]) {
        return res.status(400).json({ success: false, message: 'deviceId inválido' });
    }

    const node = nodes[deviceId];
    let changed = false;

    if (presence !== undefined && node.presence !== presence) {
        node.presence = presence;
        changed = true;
    }
    if (lightLevel !== undefined && node.lightLevel !== parseInt(lightLevel, 10)) {
        node.lightLevel = parseInt(lightLevel, 10);
        changed = true;
    }
    if (light !== undefined) {
        const normLight = (light === true || light === 'on') ? 'on' : 'off';
        if (node.light !== normLight) {
            node.light = normLight;
            changed = true;
        }
    }

    if (changed) {
        publishTelemetry(deviceId);
    }

    res.json({ success: true, state: node });
});

/**
 * GET /api/nodes-state
 * Devuelve el estado local de todos los nodos simulados.
 */
app.get('/api/nodes-state', (_req, res) => {
    res.json({ nodes: Object.values(nodes) });
});

app.listen(PORT, () => {
    console.log(`[HTTP] Simulador corriendo en http://localhost:${PORT}`);
    console.log('[CONSOLA] Puedes presionar 1, 2 o 3 + Enter para alternar luz de sim-01, sim-02, sim-03');
});

// ─── Entrada por consola (Terminal) ───────────────────────────────────────────
const readline = require('readline');
try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (line) => {
        const trimmed = line.trim().toLowerCase();
        const map = { '1': 'sim-01', '2': 'sim-02', '3': 'sim-03' };
        const id = map[trimmed] || (DEVICE_IDS.includes(trimmed) ? trimmed : null);
        if (id && nodes[id]) {
            nodes[id].light = nodes[id].light === 'on' ? 'off' : 'on';
            console.log(`[SIM] Luz de ${id} cambiada a: ${nodes[id].light.toUpperCase()}`);
            publishTelemetry(id);
        }
    });
} catch (_) {}

// ─── Configuración MQTT ───────────────────────────────────────────────────────
const mqttOptions = {
    clientId: `lumina-simulator-${process.pid}`,
    keepalive: 15,
    reconnectPeriod: 2000,
};

const client = mqtt.connect('mqtt://localhost', mqttOptions);

client.on('connect', () => {
    console.log('[MQTT] Conectado al broker');

    // Publicar "online" y suscribirse a comandos para cada nodo
    for (const deviceId of DEVICE_IDS) {
        client.publish(`sila/${deviceId}/status`, 'online', { qos: 1, retain: true });
        client.subscribe(`sila/${deviceId}/cmd`, { qos: 1 });          // unified command topic
        client.subscribe(`sila/${deviceId}/cmd/light`, { qos: 1 });    // legacy
        client.subscribe(`sila/${deviceId}/cmd/mode`, { qos: 1 });     // legacy
        console.log(`[MQTT] Nodo ${deviceId} registrado y online`);
    }

    // Publicar telemetría inicial para registrar el estado de cada nodo
    for (const deviceId of DEVICE_IDS) {
        setTimeout(() => publishTelemetry(deviceId), 500);
    }
});

client.on('message', (topic, message) => {
    console.log(`[MQTT] Mensaje en ${topic}: ${message.toString()}`);
    try {
        const node_unified = /^sila\/([a-z0-9-]+)\/cmd$/.exec(topic);
        if (node_unified) {
            // Unified topic: { light: 'on'|'off' }
            const deviceId = node_unified[1];
            const node = nodes[deviceId];
            if (!node) return;
            const payload = JSON.parse(message.toString());
            let changed = false;
            if (payload.light === 'on' || payload.light === 'off') {
                if (node.light !== payload.light) { node.light = payload.light; changed = true; }
            }
            if (payload.mode === 'auto' || payload.mode === 'manual') {
                if (node.mode !== payload.mode) { node.mode = payload.mode; changed = true; }
            }
            if (changed) publishTelemetry(deviceId);
            return;
        }

        // Legacy sub-topics: sila/<deviceId>/cmd/<action>
        const match = /^sila\/([a-z0-9-]+)\/cmd\/(light|mode)$/.exec(topic);
        if (!match) return;

        const deviceId = match[1];
        const action = match[2];
        const node = nodes[deviceId];
        if (!node) return;

        const payload = JSON.parse(message.toString());
        let changed = false;

        if (action === 'light' && (payload.state === 'on' || payload.state === 'off')) {
            if (node.light !== payload.state) {
                node.light = payload.state;
                changed = true;
            }
        } else if (action === 'mode' && (payload.mode === 'manual' || payload.mode === 'auto')) {
            if (node.mode !== payload.mode) {
                node.mode = payload.mode;
                changed = true;
            }
        }

        if (changed) publishTelemetry(deviceId);

    } catch (err) {
        console.error('[MQTT] Error procesando mensaje:', err.message);
    }
});

client.on('reconnect', () => console.log('[MQTT] Reconectando...'));
client.on('error', (err) => console.error('[MQTT] Error:', err.message));

// ─── Temporizadores de Auto-Apagado de Luz (25 segundos sin presencia) ────────
const lightTimers = {};

function resetLightTimer(deviceId) {
    if (lightTimers[deviceId]) {
        clearTimeout(lightTimers[deviceId]);
        lightTimers[deviceId] = null;
    }

    const node = nodes[deviceId];
    if (!node) return;

    // Si la luz está encendida y no hay presencia detectada:
    // Programar auto-apagado de la luz tras 25 segundos
    if (node.light === 'on' && !node.presence) {
        console.log(`[TEMPORIZADOR] ${deviceId}: Luz encendida sin presencia. Se apagará automáticamente en 25 segundos.`);
        lightTimers[deviceId] = setTimeout(() => {
            if (node.light === 'on' && !node.presence) {
                console.log(`[AUTO-APAGADO] ${deviceId}: 25 segundos sin presencia cumplidos. Apagando luz automáticamente.`);
                node.light = 'off';
                publishTelemetry(deviceId);
            }
            lightTimers[deviceId] = null;
        }, 25000);
    }
}

/**
 * Publica telemetría completa del nodo → el backend registra cambios de estado.
 * Se llama SOLO cuando hay un cambio real (presence, light, mode, lightLevel).
 */
function publishTelemetry(deviceId) {
    if (!client.connected) return;
    const node = nodes[deviceId];
    const payload = { ...node, ts: new Date().toISOString() };
    client.publish(
        `sila/${deviceId}/telemetry`,
        JSON.stringify(payload),
        { qos: 0 }
    );
    console.log(`[TELEMETRY] ${deviceId}: ${JSON.stringify(payload)}`);
    resetLightTimer(deviceId);
}

/**
 * Publica un heartbeat periódico en un topic separado (/heartbeat).
 * El backend NO está suscrito a este topic, por lo que NO genera eventos históricos.
 * Criterio HU-2: "cuando se reciba un heartbeat sin cambios de estado,
 *                 entonces no debe generarse un nuevo registro histórico"
 */
function publishHeartbeat(deviceId) {
    if (!client.connected) return;
    const node = nodes[deviceId];
    const payload = { deviceId, ts: new Date().toISOString(), uptime: process.uptime() };
    client.publish(
        `sila/${deviceId}/heartbeat`,
        JSON.stringify(payload),
        { qos: 0 }
    );
    // No loguear para no saturar la consola — solo un punto de debug
    process.stdout.write(`\r[HEARTBEAT] ${deviceId} @ ${new Date().toLocaleTimeString()}   `);
}

// ─── Latidos periódicos por nodo (cada 10 s) ─────────────────────────────────
// Estos van al topic /heartbeat que el backend NO procesa → sin eventos históricos
for (const deviceId of DEVICE_IDS) {
    // Escalonar arranque para no saturar el broker
    const offset = DEVICE_IDS.indexOf(deviceId) * 3000;
    setTimeout(() => {
        setInterval(() => publishHeartbeat(deviceId), 10000);
    }, offset);
}

// ─── Manejo de cierre limpio ──────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n[SIM] Cerrando simulador...');
    for (const deviceId of DEVICE_IDS) {
        client.publish(`sila/${deviceId}/status`, 'offline', { qos: 1, retain: true });
    }
    setTimeout(() => process.exit(0), 500);
});
