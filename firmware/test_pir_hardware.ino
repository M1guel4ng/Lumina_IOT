/**
 * ============================================================================
 * PRUEBA RÁPIDA DE HARDWARE: SENSOR PIR (HC-SR501) + RELÉ
 * ============================================================================
 * Este sketch NO usa Wi-Fi ni MQTT. Sirve únicamente para probar en 10 segundos
 * que el cableado físico del sensor PIR y el relé funcionan al 100%.
 *
 * Conexiones:
 *   - PIR OUT   -> GPIO 27
 *   - PIR VCC   -> VIN (5V)
 *   - PIR GND   -> GND
 *   - RELÉ IN   -> GPIO 26
 *
 * Comportamiento:
 *   - Al mover la mano: El relé hace CLIC y se enciende, y en el monitor serial
 *     aparece "¡MOVIMIENTO DETECTADO!".
 *   - Al retirar la mano: El relé se apaga y muestra "Sin movimiento".
 * ============================================================================
 */

#include <Arduino.h>

#define PIN_PIR   27
#define PIN_RELAY 26

int ultimoEstado = -1;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================================");
  Serial.println("   INICIANDO PRUEBA DE SENSOR PIR HC-SR501");
  Serial.println("========================================================");
  Serial.println("Nota: El sensor HC-SR501 toma unos 10-15 segundos en");
  Serial.println("estabilizarse al recibir energia por primera vez.");
  Serial.println("Pasa tu mano frente a la semiesfera blanca...");
  Serial.println("========================================================\n");

  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_RELAY, INPUT); // Apagado inicial
}

void loop() {
  int estadoActual = digitalRead(PIN_PIR);

  if (estadoActual != ultimoEstado) {
    ultimoEstado = estadoActual;

    if (estadoActual == HIGH) {
      // Activar relé
      pinMode(PIN_RELAY, OUTPUT);
      digitalWrite(PIN_RELAY, LOW); // Enciende relé

      Serial.println(">>> [DETECCION] ¡¡¡ MOVIMIENTO DETECTADO !!! (GPIO 27 = HIGH)");
      Serial.println("    -> Relé / Luz: ENCENDIDO [OK]\n");
    } else {
      // Desactivar relé con el truco Hi-Z
      pinMode(PIN_RELAY, INPUT);

      Serial.println("... [REPOSO] Sin movimiento (GPIO 27 = LOW)");
      Serial.println("    -> Relé / Luz: APAGADO [OK]\n");
    }
  }

  delay(50);
}

