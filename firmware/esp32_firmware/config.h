/**
 * ============================================================================
 * Proyecto: SILA (Sistema de Iluminación Adaptativa)
 * Archivo: config.h
 * Descripción: Configuración de hardware, Wi-Fi, MQTT y parámetros de decisión
 *              para el nodo físico ESP32 (esp32-01).
 * ============================================================================
 */

#pragma once

#include <Arduino.h>

// ─── 1. Identificación del Nodo ──────────────────────────────────────────────
#define DEVICE_ID           "esp32-01"       // Identificador único (minúsculas, números, guiones)
#define TOPIC_PREFIX        "sila"           // Prefijo raíz del contrato MQTT

// ─── 2. Conectividad Wi-Fi ───────────────────────────────────────────────────
// ATENCIÓN: Ingresa el nombre (SSID) y contraseña de tu red Wi-Fi (2.4 GHz)
#define WIFI_SSID           "TU_RED_WIFI_2.4GHZ"
#define WIFI_PASSWORD       "TU_PASSWORD_WIFI"

// ─── 3. Broker MQTT ──────────────────────────────────────────────────────────
// Dirección IP de la computadora donde corre Mosquitto.
// Tu IP local actual detectada es: 192.168.100.91
#define MQTT_SERVER         "192.168.100.91"
#define MQTT_PORT           1883
#define MQTT_USER           ""               // Vacío si allow_anonymous true
#define MQTT_PASSWORD       ""               // Vacío si allow_anonymous true

// ─── 4. Asignación de Pines (ESP32 de 30 pines con CP2102) ───────────────────
// Sensor PIR HC-SR501 (Salida digital OUT de 3.3V)
#define PIN_PIR             27

// Sensor LDR (Divisor de tensión con resistencia de 10 kΩ)
// IMPORTANTE: Usamos GPIO 34 (ADC1_CH6) porque ADC1 funciona sin interferencia
// de la radio Wi-Fi. (Los pines ADC2 fallan cuando el Wi-Fi transmite).
#define PIN_LDR             34

// Módulo Relé de 1 canal (5V)
#define PIN_RELAY           26

// Lógica de activación del módulo relé:
// La mayoría de módulos relé de 1 canal son "Active LOW" (se activan en LOW).
// Si tu módulo es "Active HIGH", cambia este valor a false.
#define RELAY_ACTIVE_LOW    true

// ─── 5. Parámetros de Decisión SILA (docs/decision-rules.md) ─────────────────
// Umbrales de iluminación (0 = oscuridad total, 100 = máxima luz ambiental)
#define DEFAULT_LIGHT_ON_THRESHOLD   30      // Se enciende si lightLevel < 30 y hay presencia
#define DEFAULT_LIGHT_OFF_THRESHOLD  60      // Se apaga si lightLevel > 60 (histéresis)

// Temporización de apagado por inactividad
// En pruebas rápidas puedes usar 15 o 30 segundos; en producción 300 s (5 min).
#define DEFAULT_OFF_DELAY_SEC        30      // Segundos sin presencia antes de apagar

// Estabilización del sensor PIR al energizar (en segundos)
// El HC-SR501 requiere entre 30 y 60 s para estabilizar el sensor piroeléctrico.
#define PIR_WARMUP_SEC               60

// Histéresis de telemetría: diferencia mínima de luz para enviar nuevo mensaje
#define TELEMETRY_LIGHT_DELTA        5

// Intervalo de latido periódico (heartbeat) en milisegundos (10 segundos)
#define HEARTBEAT_INTERVAL_MS        10000

// Retorno a automático si se pierde conexión en modo manual (10 minutos)
#define MANUAL_TIMEOUT_MS            600000UL

// Calibración ADC para LDR (lectura raw de 12 bits: 0 a 4095)
#define ADC_DARK_VALUE               100     // Valor analógico en oscuridad
#define ADC_BRIGHT_VALUE             3800    // Valor analógico con luz fuerte

// ─── 6. Servidor NTP para sincronización de hora (Bolivia UTC-4) ─────────────
#define NTP_SERVER                   "pool.ntp.org"
#define GMT_OFFSET_SEC               (-4 * 3600)  // UTC-4 (Bolivia)
#define DAYLIGHT_OFFSET_SEC          0
