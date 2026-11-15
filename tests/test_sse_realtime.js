/**
 * ============================================================================
 * TEST 5 - Latencia del SSE (Server-Sent Events / Canal Tiempo Real)
 * ============================================================================
 * Mide el tiempo desde que el backend recibe una telemetría MQTT hasta que
 * la retransmite vía SSE al cliente frontend.
 *
 * Flujo:
 *   [Script] → Publica MQTT → [Backend] → procesa → SSE → [Script recibe]
 *   RTT medido = tiempo entre publish MQTT y recepción del evento SSE
 *
 * Indicadores:
 *  - Latencia end-to-end (MQTT → SSE) por mensaje
 *  - Paquetes emitidos vs eventos SSE recibidos
 *  - Tiempo de establecimiento de la conexión SSE
 * ============================================================================
 */

import http from 'node:http';
import mqtt from 'mqtt';

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL       = 'http://localhost:3001';
const BROKER_URL     = 'mqtt://broker.hivemq.com:1883';
const CREDENTIALS    = { username: 'testadmin', password: 'Lumina#Test2026!' };
const DEVICE_ID      = 'sim-01';
const ITERATIONS     = 20;
const INTER_MSG_MS   = 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stats(samples) {
  if (!samples.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    min: sorted[0], max: sorted[n - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.floor(n * 0.50)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 5 — Latencia SSE (MQTT → Backend → Cliente)           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Servidor : ${BASE_URL}`);
  console.log(`  Broker   : ${BROKER_URL}`);
  console.log(`  Nodo     : ${DEVICE_ID}`);
  console.log(`  Mensajes : ${ITERATIONS}\n`);

  // ── Paso 1: Login ─────────────────────────────────────────────────────────
  process.stdout.write('  Obteniendo token JWT... ');
  const tokenRes = await new Promise((resolve) => {
    const payload = JSON.stringify(CREDENTIALS);
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });

  const token = tokenRes?.token;
  if (!token) { console.error('\n  ❌ Login fallido'); process.exit(1); }
  console.log('OK');

  // ── Paso 2: Conectar al broker MQTT ───────────────────────────────────────
  process.stdout.write('  Conectando al broker MQTT... ');
  const mqttClient = mqtt.connect(BROKER_URL, {
    clientId: `lumina-sse-test-${Date.now()}`,
    clean: true, reconnectPeriod: 0,
  });

  await new Promise((resolve, reject) => {
    mqttClient.on('connect', resolve);
    mqttClient.on('error', reject);
    setTimeout(() => reject(new Error('Timeout MQTT')), 10000);
  });
  console.log('OK');

  // ── Paso 3: Abrir conexión SSE y medir tiempo de establecimiento ──────────
  process.stdout.write('  Estableciendo conexión SSE... ');
  const sseConnectT0 = performance.now();

  const sseLatencies = [];
  const pendingMessages = new Map();  // seq → sentAt
  let sseReceived = 0;

  // Crear solicitud SSE
  const sseReq = http.request({
    hostname: 'localhost', port: 3001, path: '/api/realtime',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  }, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim());
            // Buscar si algún mensaje pendiente coincide con este deviceId
            if (data.deviceId === DEVICE_ID) {
              // Encontrar el mensaje pendiente con timestamp más reciente
              for (const [seq, sentAt] of pendingMessages.entries()) {
                const latency = performance.now() - sentAt;
                if (latency < 10000) { // dentro de 10s es válido
                  sseLatencies.push(latency);
                  pendingMessages.delete(seq);
                  sseReceived++;
                  process.stdout.write('→');
                  break;
                }
              }
            }
          } catch { /* skip non-JSON */ }
        }
      }
    });
  });

  sseReq.on('error', (err) => console.error('\n  SSE Error:', err.message));
  sseReq.end();

  // Esperar evento "connected" del SSE
  await sleep(1500);
  const sseConnectTime = performance.now() - sseConnectT0;
  console.log(`OK (${sseConnectTime.toFixed(0)}ms)\n`);

  // ── Paso 4: Publicar telemetrías y medir latencia end-to-end ─────────────
  console.log(`  Publicando ${ITERATIONS} telemetrías y esperando eventos SSE:\n  `);

  for (let seq = 0; seq < ITERATIONS; seq++) {
    const sentAt = performance.now();
    pendingMessages.set(seq, sentAt);

    // Publicar telemetría simulada que el backend procesará
    const telemetry = JSON.stringify({
      deviceId:   DEVICE_ID,
      presence:   seq % 3 === 0,
      lightLevel: 30 + (seq % 40),
      light:      seq % 2 === 0 ? 'on' : 'off',
      mode:       'pir',
      ts:         new Date().toISOString(),
    });

    mqttClient.publish(`sila/${DEVICE_ID}/telemetry`, telemetry, { qos: 1 });
    process.stdout.write('.');
    await sleep(INTER_MSG_MS);
  }

  // Esperar últimas respuestas SSE
  await sleep(3000);

  // ── Paso 5: Resultados ────────────────────────────────────────────────────
  console.log('\n');
  const missed = ITERATIONS - sseReceived;
  const s = stats(sseLatencies);

  console.log('  ── Resultados SSE End-to-End ─────────────────────────────────');
  console.log(`  Conexión SSE establecida en: ${sseConnectTime.toFixed(1)} ms`);
  console.log(`\n  Mensajes MQTT publicados:    ${ITERATIONS}`);
  console.log(`  Eventos SSE recibidos:       ${sseReceived}`);
  console.log(`  Eventos no recibidos:        ${missed}  (${((missed / ITERATIONS) * 100).toFixed(1)}%)`);
  console.log(`\n  Latencia end-to-end (MQTT → SSE):`);
  console.log(`    Mínima:    ${s.min.toFixed(2)} ms`);
  console.log(`    Promedio:  ${s.avg.toFixed(2)} ms`);
  console.log(`    p50:       ${s.p50.toFixed(2)} ms`);
  console.log(`    p95:       ${s.p95.toFixed(2)} ms`);
  console.log(`    Máxima:    ${s.max.toFixed(2)} ms\n`);

  // ── Evaluación ────────────────────────────────────────────────────────────
  const avgLat = s.avg;
  const icon = avgLat <= 100 ? '✅' : avgLat <= 300 ? '⚠️ ' : '❌';
  console.log(`  ${icon}  Latencia promedio SSE: ${avgLat.toFixed(1)}ms  ${avgLat <= 100 ? '(EXCELENTE)' : avgLat <= 300 ? '(ACEPTABLE)' : '(LENTA)'}`);
  console.log(`  Criterio: ≤100ms = Excelente | 100-300ms = Aceptable | >300ms = Lenta\n`);

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:              'sse_realtime',
    timestamp:         new Date().toISOString(),
    sseConnectTimeMs:  +sseConnectTime.toFixed(2),
    iterations:        ITERATIONS,
    received:          sseReceived,
    missed,
    missedPct:         +((missed / ITERATIONS) * 100).toFixed(2),
    latency_ms: {
      min: +s.min.toFixed(2), avg: +s.avg.toFixed(2),
      p50: +s.p50.toFixed(2), p95: +s.p95.toFixed(2), max: +s.max.toFixed(2),
    },
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/sse_realtime.json', JSON.stringify(output, null, 2));
    console.log('  📄 Resultados guardados en: tests/results/sse_realtime.json\n');
  });

  // Cerrar conexiones
  sseReq.destroy();
  await new Promise(r => mqttClient.end(false, {}, r));
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
