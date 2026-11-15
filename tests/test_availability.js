/**
 * ============================================================================
 * TEST 4 - Disponibilidad del Sistema (Uptime & Health Monitoring)
 * ============================================================================
 * Realiza polling continuo al backend y al broker MQTT durante 2 minutos para
 * calcular la disponibilidad real del sistema en ese intervalo.
 *
 * Indicadores calculados:
 *  - Porcentaje de disponibilidad: (éxitos / total) × 100
 *  - Interrupciones detectadas (ventanas de error consecutivas)
 *  - Tiempo de recuperación promedio tras fallo
 *  - Tiempo total de inactividad estimado
 *  - Latencia por muestra (para detectar degradación antes del fallo)
 * ============================================================================
 */

import http from 'node:http';
import mqtt from 'mqtt';

// ─── Configuración ────────────────────────────────────────────────────────────
const BACKEND_URL       = 'http://localhost:3001';
const BROKER_URL        = 'mqtt://broker.hivemq.com:1883';
const POLL_INTERVAL_MS  = 2000;   // cada cuánto sondear
const TEST_DURATION_MS  = 20000;  // 20 segundos de monitoreo para prueba rápida
const CREDENTIALS       = { username: 'testadmin', password: 'Lumina#Test2026!' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkHttp(path, token) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { hostname: 'localhost', port: 3001, path, method: 'GET', headers };

    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          latency: performance.now() - t0,
        });
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, latency: performance.now() - t0 }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, status: 0, latency: 5000 }); });
    req.end();
  });
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 4 — Disponibilidad del Sistema (Uptime Monitoring)    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Duración   : ${TEST_DURATION_MS / 1000}s`);
  console.log(`  Intervalo  : ${POLL_INTERVAL_MS / 1000}s por sondeo`);
  console.log(`  Muestras   : ~${Math.floor(TEST_DURATION_MS / POLL_INTERVAL_MS)} por servicio\n`);

  // ── Paso 1: Obtener token ─────────────────────────────────────────────────
  process.stdout.write('  Obteniendo token JWT... ');
  const tokenRes = await new Promise((resolve) => {
    const payload = JSON.stringify(CREDENTIALS);
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });

  const token = tokenRes?.token;
  if (!token) {
    console.error('\n  ❌ Login fallido. Verifica credenciales.');
    process.exit(1);
  }
  console.log('OK\n');

  // ── Paso 2: Conectar al broker MQTT para medir disponibilidad ─────────────
  let mqttConnected = false;
  let mqttReconnects = 0;
  const mqttClient = mqtt.connect(BROKER_URL, {
    clientId: `lumina-avail-${Date.now()}`,
    clean: true,
    reconnectPeriod: 2000,
  });

  mqttClient.on('connect', () => {
    mqttConnected = true;
    if (mqttReconnects > 0) console.log('  🔄 MQTT Reconectado');
  });
  mqttClient.on('offline', () => { mqttConnected = false; });
  mqttClient.on('reconnect', () => { mqttReconnects++; });

  await sleep(2000); // Esperar conexión inicial

  // ── Paso 3: Bucle de monitoreo ────────────────────────────────────────────
  const healthSamples  = [];
  const nodesSamples   = [];
  const mqttSamples    = [];

  let inFailure  = false;
  let failStart  = null;
  const outages  = [];   // { start, end, durationMs }

  const deadline = Date.now() + TEST_DURATION_MS;
  let round = 0;

  process.stdout.write(`  Monitoreando (${TEST_DURATION_MS / 1000}s): `);

  while (Date.now() < deadline) {
    round++;
    const ts = new Date().toISOString();

    // Sondear endpoints en paralelo
    const [healthRes, nodesRes] = await Promise.all([
      checkHttp('/api/health', null),
      checkHttp('/api/nodes', token),
    ]);
    const mqttUp = mqttConnected;

    healthSamples.push({ ts, ...healthRes });
    nodesSamples.push({ ts, ...nodesRes });
    mqttSamples.push({ ts, up: mqttUp, latency: mqttUp ? 0 : -1 });

    const allOk = healthRes.ok && nodesRes.ok && mqttUp;

    if (!allOk && !inFailure) {
      inFailure = true;
      failStart = Date.now();
      process.stdout.write('\n  ❌ FALLO detectado — ');
      if (!healthRes.ok) process.stdout.write(`health(${healthRes.status}) `);
      if (!nodesRes.ok)  process.stdout.write(`nodes(${nodesRes.status}) `);
      if (!mqttUp)       process.stdout.write('mqtt(offline) ');
      process.stdout.write('\n  ');
    } else if (allOk && inFailure) {
      inFailure = false;
      const duration = Date.now() - failStart;
      outages.push({ start: new Date(failStart).toISOString(), end: ts, durationMs: duration });
      process.stdout.write(`  ✅ Recuperado (inactividad: ${(duration / 1000).toFixed(1)}s)\n  `);
    } else {
      process.stdout.write(allOk ? '.' : '✗');
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Cerrar cliente MQTT
  await new Promise(r => mqttClient.end(false, {}, r));

  console.log('\n');

  // ── Paso 4: Calcular indicadores ──────────────────────────────────────────
  function availability(samples) {
    const ok = samples.filter(s => s.ok !== undefined ? s.ok : s.up).length;
    return (ok / samples.length * 100).toFixed(3);
  }

  const healthAvail = availability(healthSamples);
  const nodesAvail  = availability(nodesSamples);
  const mqttAvail   = availability(mqttSamples);

  const healthLats  = healthSamples.filter(s => s.ok).map(s => s.latency);
  const nodesLats   = nodesSamples.filter(s => s.ok).map(s => s.latency);

  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function maxv(arr) { return arr.length ? Math.max(...arr) : 0; }

  const totalDowntimeMs = outages.reduce((sum, o) => sum + o.durationMs, 0);

  // ── Paso 5: Presentar resultados ──────────────────────────────────────────
  console.log('  ── Resultados de Disponibilidad ───────────────────────────────');
  console.log(`\n  Servicio              Disponibilidad    Latencia avg    Latencia max`);
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  GET /api/health       ${healthAvail.padStart(12)}%    ${avg(healthLats).toFixed(1).padStart(10)}ms    ${maxv(healthLats).toFixed(1).padStart(10)}ms`);
  console.log(`  GET /api/nodes        ${nodesAvail.padStart(12)}%    ${avg(nodesLats).toFixed(1).padStart(10)}ms    ${maxv(nodesLats).toFixed(1).padStart(10)}ms`);
  console.log(`  MQTT Broker           ${mqttAvail.padStart(12)}%    ${'N/A'.padStart(10)}      ${'N/A'.padStart(10)}`);

  console.log(`\n  Interrupciones detectadas: ${outages.length}`);
  console.log(`  Tiempo total de inactividad: ${(totalDowntimeMs / 1000).toFixed(1)}s`);
  if (outages.length) {
    const avgRecovery = outages.reduce((s, o) => s + o.durationMs, 0) / outages.length;
    console.log(`  Tiempo promedio de recuperación: ${(avgRecovery / 1000).toFixed(1)}s`);
    console.log(`\n  Detalle de interrupciones:`);
    for (const o of outages) {
      console.log(`    ${o.start} → ${o.end}  (${(o.durationMs / 1000).toFixed(1)}s)`);
    }
  }

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:        'availability',
    timestamp:   new Date().toISOString(),
    durationMs:  TEST_DURATION_MS,
    pollMs:      POLL_INTERVAL_MS,
    rounds:      round,
    health:      { availability: +healthAvail, avgLatency: +avg(healthLats).toFixed(2), maxLatency: +maxv(healthLats).toFixed(2) },
    nodes:       { availability: +nodesAvail,  avgLatency: +avg(nodesLats).toFixed(2),  maxLatency: +maxv(nodesLats).toFixed(2) },
    mqtt:        { availability: +mqttAvail, reconnects: mqttReconnects },
    outages,
    totalDowntimeMs,
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/availability.json', JSON.stringify(output, null, 2));
    console.log('\n  📄 Resultados guardados en: tests/results/availability.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
