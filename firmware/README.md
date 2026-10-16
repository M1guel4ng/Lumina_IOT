# Guía Completa de Conexión y Puesta en Marcha: Nodo Físico ESP32 (SILA IoT)

Esta guía detalla el montaje paso a paso, conexionado eléctrico en protoboard, configuración de software y calibración para el nodo físico **`esp32-01`** utilizando los componentes adquiridos.

---

## 1. Materiales Empleados

| Componente | Cant. Usada | Cant. Total | Función en el Sistema |
|---|:---:|:---:|---|
| **ESP32 DevKit V1 (30 pines, CP2102)** | 1 | 1 | Microcontrolador central (Wi-Fi, MQTT, lógica de decisión) |
| **Sensor PIR HC-SR501** | 1 | 1 | Detección de presencia / movimiento por infrarrojos |
| **LDR (Fotorresistencia) 7 mm** | 1 | 4 (3 repuesto) | Medición analógica de luz ambiental |
| **Resistencia 10 kΩ** | 1 | 5 (4 repuesto) | Divisor de tensión para el sensor LDR |
| **Módulo Relé de 1 canal (5V)** | 1 | 1 | Actuador para encendido/apagado de la luminaria |
| **Protoboard de 830 puntos** | 1 | 1 | Plataforma de interconexión de circuito |
| **Cables jumper Macho-Macho** | ~6 | 20 | Conexiones internas en la protoboard |
| **Cables jumper Macho-Hembra** | ~6 | 10 | Conexión directa a pines del Relé y PIR |

---

## 2. Puntos Críticos de Hardware (¡Leer antes de conectar!)

1. **Alimentación de 5V (Pin VIN / 5V):**
   - El sensor PIR HC-SR501 y la bobina del módulo relé de 5V requieren **5V** para operar correctamente.
   - Cuando el ESP32 está conectado por cable micro-USB a tu PC o cargador, el pin etiquetado como **`VIN`** (o `5V`) entrega 5V directamente desde el puerto USB.
   - **Conecta el VCC del Relé y el VCC del PIR a este pin `VIN`**.

2. **Nivel Lógico del PIR HC-SR501:**
   - Aunque el sensor se alimenta con 5V, su salida digital `OUT` pasa por un regulador interno de 3.3V. Por tanto, su señal es **3.3V**, completamente **segura para los pines GPIO del ESP32**.

3. **Pin ADC para el LDR (Uso exclusivo de ADC1):**
   - El ESP32 tiene dos conversores analógicos: ADC1 y ADC2.
   - **El ADC2 deja de funcionar cuando el Wi-Fi está transmitiendo.**
   - Por esta razón, el LDR se conecta a **GPIO 34**, que pertenece a **ADC1 (Canal 6)** y no sufre ninguna interferencia del Wi-Fi.

4. **Lógica del Módulo Relé (Active LOW):**
   - La mayoría de los módulos de relé de 1 canal se activan con nivel bajo (**LOW / 0V**). El firmware ya incluye `#define RELAY_ACTIVE_LOW true`. Si tu módulo se activa con HIGH, solo cambia esa bandera a `false` en `config.h`.

5. **El ESP32 en Protoboard:**
   - La placa de 30 pines es ancha. Si la colocas centrada en la protoboard, ocupará casi todos los orificios laterales.
   - **Recomendación práctica:** Puedes colocar el ESP32 en un extremo lateral de la protoboard dejando una fila de orificios libres, o conectar jumpers **Macho-Hembra** directamente desde los pines del ESP32 hacia los rieles de la protoboard.

---

## 3. Ajuste de los Módulos Físicos

### A) Sensor PIR HC-SR501
Remueve la cúpula blanca semiesférica (Fresnel) para observar los controles:
1. **Jumper de Modo (Pines con puente amarillo):**
   - Colócalo en la posición **H (Retrigger / Modo repetible)**. Con esto, mientras haya alguien moviéndose, la salida permanecerá en nivel alto continuamente.
