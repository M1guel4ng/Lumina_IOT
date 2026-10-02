# Reglas de decisión — SILA (Sistema de Iluminación Adaptativa)

| | |
|---|---|
| **Versión** | 0.1 (borrador para revisión del equipo) |
| **Tarea** | T-04 |
| **Aplica a** | `simulator/` y `firmware/` (ambos deben comportarse igual) |
| **Relacionado** | `mqtt-contract.md` (nombres de campos y topics) |

Este documento define cuándo se enciende y cuándo se apaga la luminaria. La decisión se toma **en el nodo** (ESP32 o simulador), no en el backend: así la luz sigue funcionando aunque se caiga la red. El backend solo registra, muestra y reenvía las órdenes del usuario.

Los puntos marcados con **[Decisión]** son la propuesta de este documento y deben validarse en equipo.

---

## 1. Entradas

| Entrada | Origen | Valores |
|---|---|---|
| `presence` | Sensor PIR | `true` / `false` |
| `lightLevel` | Sensor LDR | 0 (oscuro) a 100 (máxima luz) |
| `mode` | Comando `cmd/mode` | `auto` / `manual` |
| Horario | `config.schedule` y hora local | dentro / fuera |
| Conexión | Estado de Wi-Fi y MQTT | conectado / desconectado |

## 2. Parámetros

| Parámetro | Campo en `config` | Simulador | ESP32 | Descripción |
|---|---|---|---|---|
| Umbral de encendido | `lightOnThreshold` | 30 | 30 (a calibrar) | Enciende si `lightLevel` es menor |
| Umbral de apagado | `lightOffThreshold` | 60 | 60 (a calibrar) | Apaga si `lightLevel` es mayor |
| Tiempo de apagado | `offDelaySec` | 30 s | 300 s | Tiempo sin presencia antes de apagar |
| Estabilización del PIR | — | 0 s | 60 s | Tras arrancar, se ignora el PIR |
| Reintento de conexión | — | 5 s | 5 s | Intervalo entre reintentos |
| Retorno a automático | — | 10 min | 10 min | Tiempo sin conexión en modo manual |

Son valores iniciales. Los umbrales del ESP32 se calibran con el LDR instalado (sección 5).

## 3. Variables derivadas

Las reglas no usan `presence` y `lightLevel` directamente, sino dos variables calculadas.

### 3.1. `occupied` (ambiente ocupado)

El PIR detecta **movimiento**, no presencia: una persona sentada y quieta deja de ser detectada. Por eso:

- Cada vez que `presence` es `true`, se guarda el momento (`lastPresenceAt`).
- `occupied` es `true` si `presence` es `true` **o** si pasaron menos de `offDelaySec` segundos desde `lastPresenceAt`.
- `occupied` pasa a `false` solo cuando vence ese tiempo sin nuevas detecciones.

### 3.2. Histéresis de luz

Se usan **dos umbrales**, y cuál se aplica depende de si la luminaria está encendida o apagada:

| Luminaria ahora | Condición | Resultado |
|---|---|---|
| Apagada | `lightLevel` < 30 | Hace falta luz → puede encenderse |
| Apagada | `lightLevel` ≥ 30 | No hace falta → sigue apagada |
| Encendida | `lightLevel` ≤ 60 | Sigue encendida |
| Encendida | `lightLevel` > 60 | Sobra luz → se apaga |

**Por qué:** con un solo umbral, al encender la luminaria el LDR mide su luz, concluye que ya no hace falta y la apaga; al apagarse vuelve a faltar luz y se enciende otra vez. El resultado es un parpadeo continuo. Entre 30 y 60 el sistema **no cambia nada**: mantiene el estado que tenía.

## 4. Tabla de decisión

El guion (—) significa «no importa».

| # | Modo | Horario | `occupied` | Luz ambiental | Luminaria ahora | → Relé |
|---|---|---|---|---|---|---|
| 1 | manual | — | — | — | — | **El último `cmd/light`** |
| 2 | auto | fuera | — | — | — | **OFF** |
| 3 | auto | dentro | no | — | — | **OFF** |
| 4 | auto | dentro | sí | < 30 | apagada | **ON** |
| 5 | auto | dentro | sí | ≥ 30 | apagada | **OFF** (sigue apagada) |
| 6 | auto | dentro | sí | ≤ 60 | encendida | **ON** (sigue encendida) |
| 7 | auto | dentro | sí | > 60 | encendida | **OFF** |

Las reglas se evalúan de arriba hacia abajo y se aplica la primera que coincide. Se evalúan al menos **una vez por segundo** y cada vez que cambia una entrada.

### 4.1. Modo manual

- La luminaria obedece **solo** a `cmd/light`. Se ignoran los sensores y el horario.
- Al entrar en modo manual, la luminaria **conserva el estado que tenía**.
- Al volver a `auto`, se aplican de inmediato las reglas 2 a 7.
- En modo manual el nodo sigue leyendo los sensores y publicando telemetría, para que la web siga mostrando presencia y luz.

### 4.2. Horario **[Decisión]**

- Fuera del horario, en modo automático, la luminaria **no se enciende sola** y, si estaba encendida, se apaga (regla 2).
- El horario **no afecta al modo manual**: el usuario siempre puede encender desde la web.
- Si `schedule.enabled` es `false` (valor por defecto), se considera siempre «dentro de horario».
- Si el nodo no conoce la hora (sin NTP), se considera «dentro de horario». Es preferible que la luz funcione a que quede bloqueada por un fallo del reloj.
- El horario se implementa en el SP3. Hasta entonces, el nodo se comporta como «siempre dentro de horario».

## 5. Calibración de los umbrales

La histéresis solo funciona si **la distancia entre los dos umbrales es mayor que lo que aporta la propia luminaria** a la lectura del LDR. Procedimiento para el prototipo físico:

