# Contrato MQTT — SILA (Sistema de Iluminación Adaptativa)

| | |
|---|---|
| **Versión** | 0.1 (borrador para revisión del equipo) |
| **Tarea** | T-03 |
| **Aplica a** | `simulator/` (mqtt.js), `firmware/` (PubSubClient), `backend/` (mqtt.js) |
| **Broker** | Mosquitto 2.0.22, MQTT 3.1.1, puerto 1883 |

Este documento fija qué mensajes se intercambian, por qué topic y con qué formato. El simulador, el firmware y el backend deben cumplirlo tal cual: si los tres lo respetan, cambiar el simulador por el ESP32 real no requiere tocar el backend ni la web.

Los puntos marcados con **[Decisión]** no venían definidos en la tarea. Son la propuesta de este documento y deben validarse en equipo.

---

## 1. Convenciones

- **Prefijo raíz:** `sila`. Debe ser configurable (`MQTT_TOPIC_PREFIX`), porque en un broker público de prueba (T-08) hay que usar un prefijo único, por ejemplo `sila-g24-x7k2`.
- **`deviceId`:** minúsculas, números y guiones (`[a-z0-9-]`), sin espacios. `sim-01`, `sim-02`… para nodos virtuales y `esp32-01`, `esp32-02`… para nodos físicos.
- **Formato:** todos los mensajes son JSON en UTF-8, excepto `status`, que es texto plano.
- **Nombres de campos:** en inglés y `camelCase`.
- **Fechas:** ISO 8601 en UTC, con `Z` al final (`2026-10-01T10:00:00Z`).
- **Campos desconocidos:** el receptor los ignora. Así se pueden agregar campos sin romper versiones anteriores.
- **Tamaño:** cada mensaje debe ocupar menos de 400 bytes. PubSubClient usa por defecto un búfer de 256 bytes (topic + mensaje), por lo que el firmware debe llamar a `client.setBufferSize(512)`.

## 2. Resumen de topics

| Topic | Publica | Se suscribe | QoS | Retenido | Contenido |
|---|---|---|---|---|---|
| `sila/{deviceId}/telemetry` | Nodo | Backend | 0 | No | Lecturas y estado actual del nodo |
| `sila/{deviceId}/status` | Nodo y broker (LWT) | Backend | 1 | Sí | `online` u `offline` |
| `sila/{deviceId}/cmd/light` | Backend | Nodo | 1 | No | Encender o apagar (modo manual) |
| `sila/{deviceId}/cmd/mode` | Backend | Nodo | 1 | No | Cambiar a `auto` o `manual` |
| `sila/{deviceId}/config` | Backend | Nodo | 1 | Sí | Umbrales, tiempo de apagado y horario (SP3) |

El backend se suscribe con comodines: `sila/+/telemetry` y `sila/+/status`.
Cada nodo se suscribe solo a lo suyo: `sila/{deviceId}/cmd/#` y `sila/{deviceId}/config`.

> **Limitación de PubSubClient 2.8.0:** la librería solo publica en QoS 0 (sí puede suscribirse en QoS 1 y registrar el LWT con QoS 1). Por eso el firmware publica `online` en QoS 0 con retención; el simulador y el backend, con mqtt.js, usan el QoS de la tabla. Esto no afecta al contrato: `telemetry` ya es QoS 0 y el `offline` lo publica el broker.

---

## 3. `telemetry` — nodo → backend

**Topic:** `sila/{deviceId}/telemetry` · QoS 0 · no retenido

```json
{
  "deviceId": "sim-01",
  "presence": true,
  "lightLevel": 42,
  "light": "off",
  "mode": "manual",
  "ts": "2026-10-01T10:00:00Z"
}
```

| Campo | Tipo | Valores | Obligatorio | Descripción |
|---|---|---|---|---|
| `deviceId` | string | igual al del topic | Sí | Identificador del nodo |
| `presence` | boolean | `true` / `false` | Sí | Lectura actual del sensor PIR (movimiento detectado ahora) |
| `lightLevel` | integer | 0 a 100 | Sí | Luz ambiental. **0 = oscuro, 100 = máxima luz** |
| `light` | string | `"on"` / `"off"` | Sí | Estado real de la luminaria (del relé) |
| `mode` | string | `"auto"` / `"manual"` | Sí | Modo de operación actual |
| `ts` | string | ISO 8601 UTC | Sí* | Momento de la lectura |

**Cuándo se publica:**

