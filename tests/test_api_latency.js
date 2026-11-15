/**
 * ============================================================================
 * TEST 1 - Latencia y Tiempo de Respuesta de la API REST
 * ============================================================================
 * Mide el tiempo de respuesta (RTT) de los endpoints HTTP del backend.
 * Endpoints evaluados:
 *  - GET  /api/health           → Salud del servidor (sin auth)
 *  - POST /api/auth/login       → Autenticación JWT
 *  - GET  /api/nodes            → Listado de nodos (autenticado)
 *  - GET  /api/nodes/sim-01     → Nodo individual
 *  - GET  /api/events           → Últimos 10 eventos
 *  - GET  /api/state            → Estado global
 *
 * Indicadores calculados:
 *  - Latencia mínima / máxima / promedio / p95 / p99 (ms)
 *  - Tasa de éxito HTTP (%)
 *  - Desviación estándar de latencia (ms)
 * ============================================================================
 */

import http from 'node:http';

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL    = 'http://localhost:3001';
const ITERATIONS  = 50;          // Repeticiones por endpoint
const CREDENTIALS = {
  username: 'testadmin',
  password: 'Lumina#Test2026!',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token)   headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers,
    };

    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latency = performance.now() - t0;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { /* ignore */ }
        resolve({ status: res.statusCode, latency, body: parsed });
      });
    });

    req.on('error', () => resolve({ status: 0, latency: performance.now() - t0, body: null }));
    if (payload) req.write(payload);
    req.end();
  });
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n   = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const variance = sorted.reduce((acc, v) => acc + (v - avg) ** 2, 0) / n;
  return {
    min:  sorted[0],
    max:  sorted[n - 1],
    avg,
    p50:  sorted[Math.floor(n * 0.50)],
    p95:  sorted[Math.floor(n * 0.95)],
    p99:  sorted[Math.floor(n * 0.99)],
    stddev: Math.sqrt(variance),
  };
}

function formatRow(label, s, success, total) {
  const pct = ((success / total) * 100).toFixed(1);
  return (
    `  ${label.padEnd(32)}` +
    `  min=${s.min.toFixed(1).padStart(7)}ms` +
    `  avg=${s.avg.toFixed(1).padStart(7)}ms` +
    `  p95=${s.p95.toFixed(1).padStart(7)}ms` +
    `  max=${s.max.toFixed(1).padStart(7)}ms` +
    `  éxito=${pct}%`
  );
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 1 — Latencia & Tiempo de Respuesta de la API REST     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Servidor : ${BASE_URL}`);
  console.log(`  Muestras : ${ITERATIONS} por endpoint\n`);

  // ── Paso 1: Obtener token de autenticación ─────────────────────────────────
  process.stdout.write('  Obteniendo token JWT... ');
  const loginRes = await request('POST', '/api/auth/login', CREDENTIALS, null);
  const token = loginRes.body?.token;
  if (!token) {
    console.error(`\n  ❌ Login fallido (HTTP ${loginRes.status}). Verifica credenciales en config.`);
    console.error('  Sugerencia: crea un usuario admin con: npm --prefix backend run create-admin');
    process.exit(1);
  }
  console.log(`OK (${loginRes.latency.toFixed(0)} ms)\n`);

  // ── Paso 2: Definir endpoints a medir ─────────────────────────────────────
  const endpoints = [
    { label: 'GET /api/health',         method: 'GET',  path: '/api/health',       auth: false },
    { label: 'POST /api/auth/login',    method: 'POST', path: '/api/auth/login',   auth: false, body: CREDENTIALS },
    { label: 'GET /api/nodes',          method: 'GET',  path: '/api/nodes',        auth: true },
    { label: 'GET /api/nodes/sim-01',   method: 'GET',  path: '/api/nodes/sim-01', auth: true },
    { label: 'GET /api/events (10)',    method: 'GET',  path: '/api/events?limit=10', auth: true },
    { label: 'GET /api/state',          method: 'GET',  path: '/api/state',        auth: true },
  ];

  const results = [];

  // ── Paso 3: Ejecutar mediciones ────────────────────────────────────────────
  for (const ep of endpoints) {
    process.stdout.write(`  Midiendo: ${ep.label.padEnd(34)}  `);
    const latencies = [];
    let success = 0;

    for (let i = 0; i < ITERATIONS; i++) {
      const res = await request(ep.method, ep.path, ep.body ?? null, ep.auth ? token : null);
      latencies.push(res.latency);
      if (res.status >= 200 && res.status < 300) success++;
    }

    const s = stats(latencies);
    console.log(`✓  avg=${s.avg.toFixed(1)}ms  p95=${s.p95.toFixed(1)}ms`);
    results.push({ ...ep, stats: s, success, total: ITERATIONS });
  }

  // ── Paso 4: Resumen final ──────────────────────────────────────────────────
  console.log('\n  ── Resultados Completos ──────────────────────────────────────');
  for (const r of results) {
    console.log(formatRow(r.label, r.stats, r.success, r.total));
  }

  // ── Paso 5: Guardar resultado JSON ─────────────────────────────────────────
  const output = {
    test:        'api_latency',
    timestamp:   new Date().toISOString(),
    server:      BASE_URL,
    iterations:  ITERATIONS,
    results:     results.map(r => ({
      endpoint:  r.label,
      method:    r.method,
      path:      r.path,
      success:   r.success,
      total:     r.total,
      successPct: ((r.success / r.total) * 100).toFixed(1),
      latency_ms: {
        min:    +r.stats.min.toFixed(2),
        avg:    +r.stats.avg.toFixed(2),
        p50:    +r.stats.p50.toFixed(2),
        p95:    +r.stats.p95.toFixed(2),
        p99:    +r.stats.p99.toFixed(2),
        max:    +r.stats.max.toFixed(2),
        stddev: +r.stats.stddev.toFixed(2),
      },
    })),
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/api_latency.json', JSON.stringify(output, null, 2));
    console.log('\n  📄 Resultados guardados en: tests/results/api_latency.json');
  });

  // ── Resumen de criterios ───────────────────────────────────────────────────
  console.log('\n  ── Evaluación de Criterios ───────────────────────────────────');
  for (const r of results) {
    const p95 = r.stats.p95;
    const icon = p95 <= 200 ? '✅' : p95 <= 500 ? '⚠️ ' : '❌';
    console.log(`  ${icon}  ${r.label.padEnd(34)}  p95=${p95.toFixed(1)}ms  ${p95 <= 200 ? '(ÓPTIMO)' : p95 <= 500 ? '(ACEPTABLE)' : '(LENTO)'}`);
  }

  console.log('\n  Criterios: ≤200ms = Óptimo | 200-500ms = Aceptable | >500ms = Lento\n');
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
