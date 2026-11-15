/**
 * ============================================================================
 * RUN ALL TESTS — Orquestador de la Suite Completa de Pruebas
 * ============================================================================
 * Ejecuta secuencialmente todos los tests y genera un resumen consolidado.
 * ============================================================================
 */

import { execSync, spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Crear carpeta de resultados ──────────────────────────────────────────────
const resultsDir = './results';
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

// ─── Lista de tests ───────────────────────────────────────────────────────────
const TESTS = [
  { file: 'test_api_latency.js',    name: 'Latencia API REST',                   result: 'api_latency.json' },
  { file: 'test_mqtt_latency.js',   name: 'Latencia & Pérdida de Paquetes MQTT', result: 'mqtt_latency.json' },
  { file: 'test_sse_realtime.js',   name: 'Latencia SSE (Tiempo Real)',           result: 'sse_realtime.json' },
  { file: 'test_load_stress.js',    name: 'Carga & Estrés (API)',                 result: 'load_stress.json' },
  { file: 'test_availability.js',   name: 'Disponibilidad del Sistema (20s)',     result: 'availability.json' },
  { file: 'test_resource_usage.js', name: 'Consumo de Recursos (CPU / Memoria)',  result: 'resource_usage.json' },
  { file: 'test_packet_loss.js',    name: 'Pérdida de Paquetes & Escritura DB',  result: 'packet_loss_db.json' },
  { file: 'test_mode_state.js',     name: 'Cambio de Modo & Control de Luz',     result: 'mode_state_change.json' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function runTest(file) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(66)}`);
    console.log(`  Ejecutando: ${file}`);
    console.log(`${'═'.repeat(66)}`);

    const t0 = Date.now();
    const child = spawn('node', [file], { stdio: 'inherit' });

    child.on('close', (code) => {
      const duration = ((Date.now() - t0) / 1000).toFixed(1);
      const success  = code === 0;
      console.log(`\n  ${success ? '✅' : '❌'} Finalizado en ${duration}s (exit code: ${code})`);
      resolve({ file, success, durationS: +duration });
    });
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   LUMINA IOT — SUITE COMPLETA DE PRUEBAS EXPERIMENTALES          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Fecha: ${new Date().toLocaleString('es-VE')}`);
  console.log(`  Tests: ${TESTS.length}\n`);

  const summary = [];

  // ── Ejecutar cada test secuencialmente ───────────────────────────────────
  for (const t of TESTS) {
    const r = await runTest(t.file);
    summary.push({ ...t, ...r });
    await sleep(2000); // Pausa entre tests
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      RESUMEN GENERAL                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  let passed = 0, failed = 0;
  for (const r of summary) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon}  ${r.name.padEnd(42)} ${r.durationS.toFixed(1).padStart(6)}s`);
    if (r.success) passed++; else failed++;
  }

  console.log(`\n  Total: ${passed} pasados, ${failed} fallidos\n`);
  console.log('  Resultados individuales en: tests/results/\n');

  // ── Guardar resumen de la ejecución ──────────────────────────────────────
  const outputSummary = {
    timestamp: new Date().toISOString(),
    totalTests: TESTS.length,
    passed,
    failed,
    tests: summary,
  };
  writeFileSync('./results/summary.json', JSON.stringify(outputSummary, null, 2));
  console.log('  📄 Resumen guardado en: tests/results/summary.json\n');
}

main().catch((err) => { console.error('Error en orquestador:', err.message); process.exit(1); });