1. **Al cambiar** `presence`, `light` o `mode`.
2. **Al cambiar `lightLevel` en 5 puntos o más** respecto al último valor publicado. **[Decisión]** Sin esta banda, el ruido del ADC generaría un mensaje en cada lectura.
3. **Como latido cada 10 s**, aunque nada haya cambiado.
4. **Inmediatamente después de ejecutar un comando** (ver sección 5.3).

No se publica más de un mensaje por segundo, salvo en el caso 4. **[Decisión]**

**Notas:**

- `presence` es la lectura directa del sensor. El tiempo de apagado sin presencia es interno del nodo y se describe en `decision-rules.md`.
- `lightLevel` siempre crece con la luz. Si el divisor de voltaje del LDR entrega la lectura invertida, el firmware la invierte antes de publicar. La conversión del ADC (0 a 4095) a la escala 0–100 es responsabilidad del firmware.
- \* **`ts` en el ESP32 [Decisión]:** el firmware sincroniza la hora por NTP al arrancar. Si aún no tiene hora válida, omite `ts` y el backend usa la hora de recepción.

## 4. `status` — conexión del nodo

**Topic:** `sila/{deviceId}/status` · QoS 1 · **retenido** · texto plano

| Valor | Quién lo publica | Cuándo |
|---|---|---|
| `online` | El nodo | Justo después de conectarse al broker |
| `offline` | El broker (LWT) | Cuando el nodo se desconecta sin avisar |

**Configuración de la conexión del nodo:**

| Parámetro | Valor |
|---|---|
| Keepalive | 15 s |
| LWT – topic | `sila/{deviceId}/status` |
| LWT – mensaje | `offline` |
| LWT – QoS / retenido | 1 / sí |
| Client ID | igual al `deviceId` |
| Clean session | `true` |

Con keepalive de 15 s, el broker declara al nodo desconectado tras unos 22 s sin recibir nada (1,5 × keepalive). Ese es el tiempo máximo que la web tardará en mostrar el nodo como desconectado.

Si el nodo se apaga de forma ordenada (por ejemplo, al cerrar el simulador con Ctrl+C), publica `offline` él mismo antes de desconectarse. **[Decisión]**

## 5. Comandos — backend → nodo

### 5.1. `cmd/light`

**Topic:** `sila/{deviceId}/cmd/light` · QoS 1 · no retenido

```json
{ "state": "on" }
```

| Campo | Tipo | Valores | Obligatorio |
|---|---|---|---|
| `state` | string | `"on"` / `"off"` | Sí |

**[Decisión]** Este comando solo se aplica en modo `manual`. Si llega estando en `auto`, el nodo **lo ignora** y publica su telemetría actual. Para encender o apagar a mano, primero hay que enviar `cmd/mode` con `manual`. En la web, el botón de encendido debe estar deshabilitado en modo automático.

### 5.2. `cmd/mode`

**Topic:** `sila/{deviceId}/cmd/mode` · QoS 1 · no retenido

```json
{ "mode": "manual" }
```

| Campo | Tipo | Valores | Obligatorio |
|---|---|---|---|
| `mode` | string | `"auto"` / `"manual"` | Sí |

- Al pasar a `manual`, la luminaria **conserva el estado que tenía**.
- Al pasar a `auto`, el nodo aplica de inmediato las reglas de decisión.

### 5.3. Confirmación de comandos **[Decisión]**

No hay un topic de respuesta. El nodo confirma un comando **publicando una telemetría inmediata** con el nuevo `light` o `mode`.

- La web muestra siempre el estado que llega por telemetría, no el que se envió.
- Si el backend no recibe esa telemetría en **3 s**, considera el comando como no confirmado y la API responde con error.

### 5.4. Nodo desconectado **[Decisión]**

Los comandos **no se retienen** y el nodo usa `clean session`, así que un comando enviado a un nodo desconectado se pierde. Es intencional: no queremos que una orden de hace una hora se ejecute al reconectar.

Antes de publicar un comando, el backend verifica el último `status` del nodo. Si es `offline`, no publica y la API responde `409 Conflict`.

## 6. `config` — backend → nodo (se implementa en el SP3)

**Topic:** `sila/{deviceId}/config` · QoS 1 · **retenido**

El topic queda reservado desde ahora. Al ser retenido, el nodo recibe la configuración vigente cada vez que se conecta, por lo que no necesita guardarla en memoria permanente.