2. **Potenciómetro de Retardo de Tiempo (Time Delay):**
   - Gíralo **totalmente en sentido antihorario** (mínimo, ~2.5 - 3 segundos).
   - *¿Por qué?* Porque el tiempo inteligente de apagado (`offDelaySec`, ej. 30 o 300 segundos) lo gestiona el código del ESP32 con exactitud según las reglas de decisión de SILA.
3. **Potenciómetro de Sensibilidad / Distancia:**
   - Colócalo al centro (alcance aproximado de 4 a 5 metros).
4. **Tiempo de estabilización:** Al encender el ESP32, el PIR tarda 60 segundos en estabilizarse. El firmware ignora falsos positivos durante este minuto de arranque.

---

## 4. Diagrama y Tabla de Conexiones

### Tabla de Conexionado Pin por Pin

| Componente | Pin del Componente | Conectar a Pin ESP32 / Protoboard | Tipo de Cable |
|---|---|---|---|
| **PIR HC-SR501** | VCC | **VIN (5V)** | Macho-Hembra |
| **PIR HC-SR501** | GND | **GND** (Bus azul protoboard) | Macho-Hembra |
| **PIR HC-SR501** | OUT | **GPIO 27** (D27) | Macho-Hembra |
| **Módulo Relé** | VCC | **VIN (5V)** | Macho-Hembra |
| **Módulo Relé** | GND | **GND** (Bus azul protoboard) | Macho-Hembra |
| **Módulo Relé** | IN | **GPIO 26** (D26) | Macho-Hembra |
| **Divisor LDR** | Pata 1 del LDR | **3V3** (Salida 3.3V del ESP32) | Macho-Macho |
| **Divisor LDR** | Pata 2 del LDR | Nodo central en protoboard | - |
| **Divisor LDR** | Nodo central | **GPIO 34** (D34 analógico) | Macho-Macho |
| **Divisor LDR** | Pata 1 de Resistencia 10k | Nodo central (junto a pata 2 del LDR) | - |
| **Divisor LDR** | Pata 2 de Resistencia 10k | **GND** (Bus azul protoboard) | Macho-Macho |

### Circuito del Divisor de Tensión (LDR + 10 kΩ)

```text
       3.3V (Pin 3V3 del ESP32)
         │
       ┌─┴─┐
       │   │  LDR 7mm
       │   │
       └─┬─┘
         ├───────────────────> Conectar a GPIO 34 (Entrada analógica ADC1)
       ┌─┴─┐
       │   │  Resistencia 10 kΩ
       │   │  (Marrón - Negro - Naranja - Dorado)
       └─┬─┘
         │
        GND (Bus negativo común)
```

**Comportamiento del circuito:**
- **Ambiente con luz:** La resistencia del LDR baja → El voltaje en GPIO 34 sube (~2.8V - 3.1V, ADC ~3500) → `lightLevel` alto (ej. 70-95%).
- **Ambiente oscuro:** La resistencia del LDR sube → El voltaje en GPIO 34 cae cerca de 0V (ADC ~100-300) → `lightLevel` bajo (ej. 5-20%).
- Cumple directamente con el contrato MQTT de SILA: **0 = oscuridad, 100 = máxima luz**.

---

## 5. Configuración del Entorno de Software

### Paso 1: Driver USB CP2102
1. Conecta el ESP32 por cable micro-USB a tu PC.
2. Abre el **Administrador de Dispositivos** de Windows (`devmgmt.msc`) y verifica en **Puertos (COM y LPT)** que aparezca:
   `Silicon Labs CP210x USB to UART Bridge (COMx)` (por ejemplo, COM3 o COM4).
3. Si aparece con un signo amarillo de interrogación, descarga el driver oficial de Silicon Labs:
   [Silicon Labs CP210x Universal Windows Driver](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) e instálalo.

