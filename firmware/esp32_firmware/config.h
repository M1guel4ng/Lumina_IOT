#pragma once
#include <Arduino.h>

// ─── 1. Red Wi-Fi ─────────────────────────────────────────────────────────────
// Ingresa el SSID y contraseña de tu red Wi-Fi (o punto de acceso del celular)
#define WIFI_SSID           "VCW-05038"
#define WIFI_PASSWORD       "pass"

// #define WIFI_SSID        "HONOR X8c"
// #define WIFI_PASSWORD    "4ssk7iffuji9959"

// ─── 2. Broker MQTT en la Nube (HiveMQ) ──────────────────────────────────────
// El backend y la app se comunican a través de HiveMQ público
#define MQTT_SERVER         "broker.hivemq.com"
#define MQTT_PORT           1883

// ─── 3. Asignación de Pines de Hardware ───────────────────────────────────────
#define PIN_RELAY           26   // Relé / Foco / LED
#define PIN_LDR             34   // Sensor de Luz LDR
#define PIN_PIR             27   // Sensor PIR de Presencia (HC-SR501)

// ─── 4. Identificador del Nodo ────────────────────────────────────────────────
// "sim-01" es el nodo predeterminado de la app (el código también responde a "esp32-01")
#define DEVICE_ID           "sim-01"

// ─── 5. Parámetros de Temporización ───────────────────────────────────────────
// Tiempo sin movimiento (en milisegundos) antes de apagar la luz automáticamente
#define OFF_DELAY_MS        10000   // 10 segundos
