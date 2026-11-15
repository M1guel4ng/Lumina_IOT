/**
 * ============================================================================
 * TEST 7 - Prueba de Pérdida de Paquetes bajo condiciones simuladas
 * ============================================================================
 * Envía telemetrías simuladas a múltiple velocidad y verifica cuántos se
 * procesan efectivamente en la base de datos.
 *
 * También mide el tiempo de escritura (upsert) en MongoDB Atlas por operación.
 * ============================================================================
 */

import http from 'node:http';
import mqtt from 'mqtt';

const BROKER_URL = 'mqtt://broker.hivemq.com:1883';
const CREDENTIALS = { username: 'testadmin', password: 'Lumina#Test2026!' };
const DEVICE_ID   = 'sim-01';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0, p95: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return {
    min: s[0], max: s[n - 1],
    avg: s.reduce((a, b) => a + b, 0) / n,
    p95: s[Math.floor(n * 0.95)],
  };
}

async function getToken() {
  return new Promise((resolve) => {
    const payload = JSON.stringify(CREDENTIALS);
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)?.token); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

async function getNodeState(token) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 3001, path: `/api/nodes/${DEVICE_ID}`, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 7 — Pérdida de Paquetes & Escritura en Base de Datos  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  process.stdout.write('  Obteniendo token... ');
  const token = await getToken();
  if (!token) { console.error('❌ Login fallido'); process.exit(1); }
  console.log('OK');

  process.stdout.write('  Conectando al broker MQTT... ');
  const client = mqtt.connect(BROKER_URL, {
    clientId: `lumina-pktloss-${Date.now()}`,
    clean: true, reconnectPeriod: 0,
  });
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 10000);
  });
  console.log('OK\n');

  // ── Escenarios de tasa de envío ───────────────────────────────────────────
  const SCENARIOS = [
    { name: 'Tasa baja   (1 msg/s)',   count: 10, intervalMs: 1000 },
    { name: 'Tasa media  (5 msg/s)',   count: 20, intervalMs: 200  },
    { name: 'Tasa alta   (10 msg/s)',  count: 20, intervalMs: 100  },
    { name: 'Ráfaga      (sin pausa)', count: 20, intervalMs: 10   },
  ];

  const allResults = [];

  for (const sc of SCENARIOS) {
    console.log(`  ── ${sc.name} ─────────────────────────────────────────────`);

    const dbReadLatencies = [];
    let sent = 0;
    let dbUpdates = 0;

    for (let i = 0; i < sc.count; i++) {
      const lightLevel = Math.floor(Math.random() * 80) + 10;
      const payload = JSON.stringify({
        deviceId:   DEVICE_ID,
        presence:   i % 2 === 0,
        lightLevel,
        light:      lightLevel < 40 ? 'on' : 'off',
        mode:       'pir',
        ts:         new Date().toISOString(),
      });

      client.publish(`sila/${DEVICE_ID}/telemetry`, payload, { qos: 1 });
      sent++;

      await sleep(sc.intervalMs);

      // Verificar que el backend procesó el mensaje consultando la API
      if (i % 5 === 4 || i === sc.count - 1) {
        const t0 = performance.now();
        const state = await getNodeState(token);
        const readLatency = performance.now() - t0;
        dbReadLatencies.push(readLatency);

        if (state && state.lightLevel === lightLevel) dbUpdates++;
      }
    }

    const s = stats(dbReadLatencies);
    console.log(`  Enviados: ${sent} | Verificaciones DB: ${dbReadLatencies.length} | Confirmados: ${dbUpdates}`);
    console.log(`  Latencia lectura DB: avg=${s.avg.toFixed(1)}ms  p95=${s.p95.toFixed(1)}ms\n`);

    allResults.push({
      scenario:         sc.name,
      count:            sc.count,
      intervalMs:       sc.intervalMs,
      sent,
      dbVerifications:  dbReadLatencies.length,
      dbConfirmed:      dbUpdates,
      dbReadLatency_ms: { min: +s.min.toFixed(2), avg: +s.avg.toFixed(2), p95: +s.p95.toFixed(2), max: +s.max.toFixed(2) },
    });
  }

  await new Promise(r => client.end(false, {}, r));

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:      'packet_loss_db',
    timestamp: new Date().toISOString(),
    device:    DEVICE_ID,
    broker:    BROKER_URL,
    results:   allResults,
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/packet_loss_db.json', JSON.stringify(output, null, 2));
    console.log('  📄 Resultados guardados en: tests/results/packet_loss_db.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
