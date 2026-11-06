#pragma once
#include <Arduino.h>

// ─── 1. Red Wi-Fi ─────────────────────────────────────────────────────────────
// Ingresa el SSID y contraseña de tu red Wi-Fi (o punto de acceso del celular)
#define WIFI_SSID           "VCW-05038"
#define WIFI_PASSWORD       "ZTE0RUWL9F01047"

// ─── 2. Broker MQTT en la Nube (HiveMQ) ──────────────────────────────────────
#define MQTT_SERVER         "broker.hivemq.com"
#define MQTT_PORT           1883

// ─── 3. Asignación de Pines de Hardware ───────────────────────────────────────
// NODO 1 (Zona 1: Relé de 5V y PIR 1):
#define PIN_RELAY_1         26   // Relé / Foco 1 (GPIO 26 - Activo Bajo / Hi-Z)
#define PIN_PIR_1           27   // Sensor PIR 1 (GPIO 27)
#define PIN_LDR             34   // Sensor de Luz LDR (GPIO 34)

// NODO 2 (Zona 2: LED 2 con Resistencia y PIR 2):
#define PIN_LED_2           25   // LED 2 con resistencia (GPIO 25 - Activo Alto)
#define PIN_PIR_2           14   // Sensor PIR 2 (GPIO 14)

// ─── 4. Identificadores de los Nodos en la App ────────────────────────────────
#define DEVICE_ID_1         "sim-01"   // Identificador de Nodo 1 en el Dashboard
#define DEVICE_ID_2         "sim-02"   // Identificador de Nodo 2 en el Dashboard

// ─── 5. Parámetros de Temporización ───────────────────────────────────────────
// Tiempo sin movimiento (en milisegundos) antes de apagar la luz automáticamente
#define OFF_DELAY_MS        10000   // 10 segundos de cortesía sin movimiento

// ─── 6. Parámetros de Luz Ambiental (LDR) ─────────────────────────────────────
#define LDR_UMBRAL_ENCENDIDO  40    // Menos de 40% de luz ambiental
#define LDR_UMBRAL_APAGADO    43    // Margen de histéresis (>= 43% para apagar)
