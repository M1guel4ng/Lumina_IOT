/**
 * ============================================================================
 * TEST 2 - Latencia del Broker MQTT y Pérdida de Paquetes
 * ============================================================================
 * Mide el tiempo de ida y vuelta (RTT) de mensajes MQTT publicados al broker
 * público HiveMQ y recibidos en el mismo cliente (eco via suscripción).
 *
 * Indicadores calculados:
 *  - Latencia RTT mínima / máxima / promedio / p95 / p99 (ms)
 *  - Paquetes enviados vs recibidos
 *  - Tasa de pérdida de paquetes (%)
 *  - Tiempo entre primera reconexión
 *  - QoS 0 vs QoS 1 comparativa
 * ============================================================================
 */

import mqtt from 'mqtt';

// ─── Configuración ────────────────────────────────────────────────────────────
const BROKER_URL   = 'mqtt://broker.hivemq.com:1883';
const TEST_TOPIC   = `sila/test/latency/${Date.now()}`;
const ITERATIONS   = 60;      // paquetes a enviar
const INTER_MSG_MS = 200;     // separación entre mensajes (ms)
const TIMEOUT_MS   = 5000;    // timeout de recepción por mensaje

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stats(samples) {
  if (!samples.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, stddev: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const n   = sorted.length;
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  const stddev = Math.sqrt(sorted.reduce((acc, v) => acc + (v - avg) ** 2, 0) / n);
  return {
    min:    sorted[0],
    max:    sorted[n - 1],
    avg,
    p50:    sorted[Math.floor(n * 0.50)],
    p95:    sorted[Math.floor(n * 0.95)],
    p99:    sorted[Math.floor(n * 0.99)],
    stddev,
  };
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST 2 — Latencia MQTT & Pérdida de Paquetes               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Broker  : ${BROKER_URL}`);
  console.log(`  Tópico  : ${TEST_TOPIC}`);
  console.log(`  Paquetes: ${ITERATIONS}  |  Intervalo: ${INTER_MSG_MS}ms\n`);

  // ── Comparativa QoS 0 vs QoS 1 ───────────────────────────────────────────
  const qosLevels = [0, 1];
  const allResults = {};

  for (const qos of qosLevels) {
    console.log(`  ── QoS ${qos} ──────────────────────────────────────────────────`);
    const topic = `${TEST_TOPIC}/qos${qos}`;

    // Conectar cliente con ID único
    const clientId = `lumina-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const client = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0,  // sin reconexión automática en pruebas
    });

    await new Promise((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
      setTimeout(() => reject(new Error('Timeout de conexión')), 10000);
    });

    console.log('  ✅ Conectado al broker MQTT');

    // Suscribirse al tópico de eco
    await new Promise((resolve) => client.subscribe(topic, { qos }, () => resolve()));
    console.log(`  📡 Suscrito a: ${topic}`);

    const latencies = [];
    let sent = 0;
    let received = 0;
    let lost = 0;
    const pending = new Map();  // seq -> { sentAt, resolve, timer }

    // Listener de mensajes recibidos
    client.on('message', (_t, payload) => {
      const msg = JSON.parse(payload.toString());
      if (pending.has(msg.seq)) {
        const { sentAt, resolve: res, timer } = pending.get(msg.seq);
        clearTimeout(timer);
        pending.delete(msg.seq);
        const rtt = performance.now() - sentAt;
        latencies.push(rtt);
        received++;
        res();
      }
    });

    // Enviar paquetes secuencialmente
    for (let seq = 0; seq < ITERATIONS; seq++) {
      const sentAt = performance.now();
      const payload = JSON.stringify({ seq, sentAt, ts: new Date().toISOString() });

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(seq)) {
            pending.delete(seq);
            lost++;
            process.stdout.write('✗');
          }
          resolve();
        }, TIMEOUT_MS);

        pending.set(seq, { sentAt, resolve, timer });
        client.publish(topic, payload, { qos });
        sent++;
        process.stdout.write('.');
      });

      await sleep(INTER_MSG_MS);
    }

    console.log('');

    const s = stats(latencies);
    const lossPct = ((lost / sent) * 100).toFixed(2);

    console.log(`\n  Enviados:    ${sent}`);
    console.log(`  Recibidos:   ${received}`);
    console.log(`  Perdidos:    ${lost}  (${lossPct}%)`);
    console.log(`\n  Latencia RTT:`);
    console.log(`    Mínima:    ${s.min.toFixed(2)} ms`);
    console.log(`    Promedio:  ${s.avg.toFixed(2)} ms`);
    console.log(`    p50:       ${s.p50.toFixed(2)} ms`);
    console.log(`    p95:       ${s.p95.toFixed(2)} ms`);
    console.log(`    p99:       ${s.p99.toFixed(2)} ms`);
    console.log(`    Máxima:    ${s.max.toFixed(2)} ms`);
    console.log(`    Desv. Std: ${s.stddev.toFixed(2)} ms\n`);

    allResults[`qos${qos}`] = {
      qos,
      sent,
      received,
      lost,
      lossPct: +lossPct,
      latency_ms: {
        min:    +s.min.toFixed(2),
        avg:    +s.avg.toFixed(2),
        p50:    +s.p50.toFixed(2),
        p95:    +s.p95.toFixed(2),
        p99:    +s.p99.toFixed(2),
        max:    +s.max.toFixed(2),
        stddev: +s.stddev.toFixed(2),
      },
    };

    // Limpiar tópico retenido y desconectar
    client.publish(topic, '', { retain: true });
    await new Promise(r => client.end(false, {}, r));
    await sleep(500);
  }

  // ── Resumen comparativo ───────────────────────────────────────────────────
  console.log('  ── Comparativa QoS 0 vs QoS 1 ───────────────────────────────');
  for (const [key, r] of Object.entries(allResults)) {
    const lossIcon = r.lossPct == 0 ? '✅' : r.lossPct <= 2 ? '⚠️ ' : '❌';
    console.log(
      `  ${lossIcon}  ${key}  ` +
      `avg=${r.latency_ms.avg}ms  p95=${r.latency_ms.p95}ms  ` +
      `pérdida=${r.lossPct}%`
    );
  }

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  const output = {
    test:       'mqtt_latency',
    timestamp:  new Date().toISOString(),
    broker:     BROKER_URL,
    topic:      TEST_TOPIC,
    iterations: ITERATIONS,
    results:    allResults,
  };

  import('node:fs').then(({ writeFileSync }) => {
    writeFileSync('./results/mqtt_latency.json', JSON.stringify(output, null, 2));
    console.log('\n  📄 Resultados guardados en: tests/results/mqtt_latency.json\n');
  });
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
