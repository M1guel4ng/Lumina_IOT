const express = require('express');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
const PORT = 3000;

// Estado inicial del simulador
let state = { 
    deviceId: "sim-01", 
    presence: false, 
    lightLevel: 0, 
    light: "off", 
    mode: "manual" 
};

// Configuración Express
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint para recibir actualizaciones desde el Frontend
app.post('/api/update', (req, res) => {
    const { presence, lightLevel } = req.body;
    
    let updated = false;
    if (presence !== undefined && state.presence !== presence) {
        state.presence = presence;
        updated = true;
    }
    if (lightLevel !== undefined && state.lightLevel !== lightLevel) {
        state.lightLevel = parseInt(lightLevel, 10);
        updated = true;
    }

    if (updated) {
        sendTelemetry();
    }
    
    res.json({ success: true, state });
});

app.listen(PORT, () => {
    console.log(`[HTTP] Servidor Web corriendo en http://localhost:${PORT}`);
});

// Configuración de MQTT
const mqttOptions = {
    keepalive: 15,
    will: {
        topic: `sila/${state.deviceId}/status`,
        payload: 'offline',
        qos: 1,
        retain: true
    }
};

const client = mqtt.connect('mqtt://localhost', mqttOptions);

client.on('connect', () => {
    console.log('[MQTT] Conectado al broker');
    
    // Publicar estado online
    client.publish(`sila/${state.deviceId}/status`, 'online', { qos: 1, retain: true });
    
    // Suscribirse a comandos
    client.subscribe(`sila/${state.deviceId}/cmd/light`, { qos: 1 });
    client.subscribe(`sila/${state.deviceId}/cmd/mode`, { qos: 1 });
});

client.on('message', (topic, message) => {
    console.log(`[MQTT] Mensaje recibido en ${topic}: ${message.toString()}`);
    try {
        const payload = JSON.parse(message.toString());
        
        if (topic === `sila/${state.deviceId}/cmd/light`) {
            if (payload.state === 'on' || payload.state === 'off') {
                state.light = payload.state;
                sendTelemetry();
            }
        } else if (topic === `sila/${state.deviceId}/cmd/mode`) {
            if (payload.mode === 'manual' || payload.mode === 'auto') {
                state.mode = payload.mode;
                sendTelemetry();
            }
        }
    } catch (err) {
        console.error('[MQTT] Error al procesar el mensaje JSON:', err.message);
    }
});

// Función de Telemetría
function sendTelemetry() {
    if (!client.connected) return;
    
    const telemetryData = {
        ...state,
        ts: new Date().toISOString()
    };
    
    client.publish(
        `sila/${state.deviceId}/telemetry`, 
        JSON.stringify(telemetryData), 
        { qos: 0 }
    );
    console.log(`[MQTT] Telemetría enviada: ${JSON.stringify(telemetryData)}`);
}

// Latido (Heartbeat) cada 10 segundos
setInterval(sendTelemetry, 10000);
