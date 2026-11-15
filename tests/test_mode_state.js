/**
 * ============================================================================
 * TEST 8 - Validación del Modo de Operación y Tiempo de Cambio de Estado
 * ============================================================================
 * Prueba funcional que mide cuánto tarda el sistema en:
 *  1. Cambiar de modo (manual / pir / ldr) → tiempo hasta confirmación
 *  2. Encender/apagar luminaria en modo manual → confirmación de DB
 *
 * Indicadores:
 *  - Tiempo de confirmación de cambio de modo (ms)
 *  - Tiempo de cambio de estado de luz (ms)
 *  - Tasa de éxito de comandos
 * ============================================================================
 */

import http from 'node:http';

const BASE_URL    = 'http://localhost:3001';
const CREDENTIALS = { username: 'testadmin', password: 'Lumina#Test2026!' };
const DEVICE_ID   = 'sim-01';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stats(arr) {
  if (!arr.length) return { min: 0, max: 0, avg: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return { min: s[0], max: s[n - 1], avg: s.reduce((a, b) => a + b, 0) / n };
}

async function apiCall(method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const opts = { hostname: 'localhost', port: 3001, path, method, headers };
    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => {
        const latency = performance.now() - t0;
        try { resolve({ status: res.statusCode, body: JSON.parse(d), latency }); }
        catch { resolve({ status: res.statusCode, body: null, latency }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: null, latency: performance.now() - t0, error: e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 8 — Validación de Modos y Tiempo de Cambio de Estado  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Login ─────────────────────────────────────────────────────────────────
  process.stdout.write('  Obteniendo token... ');
  const loginRes = await apiCall('POST', '/api/auth/login', CREDENTIALS, null);
  const token = loginRes.body?.token;
  if (!token) { console.error('❌ Login fallido'); process.exit(1); }
  console.log(`OK (${loginRes.latency.toFixed(0)}ms)\n`);

  // ── Verificar que el nodo esté online ─────────────────────────────────────
  const nodeCheck = await apiCall('GET', `/api/nodes/${DEVICE_ID}`, null, token);
  if (!nodeCheck.body || nodeCheck.body.status !== 'online') {
    console.error(`  ⚠️  El nodo ${DEVICE_ID} no está online. Conecta el ESP32 o el simulador.`);
    console.error('  Este test requiere el nodo activo para medir confirmación de comandos.\n');
    process.exit(1);
  }
  console.log(`  ✅ Nodo ${DEVICE_ID} online. Modo actual: ${nodeCheck.body.mode}\n`);

  // ── 1. Test de cambio de modo ─────────────────────────────────────────────
  const MODES = ['manual', 'pir', 'ldr', 'manual'];
  const modeLatencies = [];
  let modeOk = 0, modeFail = 0;

  console.log('  ── Cambios de Modo Global (manual → pir → ldr → manual) ──────');
  for (const mode of MODES) {
    process.stdout.write(`  Cambiando a modo "${mode}"... `);
    const r = await apiCall('POST', `/api/nodes/${DEVICE_ID}/mode`, { mode }, token);
    if (r.status === 200) {
      modeLatencies.push(r.latency);
      modeOk++;
      console.log(`✅  ${r.latency.toFixed(0)}ms`);
    } else {
      modeFail++;
      console.log(`❌  HTTP ${r.status} — ${r.body?.message || 'Error desconocido'}`);
    }
    await sleep(1500); // Esperar estabilización
  }

  const ms = stats(modeLatencies);
  console.log(`\n  Éxitos: ${modeOk}/${MODES.length} | avg=${ms.avg.toFixed(0)}ms | max=${ms.max.toFixed(0)}ms\n`);

  // ── 2. Test de encendido/apagado en modo manual ───────────────────────────
  console.log('  ── Encendido / Apagado en Modo Manual (10 ciclos) ────────────');

  // Asegurar que estamos en modo manual
  await apiCall('POST', `/api/nodes/${DEVICE_ID}/mode`, { mode: 'manual' }, token);
  await sleep(2000);

  const lightLatencies = [];
  let lightOk = 0, lightFail = 0;

  for (let i = 0; i < 10; i++) {
    const state = i % 2 === 0 ? 'on' : 'off';
    process.stdout.write(`  Enviando "${state}"... `);
    const r = await apiCall('POST', `/api/nodes/${DEVICE_ID}/light`, { state }, token);
    if (r.status === 200) {
      lightLatencies.push(r.latency);
      lightOk++;
      console.log(`✅  ${r.latency.toFixed(0)}ms`);
    } else {
      lightFail++;
      console.log(`❌  HTTP ${r.status} — ${r.body?.message || 'Error'}`);
    }
    await sleep(1200);
  }

  const ls = stats(lightLatencies);
  console.log(`\n  Éxitos: ${lightOk}/10 | avg=${ls.avg.toFixed(0)}ms | max=${ls.max.toFixed(0)}ms\n`);

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log('  ── Evaluación de Criterios ───────────────────────────────────');
  const modeIcon  = modeOk === MODES.length ? '✅' : '⚠️ ';
  const lightIcon = lightOk >= 8 ? '✅' : '⚠️ ';
  console.log(`  ${modeIcon}  Cambios de modo:   ${modeOk}/${MODES.length} exitosos, avg=${ms.avg.toFixed(0)}ms`);
  console.log(`  ${lightIcon}  Cambios de luz:   ${lightOk}/10 exitosos, avg=${ls.avg.toFixed(0)}ms\n`);

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:      'mode_state_change',
    timestamp: new Date().toISOString(),
    device:    DEVICE_ID,
    modeChanges: {
      tested: MODES.length, success: modeOk, failed: modeFail,
      successPct: +((modeOk / MODES.length) * 100).toFixed(1),
      latency_ms: { min: +ms.min.toFixed(2), avg: +ms.avg.toFixed(2), max: +ms.max.toFixed(2) },
    },
    lightChanges: {
      tested: 10, success: lightOk, failed: lightFail,
      successPct: +(lightOk * 10).toFixed(1),
      latency_ms: { min: +ls.min.toFixed(2), avg: +ls.avg.toFixed(2), max: +ls.max.toFixed(2) },
    },
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/mode_state_change.json', JSON.stringify(output, null, 2));
    console.log('  📄 Resultados guardados en: tests/results/mode_state_change.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
