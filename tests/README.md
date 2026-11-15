## Lumina IoT — Tests de Rendimiento y Funcionalidad

> **Suite experimental para demostrar el comportamiento real del sistema**

### ¿Qué se mide?

| Test | Archivo | Indicadores |
|------|---------|------------|
| 1. Latencia API REST | `test_api_latency.js` | RTT HTTP, p95, p99, tasa de éxito |
| 2. Latencia MQTT | `test_mqtt_latency.js` | RTT MQTT, pérdida de paquetes, QoS 0 vs 1 |
| 3. Carga y Estrés | `test_load_stress.js` | RPS, latencia bajo concurrencia, errores |
| 4. Disponibilidad | `test_availability.js` | Uptime %, interrupciones, tiempo de recuperación |
| 5. SSE / Tiempo Real | `test_sse_realtime.js` | Latencia MQTT→Backend→Cliente |
| 6. Recursos (CPU/RAM) | `test_resource_usage.js` | RSS, Heap, CPU delta bajo carga |
| 7. Pérdida de Paquetes | `test_packet_loss.js` | Paquetes procesados en DB por tasa |
| 8. Cambio de Estado | `test_mode_state.js` | Tiempo de confirmación modo/luz |

---

### Requisitos previos

```bash
# El backend debe estar corriendo en localhost:3001
# El simulador MQTT debe estar activo (sim-01, sim-02 online)

# Instalar dependencia MQTT para los tests:
cd tests
npm install
```

> **Credenciales**: Edita la variable `CREDENTIALS` en cada archivo de test  
> con un usuario admin válido del sistema.  
> Crear admin con: `npm --prefix backend run create-admin`

---

### Ejecución

```bash
# Desde la raíz del proyecto
cd tests

# Test individual:
node test_api_latency.js
node test_mqtt_latency.js
node test_load_stress.js
node test_availability.js    # dura ~2 minutos
node test_sse_realtime.js
node test_resource_usage.js  # dura ~1.5 minutos
node test_packet_loss.js
node test_mode_state.js      # requiere nodo sim-01 online

# Suite completa (secuencial, ~8 minutos):
node run_all_tests.js
```

---

### Resultados

Los resultados JSON se guardan automáticamente en `tests/results/`:

```
tests/results/
├── api_latency.json
├── mqtt_latency.json
├── load_stress.json
├── availability.json
├── sse_realtime.json
├── resource_usage.json
├── packet_loss_db.json
├── mode_state_change.json
└── summary.json          ← generado por run_all_tests.js
```

---

### Criterios de evaluación

| Indicador | Óptimo | Aceptable | Crítico |
|-----------|--------|-----------|---------|
| Latencia API (p95) | ≤ 200ms | ≤ 500ms | > 500ms |
| Latencia MQTT RTT (avg) | ≤ 50ms | ≤ 200ms | > 200ms |
| Pérdida de paquetes MQTT | 0% | ≤ 1% | > 1% |
| Disponibilidad | ≥ 99.9% | ≥ 99% | < 99% |
| Latencia SSE end-to-end | ≤ 100ms | ≤ 300ms | > 300ms |
| Crecimiento de Heap (carga alta) | < 20MB | < 50MB | > 50MB |
