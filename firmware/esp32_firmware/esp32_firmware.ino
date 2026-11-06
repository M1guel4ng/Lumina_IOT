/**
 * ============================================================================
 * Proyecto: SILA / Lumina IoT
 * Firmware: ESP32 Físico MULTI-NODO (Nodo 1 y Nodo 2) con MODO GLOBAL ÚNICO
 *
 * CARACTERÍSTICAS:
 * 1. Identidad limpia (SIN duplicados):
 *    - NODO 1: "sim-01" (Relé en GPIO 26, PIR 1 en GPIO 27, LDR en GPIO 34)
 *    - NODO 2: "sim-02" (LED 2 en GPIO 25, PIR 2 en GPIO 14)
 *
 * 2. MODO GLOBAL ÚNICO DEL SISTEMA:
 *    - "manual": Control individual desde la web por botones. Sensores no tocan la luz.
 *    - "pir": Modo Presencia.
 *             - PIR 1 gobierna únicamente el Relé 1 (10s de apagado).
 *             - PIR 2 gobierna únicamente el LED 2 (10s de apagado).
 *             - El sensor LDR NO interviene.
 *    - "ldr": Modo Luminaria / Crepuscular.
 *             - El sensor LDR gobierna AMBOS leds/focos a la vez.
 *             - Luz < 40% (oscuro) -> Se encienden AMBOS leds.
 *             - Luz >= 43% (iluminado) -> Se apagan AMBOS leds.
 *             - Los sensores PIR NO intervienen.
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "config.h"

// ─── Clientes y Memoria ───────────────────────────────────────────────────────
WiFiClient espClient;
PubSubClient client(espClient);
Preferences preferences;

// ─── Modo Global Único del Sistema ───────────────────────────────────────────
String modoGlobal = "pir";               // "manual" | "pir" | "ldr"

// ─── Variables de Estado - NODO 1 (sim-01) ───────────────────────────────────
String estadoFoco_1 = "off";
unsigned long ultimoMovimiento_1 = 0;
bool presenciaOcupada_1 = false;
unsigned long lastMsg_1 = 0;

// ─── Variables de Estado - NODO 2 (sim-02) ───────────────────────────────────
String estadoFoco_2 = "off";
unsigned long ultimoMovimiento_2 = 0;
bool presenciaOcupada_2 = false;
unsigned long lastMsg_2 = 0;

// ─── Prototipos ──────────────────────────────────────────────────────────────
void aplicarFoco1(bool encender);
void aplicarFoco2(bool encender);
void cambiarModoGlobal(String nuevoModo);
void conectarWiFi();
void reconnect();
void callback(char* topic, byte* payload, unsigned int length);
void enviarTelemetriaNodo1(int lightLevel);
void enviarTelemetriaNodo2(int lightLevel);

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================================");
  Serial.println("   ESP32 LUMINA IOT - SISTEMA CON MODO GLOBAL ÚNICO");
  Serial.println("   - NODO 1 (sim-01): Relé GPIO 26 | PIR 1 GPIO 27 | LDR GPIO 34");
  Serial.println("   - NODO 2 (sim-02): LED 2 GPIO 25 | PIR 2 GPIO 14");
  Serial.println("========================================================");

  // Sensores PIR como entradas
  pinMode(PIN_PIR_1, INPUT);
  pinMode(PIN_PIR_2, INPUT);

  // Pin de salida LED 2
  pinMode(PIN_LED_2, OUTPUT);
  digitalWrite(PIN_LED_2, LOW);

  // Cargar estados persistidos desde flash (NVS)
  preferences.begin("lumina", false);
  modoGlobal = "pir"; // Inicia por defecto en modo PIR
  estadoFoco_1 = preferences.getString("foco1", "off");
  estadoFoco_2 = preferences.getString("foco2", "off");

  // Restaurar Nodo 1 (Relé de 5V)
  if (estadoFoco_1 == "on") {
    pinMode(PIN_RELAY_1, OUTPUT);
    digitalWrite(PIN_RELAY_1, LOW); // Relé activo bajo
    Serial.println("[INICIO] Nodo 1 (Relé): Restaurado ENCENDIDO");
  } else {
    pinMode(PIN_RELAY_1, INPUT);    // Corte Hi-Z
    Serial.println("[INICIO] Nodo 1 (Relé): Restaurado APAGADO");
  }

  // Restaurar Nodo 2 (LED 2)
  if (estadoFoco_2 == "on") {
    digitalWrite(PIN_LED_2, HIGH);
    Serial.println("[INICIO] Nodo 2 (LED 2): Restaurado ENCENDIDO");
  } else {
    digitalWrite(PIN_LED_2, LOW);
    Serial.println("[INICIO] Nodo 2 (LED 2): Restaurado APAGADO");
  }

  Serial.println("[MODO] Sistema iniciando en MODO PIR (Presencia)");

  // Conexión Wi-Fi y MQTT
  conectarWiFi();
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(callback);
  client.setBufferSize(512);
}

// ─── CONEXIÓN WI-FI ──────────────────────────────────────────────────────────
void conectarWiFi() {
  Serial.printf("[WIFI] Conectando a: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(400);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] ¡Conectado exitosamente!");
    Serial.printf("[WIFI] IP asignada: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] No se pudo conectar a la red Wi-Fi. Reintentará en loop.");
  }
}

// ─── RECONEXIÓN MQTT ─────────────────────────────────────────────────────────
void reconnect() {
  while (!client.connected()) {
    if (WiFi.status() != WL_CONNECTED) {
      conectarWiFi();
    }

    Serial.print("[MQTT] Conectando con HiveMQ...");
    String clientId = "Lumina_Global_" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), "sila/sim-01/status", 1, true, "offline")) {
      Serial.println(" ¡Conectado!");

      // Anunciar ÚNICAMENTE los 2 nodos reales como Online (retenido)
      client.publish("sila/sim-01/status", "online", true);
      client.publish("sila/sim-02/status", "online", true);

      // Suscripciones Nodo 1 (sim-01)
      client.subscribe("sila/sim-01/cmd");
      client.subscribe("sila/sim-01/cmd/light");
      client.subscribe("sila/sim-01/cmd/mode");

      // Suscripciones Nodo 2 (sim-02)
      client.subscribe("sila/sim-02/cmd");
      client.subscribe("sila/sim-02/cmd/light");
      client.subscribe("sila/sim-02/cmd/mode");

      // Tópicos globales y legacy
      client.subscribe("sila/cmd/mode");
      client.subscribe("qazadores/sensor/control");

      Serial.println("[MQTT] Suscripciones activas para sim-01 y sim-02.");

      // Forzar telemetría inmediata de ambos
      lastMsg_1 = 0;
      lastMsg_2 = 0;
    } else {
      Serial.printf(" Falló (rc=%d). Reintentando en 5 segundos...\n", client.state());
      delay(5000);
    }
  }
}

// ─── CONTROL DEL RELÉ 1 (NODO 1) ─────────────────────────────────────────────
void aplicarFoco1(bool encender) {
  if (encender) {
    pinMode(PIN_RELAY_1, OUTPUT);
    digitalWrite(PIN_RELAY_1, LOW); // Enciende relé (activo bajo)
    estadoFoco_1 = "on";
  } else {
    pinMode(PIN_RELAY_1, INPUT);    // Apaga relé (Hi-Z corte total)
    estadoFoco_1 = "off";
  }
  preferences.putString("foco1", estadoFoco_1);
}

// ─── CONTROL DEL LED 2 (NODO 2) ──────────────────────────────────────────────
void aplicarFoco2(bool encender) {
  if (encender) {
    pinMode(PIN_LED_2, OUTPUT);
    digitalWrite(PIN_LED_2, HIGH);  // Enciende LED 2 (3.3V)
    estadoFoco_2 = "on";
  } else {
    pinMode(PIN_LED_2, OUTPUT);
    digitalWrite(PIN_LED_2, LOW);   // Apaga LED 2 (0V)
    estadoFoco_2 = "off";
  }
  preferences.putString("foco2", estadoFoco_2);
}

// ─── CAMBIAR MODO GLOBAL ─────────────────────────────────────────────────────
void cambiarModoGlobal(String nuevoModo) {
  modoGlobal = nuevoModo;
  Serial.printf("\n>>> [MODO GLOBAL] El sistema cambió a: MODO %s <<<\n", modoGlobal.c_str());

  // Al pasar a modo PIR, si no hay presencia inmediata, apagamos de una vez
  if (modoGlobal == "pir") {
    if (!presenciaOcupada_1 && estadoFoco_1 == "on") aplicarFoco1(false);
    if (!presenciaOcupada_2 && estadoFoco_2 == "on") aplicarFoco2(false);
  }

  // Notificar inmediatamente a ambos nodos en la app
  lastMsg_1 = 0;
  lastMsg_2 = 0;
}

// ─── CALLBACK DE MENSAJES MQTT ───────────────────────────────────────────────
void callback(char* topic, byte* payload, unsigned int length) {
  String mensaje = "";
  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }

  String t = String(topic);
  Serial.printf("[MQTT RECV] %s -> %s\n", topic, mensaje.c_str());

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, mensaje);
  if (err) return;

  // Extraer comando
  String comando = "";
  if (!doc["action"].isNull())   comando = doc["action"].as<String>();
  if (comando == "" && !doc["comando"].isNull()) comando = doc["comando"].as<String>();
  if (comando == "" && !doc["state"].isNull())   comando = doc["state"].as<String>();
  if (comando == "" && !doc["light"].isNull())   comando = doc["light"].as<String>();
  if (comando == "" && !doc["mode"].isNull())    comando = doc["mode"].as<String>();
  comando.toLowerCase();
  comando.trim();

  // ── 1. Comandos de cambio de MODO GLOBAL ──
  if (comando == "manual") {
    cambiarModoGlobal("manual");
    return;
  }
  if (comando == "pir" || comando == "auto" || comando == "automatico" || comando == "presencia") {
    cambiarModoGlobal("pir");
    return;
  }
  if (comando == "ldr" || comando == "luminaria" || comando == "luz") {
    cambiarModoGlobal("ldr");
    return;
  }

  // ── 2. Comandos de encendido / apagado manual por nodo ──
  String dev = "";
  if (!doc["deviceId"].isNull()) dev = doc["deviceId"].as<String>();
  dev.toLowerCase();

  bool esNodo2 = (t.indexOf("sim-02") >= 0 || dev == "sim-02");

  if (esNodo2) {
    if (comando == "encender" || comando == "on" || comando == "light_on") {
      aplicarFoco2(true);
      cambiarModoGlobal("manual");
      Serial.println(">> App: ENCENDER NODO 2 (Manual)");
    } else if (comando == "apagar" || comando == "off" || comando == "light_off") {
      aplicarFoco2(false);
      cambiarModoGlobal("manual");
      Serial.println(">> App: APAGAR NODO 2 (Manual)");
    }
    lastMsg_2 = 0;
  } else {
    if (comando == "encender" || comando == "on" || comando == "light_on") {
      aplicarFoco1(true);
      cambiarModoGlobal("manual");
      Serial.println(">> App: ENCENDER NODO 1 (Manual)");
    } else if (comando == "apagar" || comando == "off" || comando == "light_off") {
      aplicarFoco1(false);
      cambiarModoGlobal("manual");
      Serial.println(">> App: APAGAR NODO 1 (Manual)");
    }
    lastMsg_1 = 0;
  }
}

// ─── LOOP PRINCIPAL ──────────────────────────────────────────────────────────
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();

  // ==========================================
  // 1. SENSOR PIR 1 (NODO 1 - GPIO 27)
  // ==========================================
  int rawPir1 = digitalRead(PIN_PIR_1);
  if (rawPir1 == HIGH) {
    ultimoMovimiento_1 = now;
  }
  bool ocupado_1 = (rawPir1 == HIGH) || (ultimoMovimiento_1 > 0 && (now - ultimoMovimiento_1 < OFF_DELAY_MS));

  if (ocupado_1 != presenciaOcupada_1) {
    presenciaOcupada_1 = ocupado_1;
    if (presenciaOcupada_1) {
      Serial.println(">>> [PIR 1 - NODO 1] Presencia detectada");
    } else {
      Serial.println("... [PIR 1 - NODO 1] 10s sin presencia finalizados");
    }
    lastMsg_1 = 0;
  }

  // ==========================================
  // 2. SENSOR PIR 2 (NODO 2 - GPIO 14)
  // ==========================================
  int rawPir2 = digitalRead(PIN_PIR_2);
  if (rawPir2 == HIGH) {
    ultimoMovimiento_2 = now;
  }
  bool ocupado_2 = (rawPir2 == HIGH) || (ultimoMovimiento_2 > 0 && (now - ultimoMovimiento_2 < OFF_DELAY_MS));

  if (ocupado_2 != presenciaOcupada_2) {
    presenciaOcupada_2 = ocupado_2;
    if (presenciaOcupada_2) {
      Serial.println(">>> [PIR 2 - NODO 2] Presencia detectada");
    } else {
      Serial.println("... [PIR 2 - NODO 2] 10s sin presencia finalizados");
    }
    lastMsg_2 = 0;
  }

  // ==========================================
  // 3. SENSOR LDR (GPIO 34)
  // ==========================================
  int rawLdr = analogRead(PIN_LDR);
  int lightLevel = constrain(map(rawLdr, 0, 4095, 100, 0), 0, 100);

  // ==========================================
  // 4. LÓGICA DEL MODO GLOBAL
  // ==========================================

  if (modoGlobal == "pir") {
    // ── MODO PIR (Presencia pura e independiente) ──
    // El sensor LDR NO interviene aquí
    // Nodo 1:
    if (presenciaOcupada_1) {
      if (estadoFoco_1 != "on") { aplicarFoco1(true); lastMsg_1 = 0; }
    } else {
      if (estadoFoco_1 != "off") { aplicarFoco1(false); lastMsg_1 = 0; }
    }

    // Nodo 2:
    if (presenciaOcupada_2) {
      if (estadoFoco_2 != "on") { aplicarFoco2(true); lastMsg_2 = 0; }
    } else {
      if (estadoFoco_2 != "off") { aplicarFoco2(false); lastMsg_2 = 0; }
    }
  }
  else if (modoGlobal == "ldr") {
    // ── MODO LDR (Luminaria crepuscular para ambos) ──
    // Los sensores PIR NO intervienen aquí
    if (lightLevel < LDR_UMBRAL_ENCENDIDO) {
      // Oscuro (< 40%) -> SE PRENDEN AMBOS
      if (estadoFoco_1 != "on") { aplicarFoco1(true); lastMsg_1 = 0; }
      if (estadoFoco_2 != "on") { aplicarFoco2(true); lastMsg_2 = 0; }
    } else if (lightLevel >= LDR_UMBRAL_APAGADO) {
      // Iluminado (>= 43%) -> SE APAGAN AMBOS
      if (estadoFoco_1 != "off") { aplicarFoco1(false); lastMsg_1 = 0; }
      if (estadoFoco_2 != "off") { aplicarFoco2(false); lastMsg_2 = 0; }
    }
  }
  // Si modoGlobal == "manual", no se hace nada automático; cada foco obedece sus botones web

  // ==========================================
  // 5. ENVÍO PERIÓDICO DE TELEMETRÍA (4.8 segundos)
  // ==========================================
  if (now - lastMsg_1 > 4800) {
    lastMsg_1 = now;
    enviarTelemetriaNodo1(lightLevel);
  }

  if (now - lastMsg_2 > 4800) {
    lastMsg_2 = now;
    enviarTelemetriaNodo2(lightLevel);
  }

  delay(10);
}

// ─── TELEMETRÍA NODO 1 (sim-01) ──────────────────────────────────────────────
void enviarTelemetriaNodo1(int lightLevel) {
  bool presence = presenciaOcupada_1;

  String payload = "{\"deviceId\":\"sim-01\",\"presence\":" + String(presence ? "true" : "false") +
                   ",\"lightLevel\":" + String(lightLevel) +
                   ",\"light\":\"" + estadoFoco_1 +
                   "\",\"mode\":\"" + modoGlobal + "\"}";

  client.publish("sila/sim-01/telemetry", payload.c_str());

  Serial.printf("[TELEMETRIA N1] Luz: %s | Modo: %s | PIR1: %s | LDR: %d%%\n",
                estadoFoco_1.c_str(), modoGlobal.c_str(), presence ? "SI" : "NO", lightLevel);
}

// ─── TELEMETRÍA NODO 2 (sim-02) ──────────────────────────────────────────────
void enviarTelemetriaNodo2(int lightLevel) {
  bool presence = presenciaOcupada_2;

  String payload = "{\"deviceId\":\"sim-02\",\"presence\":" + String(presence ? "true" : "false") +
                   ",\"lightLevel\":" + String(lightLevel) +
                   ",\"light\":\"" + estadoFoco_2 +
                   "\",\"mode\":\"" + modoGlobal + "\"}";

  client.publish("sila/sim-02/telemetry", payload.c_str());

  Serial.printf("[TELEMETRIA N2] Luz: %s | Modo: %s | PIR2: %s\n",
                estadoFoco_2.c_str(), modoGlobal.c_str(), presence ? "SI" : "NO");
}