1. Con el ambiente oscuro y la luminaria apagada, anotar `lightLevel` (valor A).
2. Encender la luminaria y anotar `lightLevel` (valor B).
3. El aporte de la luminaria es B − A.
4. Elegir `lightOffThreshold` ≥ `lightOnThreshold` + (B − A) + 10.

Además, el LDR debe orientarse hacia la entrada de luz natural (ventana) y **fuera del haz directo de la luminaria**. Cuanto menor sea el aporte de la luminaria a la lectura, mejor funciona el control.

Ejemplo: si A = 10 y B = 35, el aporte es 25. Con `lightOnThreshold` = 30, el umbral de apagado debe ser al menos 30 + 25 + 10 = 65.

## 6. Arranque del nodo **[Decisión]**

Al encender o reiniciar:

1. El relé arranca en **OFF**.
2. El modo arranca en **`auto`** (el modo no se guarda entre reinicios).
3. Se usan los parámetros por defecto hasta recibir `config` (que es un mensaje retenido y llega al conectarse).
4. En el ESP32, durante los primeros **60 s** se ignora el PIR, porque el HC-SR501 da lecturas falsas mientras se estabiliza. En ese lapso `occupied` es `false`.

## 7. Pérdida de conexión

La lógica de decisión **nunca depende de la red**.

| Situación | Comportamiento |
|---|---|
| Sin conexión, en modo `auto` | Sigue aplicando las reglas con los sensores y la última configuración recibida. |
| Sin conexión, en modo `manual` | Mantiene el estado actual de la luminaria. |
| Sin conexión en `manual` durante más de 10 min | Vuelve solo a `auto`. Evita que la luminaria quede encendida sin que nadie pueda apagarla. **[Decisión]** |
| Reintentos | Cada 5 s, sin bloquear el bucle principal: los sensores se siguen leyendo mientras se reintenta. |
| Al reconectar | Publica `online`, vuelve a suscribirse y publica una telemetría con el estado actual. |

El broker publica `offline` por el LWT cuando el nodo se cae (ver `mqtt-contract.md`), y la web debe mostrar el nodo como desconectado y deshabilitar los controles.

## 8. Pseudocódigo de referencia

```text
every loop (at least once per second):
    now = currentTime()

    if presence == true:
        lastPresenceAt = now
    occupied = presence OR (now - lastPresenceAt < offDelaySec)
    if now - bootAt < pirWarmupSec:
        occupied = false

    if mode == "manual":
        if disconnectedFor > 10 min:
            mode = "auto"
        else:
            relay = lastManualCommand          # rule 1
            return

    if not inSchedule(now):                    # rule 2
        relay = OFF
    else if not occupied:                      # rule 3
        relay = OFF
    else if relay == OFF and lightLevel < lightOnThreshold:    # rule 4
        relay = ON
    else if relay == ON and lightLevel > lightOffThreshold:    # rule 7
        relay = OFF
    # otherwise: keep current state            # rules 5 and 6

    if relay changed: publish telemetry
```

## 9. Casos de prueba

Con los valores del simulador (`lightOnThreshold` = 30, `lightOffThreshold` = 60, `offDelaySec` = 30). Sirven para verificar el nodo virtual (T-09) y luego el firmware.

| # | Situación inicial | Acción | Resultado esperado |
|---|---|---|---|
| 1 | auto, sin presencia, luz 20, apagada | Activar presencia | Se enciende |
| 2 | auto, con presencia, luz 80, apagada | — | Sigue apagada |
| 3 | auto, con presencia, luz 20, encendida | Subir luz a 45 | Sigue encendida (zona de histéresis) |
| 4 | auto, con presencia, luz 45, apagada | — | Sigue apagada (zona de histéresis) |
| 5 | auto, con presencia, luz 45, encendida | Subir luz a 70 | Se apaga |
| 6 | auto, con presencia, luz 20, encendida | Quitar presencia | Sigue encendida 30 s y luego se apaga |
| 7 | Como el caso 6, a los 20 s | Activar presencia otra vez | No se apaga; el conteo se reinicia |
| 8 | auto, encendida | `cmd/mode` → manual | Sigue encendida, modo manual |
| 9 | manual, encendida | Quitar presencia y esperar 60 s | Sigue encendida |
| 10 | manual | `cmd/light` → off | Se apaga |
| 11 | manual, apagada, con presencia, luz 20 | `cmd/mode` → auto | Se enciende de inmediato |
| 12 | auto | `cmd/light` → on | Se ignora; el estado no cambia |
| 13 | auto, con presencia, luz 20 | Detener el broker | Sigue encendida y obedeciendo a los sensores |
| 14 | manual, encendida | Detener el broker 10 min | Vuelve a auto |
| 15 | Cualquiera | Reiniciar el nodo | Arranca apagada y en auto |

## 10. Decisiones por validar en equipo

| # | Decisión propuesta | Alternativa |
|---|---|---|
| 1 | Fuera de horario la luz no se enciende sola y se apaga si estaba encendida | Que el horario solo cambie los umbrales |
| 2 | El horario no afecta al modo manual | Que fuera de horario tampoco se pueda encender a mano |
| 3 | Sin hora válida se considera «dentro de horario» | Considerar «fuera de horario» |
| 4 | Tras 10 min sin conexión en manual, vuelve a auto | Mantener manual indefinidamente |
| 5 | El nodo siempre arranca en `auto` y apagado | Recordar el último modo |
| 6 | Valores iniciales: 30 / 60 / 300 s (30 s en simulador) | Otros valores |

## 11. Historial de cambios

| Versión | Fecha | Cambio |
|---|---|---|
| 0.1 | 2026-10-02 | Primera versión para revisión del equipo |
