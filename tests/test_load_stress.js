/**
 * ============================================================================
 * TEST 3 - Prueba de Carga y Estrés de la API REST
 * ============================================================================
 * Envía múltiples peticiones HTTP concurrentes al backend para medir:
 *  - Comportamiento bajo carga paralela
 *  - Degradación de latencia en cargas crecientes
 *  - Tasa de errores bajo estrés
 *  - Tiempo hasta primer error (si lo hay)
 *
 * Fases:
 *   Fase 1: Carga ligera    → 5  peticiones paralelas × 10 rondas
 *   Fase 2: Carga media     → 20 peticiones paralelas × 10 rondas
 *   Fase 3: Carga alta      → 50 peticiones paralelas × 5 rondas
 *   Fase 4: Pico de estrés  → 100 peticiones paralelas × 3 rondas
 * ============================================================================
 */

import http from 'node:http';

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL    = 'http://localhost:3001';
const CREDENTIALS = { username: 'testadmin', password: 'Lumina#Test2026!' };

const PHASES = [
  { name: 'Ligera',      concurrency: 5,   rounds: 10 },
  { name: 'Media',       concurrency: 20,  rounds: 10 },
  { name: 'Alta',        concurrency: 50,  rounds: 5  },
  { name: 'Pico (Estrés)', concurrency: 100, rounds: 3 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token)   headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const opts = { hostname: 'localhost', port: 3001, path, method, headers };

    const t0 = performance.now();
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        resolve({ status: res.statusCode, latency: performance.now() - t0 });
      });
    });
    req.on('error', () => resolve({ status: 0, latency: performance.now() - t0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

function stats(samples) {
  if (!samples.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    min: sorted[0],
    max: sorted[n - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.floor(n * 0.50)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 3 — Prueba de Carga y Estrés (API REST)               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Servidor: ${BASE_URL}\n`);

  // ── Paso 1: Login ─────────────────────────────────────────────────────────
  process.stdout.write('  Obteniendo token JWT... ');
  const loginRes = await request('POST', '/api/auth/login', CREDENTIALS, null);
  const token = loginRes.body ? JSON.parse('{"x":1}').x : null;

  // Re-obtener token con parsing correcto
  const tokenRes = await new Promise((resolve) => {
    const payload = JSON.stringify(CREDENTIALS);
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });

  const authToken = tokenRes?.token;
  if (!authToken) {
    console.error('\n  ❌ No se pudo obtener token. Verifica credenciales.');
    console.error('  Sugerencia: crea usuario con: npm --prefix backend run create-admin\n');
    process.exit(1);
  }
  console.log('OK\n');

  const allPhaseResults = [];

  // ── Paso 2: Ejecutar fases ────────────────────────────────────────────────
  for (const phase of PHASES) {
    console.log(`  ── Fase: ${phase.name.padEnd(16)} (${phase.concurrency} concurrentes × ${phase.rounds} rondas) ──`);

    const allLatencies = [];
    let totalReqs = 0;
    let totalErrors = 0;
    let totalRateLimit = 0;
    const phaseStart = performance.now();

    for (let round = 0; round < phase.rounds; round++) {
      // Disparar todas las peticiones concurrentes a la vez
      const batch = Array.from({ length: phase.concurrency }, () =>
        request('GET', '/api/nodes', null, authToken)
      );
      const responses = await Promise.all(batch);

      for (const r of responses) {
        totalReqs++;
        allLatencies.push(r.latency);
        if (r.status === 429) totalRateLimit++;
        else if (r.status < 200 || r.status >= 300) totalErrors++;
      }

      // Pequeña pausa entre rondas para no colapsar completamente
      await new Promise(r => setTimeout(r, 100));
    }

    const phaseDuration = performance.now() - phaseStart;
    const s = stats(allLatencies);
    const errorPct = ((totalErrors / totalReqs) * 100).toFixed(1);
    const ratePct  = ((totalRateLimit / totalReqs) * 100).toFixed(1);
    const rps = (totalReqs / (phaseDuration / 1000)).toFixed(1);

    const result = {
      phase:       phase.name,
      concurrency: phase.concurrency,
      rounds:      phase.rounds,
      totalReqs,
      errors:      totalErrors,
      rateLimit:   totalRateLimit,
      errorPct:    +errorPct,
      ratePct:     +ratePct,
      rps:         +rps,
      durationMs:  +phaseDuration.toFixed(0),
      latency_ms: {
        min: +s.min.toFixed(2),
        avg: +s.avg.toFixed(2),
        p50: +s.p50.toFixed(2),
        p95: +s.p95.toFixed(2),
        p99: +s.p99.toFixed(2),
        max: +s.max.toFixed(2),
      },
    };

    allPhaseResults.push(result);

    const statusIcon = totalErrors === 0 && +ratePct === 0 ? '✅' : '⚠️ ';
    console.log(
      `  ${statusIcon}  Total=${totalReqs}  RPS=${rps}  avg=${s.avg.toFixed(0)}ms  p95=${s.p95.toFixed(0)}ms  ` +
      `errores=${errorPct}%  rateLimit=${ratePct}%\n`
    );
  }

  // ── Resumen tabular ───────────────────────────────────────────────────────
  console.log('  ── Resumen Comparativo de Fases ──────────────────────────────');
  console.log(`  ${'Fase'.padEnd(20)} ${'Concurr'.padStart(8)} ${'avg(ms)'.padStart(9)} ${'p95(ms)'.padStart(9)} ${'RPS'.padStart(7)} ${'Errores%'.padStart(10)}`);
  console.log(`  ${'-'.repeat(70)}`);
  for (const r of allPhaseResults) {
    const warn = r.errorPct > 0 ? ' ⚠️' : '';
    console.log(
      `  ${r.phase.padEnd(20)}` +
      `${String(r.concurrency).padStart(8)}` +
      `${r.latency_ms.avg.toFixed(0).padStart(9)}` +
      `${r.latency_ms.p95.toFixed(0).padStart(9)}` +
      `${r.rps.toFixed(0).padStart(7)}` +
      `${r.errorPct.toFixed(1).padStart(10)}%${warn}`
    );
  }
  console.log('');

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:      'load_stress',
    timestamp: new Date().toISOString(),
    server:    BASE_URL,
    phases:    allPhaseResults,
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/load_stress.json', JSON.stringify(output, null, 2));
    console.log('  📄 Resultados guardados en: tests/results/load_stress.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
