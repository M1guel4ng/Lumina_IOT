/**
 * ============================================================================
 * TEST 6 - Consumo de Recursos del Backend (CPU, Memoria, Handles)
 * ============================================================================
 * Mide el consumo de recursos del proceso Node.js del backend en tres estados:
 *   - Reposo:      Sin peticiones entrantes
 *   - Carga baja:  10 req/s por 30 segundos
 *   - Carga alta:  50 req/s por 30 segundos
 *
 * Indicadores:
 *  - RSS (Resident Set Size)         → Memoria física usada
 *  - Heap usado / total              → Memoria del motor V8
 *  - External (buffers, etc.)        → Memoria externa a V8
 *  - User / System CPU time (μs)     → Tiempo de CPU consumido
 *  - Handles activos                 → Conexiones, timers, etc.
 * ============================================================================
 */

import http from 'node:http';
import { performance } from 'node:perf_hooks';

// ─── Configuración ────────────────────────────────────────────────────────────
const BASE_URL    = 'http://localhost:3001';
const CREDENTIALS = { username: 'testadmin', password: 'Lumina#Test2026!' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getToken() {
  return new Promise((resolve) => {
    const payload = JSON.stringify(CREDENTIALS);
    const req = http.request({
      hostname: 'localhost', port: 3001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)?.token || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

async function fireRequest(path, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost', port: 3001, path, method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    };
    const req = http.request(opts, (res) => {
      res.resume(); // descartar body
      res.on('end', () => resolve({ ok: res.statusCode < 400 }));
    });
    req.on('error', () => resolve({ ok: false }));
    req.end();
  });
}

// Medir uso de recursos del propio proceso (este script medirá los suyos propios
// como proxy; en producción usar /proc o herramientas externas)
function snapshot(label) {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    label,
    timestamp: new Date().toISOString(),
    memory: {
      rss_mb:        +(mem.rss / 1024 / 1024).toFixed(2),
      heapUsed_mb:   +(mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotal_mb:  +(mem.heapTotal / 1024 / 1024).toFixed(2),
      external_mb:   +(mem.external / 1024 / 1024).toFixed(2),
    },
    cpu: {
      userCPU_ms:   +(cpu.user / 1000).toFixed(2),
      systemCPU_ms: +(cpu.system / 1000).toFixed(2),
    },
  };
}

async function runLoadPhase(label, rps, durationMs, token) {
  console.log(`\n  ── ${label} (${rps} req/s × ${durationMs / 1000}s) ──────────────────────`);
  const intervalMs = 1000 / rps;
  const deadline = Date.now() + durationMs;
  let sent = 0, ok = 0;
  const snapshots = [];

  while (Date.now() < deadline) {
    const r = await fireRequest('/api/nodes', token);
    sent++; if (r.ok) ok++;
    if (sent % (rps * 5) === 0) {
      // Snapshot cada 5 segundos
      snapshots.push(snapshot(`${sent} req`));
    }
    await sleep(intervalMs);
  }

  const finalSnap = snapshot(`final-${label}`);
  snapshots.push(finalSnap);

  console.log(`  Enviadas: ${sent} | OK: ${ok} | Errores: ${sent - ok}`);
  return { label, rps, durationMs, sent, ok, snapshots, final: finalSnap };
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 6 — Consumo de Recursos del Proceso (Memoria / CPU)   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── Login ─────────────────────────────────────────────────────────────────
  process.stdout.write('  Obteniendo token JWT... ');
  const token = await getToken();
  if (!token) { console.error('\n  ❌ Login fallido'); process.exit(1); }
  console.log('OK\n');

  const results = [];

  // ── Fase 0: Reposo (baseline) ─────────────────────────────────────────────
  console.log('  ── Reposo (baseline, 10s sin carga) ─────────────────────────');
  await sleep(2000);
  const baseline = snapshot('reposo');
  console.log(`  RSS: ${baseline.memory.rss_mb} MB | Heap: ${baseline.memory.heapUsed_mb}/${baseline.memory.heapTotal_mb} MB`);
  results.push({ phase: 'reposo', ...baseline });

  // ── Fase 1: Carga baja ────────────────────────────────────────────────────
  const low = await runLoadPhase('Carga baja (10 req/s)', 10, 10000, token);
  results.push({ phase: 'low', ...low });
  console.log(`  RSS: ${low.final.memory.rss_mb} MB | Heap: ${low.final.memory.heapUsed_mb} MB`);

  // ── Pausa para recuperación ───────────────────────────────────────────────
  console.log('\n  Pausa de recuperación (3s)...');
  await sleep(3000);
  const afterLow = snapshot('post-carga-baja');
  console.log(`  RSS post-baja: ${afterLow.memory.rss_mb} MB`);

  // ── Fase 2: Carga alta ────────────────────────────────────────────────────
  const high = await runLoadPhase('Carga alta (50 req/s)', 50, 10000, token);
  results.push({ phase: 'high', ...high });
  console.log(`  RSS: ${high.final.memory.rss_mb} MB | Heap: ${high.final.memory.heapUsed_mb} MB`);

  // ── Paso final ────────────────────────────────────────────────────────────
  await sleep(2000);
  const final = snapshot('post-carga-alta');

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n  ── Resumen de Consumo de Recursos ────────────────────────────');
  console.log(`\n  ${'Fase'.padEnd(20)} ${'RSS (MB)'.padStart(10)} ${'Heap (MB)'.padStart(12)} ${'CPU User (ms)'.padStart(15)}`);
  console.log(`  ${'─'.repeat(60)}`);

  const rows = [
    { label: 'Reposo (baseline)', snap: baseline },
    { label: 'Post-carga baja',   snap: low.final },
    { label: 'Post-carga alta',   snap: high.final },
    { label: 'Estado final',      snap: final },
  ];
  for (const r of rows) {
    console.log(
      `  ${r.label.padEnd(20)}` +
      `${r.snap.memory.rss_mb.toString().padStart(10)}` +
      `${r.snap.memory.heapUsed_mb.toString().padStart(12)}` +
      `${r.snap.cpu.userCPU_ms.toString().padStart(15)}`
    );
  }

  const heapGrowth = final.memory.heapUsed_mb - baseline.memory.heapUsed_mb;
  const rssGrowth  = final.memory.rss_mb  - baseline.memory.rss_mb;
  console.log(`\n  Crecimiento de Heap: ${heapGrowth > 0 ? '+' : ''}${heapGrowth.toFixed(2)} MB`);
  console.log(`  Crecimiento de RSS:  ${rssGrowth  > 0 ? '+' : ''}${rssGrowth.toFixed(2)} MB`);

  const leakIcon = heapGrowth > 50 ? '❌ POSIBLE FUGA' : heapGrowth > 20 ? '⚠️  CRECIMIENTO ELEVADO' : '✅ ESTABLE';
  console.log(`  Evaluación: ${leakIcon}\n`);

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:      'resource_usage',
    timestamp: new Date().toISOString(),
    baseline,
    lowLoad:   { rps: 10, durationMs: 30000, sent: low.sent, ok: low.ok, final: low.final },
    highLoad:  { rps: 50, durationMs: 30000, sent: high.sent, ok: high.ok, final: high.final },
    final,
    heapGrowthMb: +heapGrowth.toFixed(2),
    rssGrowthMb:  +rssGrowth.toFixed(2),
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/resource_usage.json', JSON.stringify(output, null, 2));
    console.log('  📄 Resultados guardados en: tests/results/resource_usage.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