```json
{
  "lightOnThreshold": 30,
  "lightOffThreshold": 60,
  "offDelaySec": 300,
  "schedule": { "enabled": false, "start": "07:00", "end": "22:00" }
}
```

| Campo | Tipo | Valores | Por defecto | Descripción |
|---|---|---|---|---|
| `lightOnThreshold` | integer | 0 a 100 | 30 | Se enciende si `lightLevel` es **menor** |
| `lightOffThreshold` | integer | 0 a 100, mayor que el anterior | 60 | Se apaga si `lightLevel` es **mayor** |
| `offDelaySec` | integer | 5 a 3600 | 300 | Segundos sin presencia antes de apagar |
| `schedule.enabled` | boolean | | `false` | Si es `false`, el horario no se aplica |
| `schedule.start` | string | `HH:MM` | `"07:00"` | Inicio del horario |
| `schedule.end` | string | `HH:MM` | `"22:00"` | Fin del horario |

- El mensaje siempre lleva la configuración **completa**, no solo lo que cambió.
- El horario está en **hora local de Bolivia (UTC−4)**. Si `start` es mayor que `end`, el horario cruza la medianoche.
- Hasta el SP3, el nodo usa los valores por defecto de la tabla. En el simulador, `offDelaySec` por defecto es 30 para agilizar las pruebas.

## 7. Mensajes inválidos **[Decisión]**

El receptor **ignora** el mensaje y lo registra en su log (consola serie en el firmware, consola en el simulador y el backend) cuando:

- no es JSON válido;
- falta un campo obligatorio;
- un campo tiene un valor fuera de los permitidos (por ejemplo, `"state": "ON"` en mayúsculas o `"mode": "automatico"`);
- en `config`, `lightOffThreshold` no es mayor que `lightOnThreshold`.

No se envía ninguna respuesta de error por MQTT. Un mensaje inválido nunca debe cambiar el estado del relé ni reiniciar el nodo.

## 8. Seguridad

- **Fase 1 (todo en un mismo equipo):** Mosquitto en `localhost`, sin autenticación.
- **Fase 2 (ESP32 en la red):** usuario y contraseña en Mosquitto (`allow_anonymous false`). Las credenciales van en un archivo de configuración fuera de Git.
- **Broker público de prueba (T-08):** solo datos de ejemplo, prefijo único y nunca credenciales reales.
- **TLS (puerto 8883):** recomendado para un despliegue real; no se implementa en el prototipo.

## 9. Cómo probar

Con Mosquitto corriendo en local, en dos terminales:

```bash
# Terminal 1: ver todo lo que pasa por el sistema
mosquitto_sub -h localhost -t "sila/#" -v

# Terminal 2: simular la telemetría de un nodo
mosquitto_pub -h localhost -t sila/sim-01/telemetry -m '{"deviceId":"sim-01","presence":true,"lightLevel":42,"light":"off","mode":"manual","ts":"2026-10-01T10:00:00Z"}'

# Marcar el nodo como conectado (retenido)
mosquitto_pub -h localhost -t sila/sim-01/status -r -q 1 -m online

# Enviar comandos
mosquitto_pub -h localhost -t sila/sim-01/cmd/mode  -q 1 -m '{"mode":"manual"}'
mosquitto_pub -h localhost -t sila/sim-01/cmd/light -q 1 -m '{"state":"on"}'

# Borrar un mensaje retenido
mosquitto_pub -h localhost -t sila/sim-01/status -r -n
```

En el `cmd` de Windows las comillas simples no funcionan: use comillas dobles y escape las internas (`"{\"state\":\"on\"}"`), o ejecute los comandos desde Git Bash o PowerShell.

## 10. Decisiones por validar en equipo

| # | Decisión propuesta | Alternativa |
|---|---|---|
| 1 | `cmd/light` se ignora en modo `auto` | Que cambie automáticamente a `manual` |
| 2 | El comando se confirma con una telemetría inmediata; 3 s de espera | Topic de respuesta dedicado (`cmd/ack`) |
| 3 | Si el nodo está `offline`, el backend no publica y responde 409 | Encolar el comando hasta que reconecte |
| 4 | `lightLevel` se publica al cambiar 5 puntos o más | Otro valor de banda |
| 5 | Sin hora NTP, el nodo omite `ts` y el backend usa la hora de recepción | Que el backend siempre ponga la hora |
| 6 | Horario en hora local de Bolivia | Horario en UTC |

## 11. Historial de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 2026-10-02 | Primera versión para revisión del equipo |