### Paso 2: Configuración en Arduino IDE
1. Descarga e instala **Arduino IDE 2.x** (si no lo tienes instalado).
2. Abre **Archivo > Preferencias** y en **Gestor de URLs Adicionales de Tarjetas** añade:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. Ve a **Herramientas > Placa > Gestor de Tarjetas**, busca `esp32` (por Espressif Systems) e instala la versión más reciente.
4. Ve a **Herramientas > Administrar Bibliotecas** (icono de libros) e instala:
   - **`PubSubClient`** de Nick O'Leary
   - **`ArduinoJson`** de Benoit Blanchon (versión 6 o 7)
5. En el menú **Herramientas**:
   - **Placa:** Selecciona `DOIT ESP32 DEVKIT V1` o `ESP32 Dev Module`.
   - **Upload Speed:** `921600` (o `115200`).
   - **Puerto:** El puerto COM correspondiente al ESP32.

---

## 6. Configuración de Red y Broker MQTT

El ESP32 está en la red física Wi-Fi, por lo que **no puede conectarse a `localhost`**. Debe apuntar a la dirección IP local de tu computadora en la red Wi-Fi:

- **Tu IP local actual:** `192.168.100.91`
- **Puerto MQTT:** `1883`

### A) Abrir el archivo `firmware/esp32_firmware/config.h`:
Configura tus credenciales Wi-Fi:
```cpp
#define WIFI_SSID       "Mi_Red_Wifi_2.4G"    // Tu red Wi-Fi (debe ser 2.4 GHz)
#define WIFI_PASSWORD   "mi_contraseña"
#define MQTT_SERVER     "192.168.100.91"      // La IP de tu computadora
```

### B) Habilitar Mosquitto para conexiones de red local
El archivo `mosquitto/config/mosquitto.conf` ya fue actualizado con:
```text
listener 1883 0.0.0.0
allow_anonymous true
```

### C) Permitir el puerto 1883 en el Firewall de Windows
Para que Windows no bloquee las conexiones entrantes del ESP32 hacia Mosquitto, abre una terminal de **PowerShell como Administrador** y ejecuta:
```powershell
New-NetFirewallRule -DisplayName "Mosquitto MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
```

---

## 7. Carga del Código y Verificación

1. Abre el archivo `firmware/esp32_firmware/esp32_firmware.ino` en Arduino IDE.
2. Haz clic en **Subir (Upload)**.
   *(Nota: Si en la consola dice `Connecting........_____.....`, mantén presionado el botón **BOOT** en la placa ESP32 por 2 segundos hasta que empiece a cargar el porcentaje).*
3. Una vez finalizada la carga, abre el **Monitor Serial** (icono de lupa arriba a la derecha) y configura la velocidad en **`115200 baudios`**.
4. Deberás observar la secuencia de inicio:
   ```text
   ==================================================
     SILA - Nodo IoT Físico ESP32 (esp32-01)
   ==================================================
   [HW] Pines configurados: PIR=27, LDR=34, RELAY=26
   [WIFI] Conectando a red: Mi_Red_Wifi ...
   [WIFI] ¡Conectado! IP asignada: 192.168.100.125
   [MQTT] Conectando a broker 192.168.100.91:1883 ...
   [MQTT] ¡Conectado al broker!
   [MQTT] Publicado status: online en sila/esp32-01/status
   [MQTT] Suscrito a comandos: sila/esp32-01/cmd/light, sila/esp32-01/cmd/mode, sila/esp32-01/config
   [TELEMETRY] sila/esp32-01/telemetry -> {"deviceId":"esp32-01","presence":false,"lightLevel":45,"light":"off","mode":"auto","ts":"..."}
   ```

5. **Verificación en el Dashboard Web:**
   - Abre tu navegador en **`http://localhost:5173`** (Dashboard Lumina).
   - En el selector de nodos aparecerá automáticamente **`esp32-01`**.
   - Al pasar la mano frente al sensor PIR, verás el estado de **Presencia: Detectada** en menos de 2 segundos.
   - Si la luz ambiental está por debajo de 30 y hay presencia, escucharás el "clic" del relé encendiéndose y el Dashboard mostrará **Luminaria: Encendida**.
   - Al iluminar el LDR con la linterna de tu celular (luz > 60), el relé se apagará automáticamente.
