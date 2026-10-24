const express = require('express');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
const PORT = 3000;

// ─── Definición de nodos ──────────────────────────────────────────────────────
const DEVICE_IDS = ['sim-01', 'sim-02', 'sim-03', 'ESP32-Fisico'];

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
    const { deviceId, presence, lightLevel } = req.body;

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
});

// ─── Configuración MQTT ───────────────────────────────────────────────────────
const mqttOptions = {
    clientId: `lumina-simulator-${process.pid}`,
    keepalive: 15,
    reconnectPeriod: 2000,
};

const client = mqtt.connect('mqtt://broker.hivemq.com', mqttOptions);

client.on('connect', () => {
    console.log('[MQTT] Conectado al broker');

    // Publicar "online" y suscribirse a comandos para cada nodo
    for (const deviceId of DEVICE_IDS) {
        client.publish(`sila/${deviceId}/status`, 'online', { qos: 1, retain: true });
        client.subscribe(`sila/${deviceId}/cmd/light`, { qos: 1 });
        client.subscribe(`sila/${deviceId}/cmd/mode`, { qos: 1 });
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
        // Extraer deviceId del topic: sila/<deviceId>/cmd/<action>
        const match = /^sila\/([a-z0-9-]+)\/cmd\/(light|mode)$/.exec(topic);
        if (!match) return;

        const deviceId = match[1];
        if (deviceId === 'ESP32-Fisico') return;
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

        // Solo publicar telemetría si hubo cambio real
        if (changed) publishTelemetry(deviceId);

    } catch (err) {
        console.error('[MQTT] Error procesando mensaje:', err.message);
    }
});

client.on('reconnect', () => console.log('[MQTT] Reconectando...'));
client.on('error', (err) => console.error('[MQTT] Error:', err.message));

// ─── Funciones de publicación ─────────────────────────────────────────────────

/**
 * Publica telemetría completa del nodo → el backend registra cambios de estado.
 * Se llama SOLO cuando hay un cambio real (presence, light, mode, lightLevel).
 */
function publishTelemetry(deviceId) {
    if (!client.connected) return;
    if (deviceId === 'ESP32-Fisico') return; 
    
    const node = nodes[deviceId];
    const payload = { ...node, ts: new Date().toISOString() };
    client.publish(
        `sila/${deviceId}/telemetry`,
        JSON.stringify(payload),
        { qos: 0 }
    );
    console.log(`[TELEMETRY] ${deviceId}: ${JSON.stringify(payload)}`);
}

/**
 * Publica un heartbeat periódico en un topic separado (/heartbeat).
 * El backend NO está suscrito a este topic, por lo que NO genera eventos históricos.
 * Criterio HU-2: "cuando se reciba un heartbeat sin cambios de estado,
 *                 entonces no debe generarse un nuevo registro histórico"
 */
function publishHeartbeat(deviceId) {
    if (!client.connected) return;
    if (deviceId === 'ESP32-Fisico') return;
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
