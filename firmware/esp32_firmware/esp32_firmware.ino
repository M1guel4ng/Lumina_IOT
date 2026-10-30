/**
 * ============================================================================
 * Proyecto: SILA / Lumina IoT
 * Firmware: ESP32 Físico (Compatible con HiveMQ y Dashboard Web)
 *
 * Características clave:
 * 1. Control del Relé de 5V con nivel lógico de 3.3V:
 *    - Encendido: pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, LOW);
 *    - Apagado:   pinMode(PIN_RELAY, INPUT); (Hi-Z para corte total de corriente)
 * 2. Sensor PIR HC-SR501 con Ventana de Cortesía (10 Segundos):
 *    - Al detectar movimiento: Enciende la luz al instante y activa la ventana.
 *    - Al dejar de detectar: Mantiene la luz encendida durante 10 segundos
 *      completos sin parpadeos, y se apaga automáticamente al vencer el tiempo.
 * 3. Persistencia en Memoria No Volátil (Preferences / NVS):
 *    - Guarda el estado de la luz y el modo en la flash del ESP32.
 * 4. Doble Identificación (sim-01 y esp32-01):
 *    - Responde a órdenes y publica telemetría para ambos IDs, garantizando
 *      que cualquier tarjeta del dashboard lo controle sin problemas.
 * 5. Conexión directa a HiveMQ (broker.hivemq.com:1883).
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

// ─── Variables de Estado Global ──────────────────────────────────────────────
bool modoManual = false;                 // false = Automático (PIR manda) | true = Manual (App manda)
String estadoFocoGlobal = "off";         // "on" | "off"
unsigned long lastMsg = 0;               // Control del temporizador de telemetría MQTT
unsigned long ultimoMovimiento = 0;      // Marca de tiempo del último pulso HIGH del PIR
bool presenciaOcupada = false;           // Estado de presencia estable (sin parpadeos de 2-3s)

// ─── Prototipos ──────────────────────────────────────────────────────────────
void aplicarFoco(bool encender);
void aplicarModo(bool manual);
void conectarWiFi();
void reconnect();
void callback(char* topic, byte* payload, unsigned int length);
void enviarTelemetria();

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================================");
  Serial.println("   INICIANDO NODO ESP32 - LUMINA IOT (PIR 10s)");
  Serial.println("========================================================");

  // Sensor PIR como entrada
  pinMode(PIN_PIR, INPUT);

  // 1. Cargar estado previo desde la memoria flash del ESP32 (NVS)
  preferences.begin("lumina", false);
  // Arrancar por defecto en modo automático para que el PIR responda de inmediato
  modoManual = false; 
  estadoFocoGlobal = preferences.getString("foco", "off");

  // 2. Restaurar el estado del relé / foco
  if (estadoFocoGlobal == "on") {
    pinMode(PIN_RELAY, OUTPUT);
    digitalWrite(PIN_RELAY, LOW); // Enciende relé
    Serial.println("[INICIO] Estado previo restaurado: ENCENDIDO");
  } else {
    pinMode(PIN_RELAY, INPUT);    // Apaga relé (Hi-Z)
    Serial.println("[INICIO] Estado previo restaurado: APAGADO");
  }

  Serial.println("[MODO] Arrancando en MODO AUTOMÁTICO (Sensor PIR activo)");

  // 3. Conexión Wi-Fi
  conectarWiFi();

  // 4. Configurar Broker MQTT
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
    Serial.println("\n[WIFI] No se pudo conectar a la red Wi-Fi. Reintentará en el loop.");
  }
}

// ─── RECONEXIÓN MQTT ─────────────────────────────────────────────────────────
void reconnect() {
  while (!client.connected()) {
    if (WiFi.status() != WL_CONNECTED) {
      conectarWiFi();
    }

    Serial.print("[MQTT] Intentando conexión con HiveMQ...");
    String clientId = "Lumina_ESP32_" + String(random(0xffff), HEX);

    // Conectar con LWT (Last Will and Testament)
    if (client.connect(clientId.c_str(), "sila/sim-01/status", 1, true, "offline")) {
      Serial.println(" ¡Conectado!");

      // 1. Publicar estado online retenido (tanto para sim-01 como esp32-01)
      client.publish("sila/sim-01/status", "online", true);
      client.publish("sila/esp32-01/status", "online", true);

      // 2. Suscribirse a los tópicos de comandos de la app
      client.subscribe("sila/sim-01/cmd");
      client.subscribe("sila/sim-01/cmd/light");
      client.subscribe("sila/sim-01/cmd/mode");

      client.subscribe("sila/esp32-01/cmd");
      client.subscribe("sila/esp32-01/cmd/light");
      client.subscribe("sila/esp32-01/cmd/mode");

      client.subscribe("qazadores/sensor/control");

      Serial.println("[MQTT] Suscripciones activas para sim-01 y esp32-01.");

      // Forzar envío de telemetría inicial con el estado actual
      lastMsg = 0;
    } else {
      Serial.printf(" Falló (rc=%d). Reintentando en 5 segundos...\n", client.state());
      delay(5000);
    }
  }
}

// ─── CONTROL DEL RELÉ ────────────────────────────────────────────────────────
void aplicarFoco(bool encender) {
  if (encender) {
    pinMode(PIN_RELAY, OUTPUT);
    digitalWrite(PIN_RELAY, LOW); // Enciende el relé (nivel activo bajo)
    estadoFocoGlobal = "on";
  } else {
    pinMode(PIN_RELAY, INPUT);    // Hack para apagar relé de 5V en ESP32 (Hi-Z corta la corriente)
    estadoFocoGlobal = "off";
  }
  // Guardar en flash para que no se pierda al reiniciar
  preferences.putString("foco", estadoFocoGlobal);
}

void aplicarModo(bool manual) {
  modoManual = manual;
  preferences.putBool("manual", modoManual);
}

// ─── CALLBACK DE MENSAJES MQTT RECIBIDOS ────────────────────────────────────
void callback(char* topic, byte* payload, unsigned int length) {
  String mensaje = "";
  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }

  Serial.printf("[MQTT RECV] %s -> %s\n", topic, mensaje.c_str());

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, mensaje);
  if (err) {
    Serial.printf("[JSON ERR] %s\n", err.c_str());
    return;
  }

  // Extraer comando independientemente del nombre del campo
  String comando = "";
  if (!doc["action"].isNull())   comando = doc["action"].as<String>();
  if (comando == "" && !doc["comando"].isNull()) comando = doc["comando"].as<String>();
  if (comando == "" && !doc["state"].isNull())   comando = doc["state"].as<String>();
  if (comando == "" && !doc["light"].isNull())   comando = doc["light"].as<String>();
  if (comando == "" && !doc["mode"].isNull())    comando = doc["mode"].as<String>();

  comando.toLowerCase();
  comando.trim();

  // Ejecución del comando
  if (comando == "encender" || comando == "on" || comando == "light_on") {
    aplicarFoco(true);
    aplicarModo(true); // Cambia a modo manual para respetar la orden del usuario
    Serial.println(">> App ordenó: ENCENDER FOCO (Modo Manual)");
  }
  else if (comando == "apagar" || comando == "off" || comando == "light_off") {
    aplicarFoco(false);
    aplicarModo(true); // Cambia a modo manual para respetar la orden del usuario
    Serial.println(">> App ordenó: APAGAR FOCO (Modo Manual)");
  }
  else if (comando == "automatico" || comando == "auto") {
    aplicarModo(false);
    Serial.println(">> App ordenó: MODO AUTOMÁTICO (Sensor PIR activado)");
  }
  else if (comando == "manual") {
    aplicarModo(true);
    Serial.println(">> App ordenó: MODO MANUAL");
  }

  // Forzar envío de telemetría de inmediato para confirmar a React
  lastMsg = 0;
}

// ─── LOOP PRINCIPAL ──────────────────────────────────────────────────────────
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();

  // 1. Detección en tiempo real de movimiento con el sensor PIR (GPIO 27)
  int rawPir = digitalRead(PIN_PIR);
  if (rawPir == HIGH) {
    ultimoMovimiento = now;
  }

  // El sistema considera presencia activa si el pin está HIGH O si pasaron menos de 10s desde el último movimiento
  bool ocupado = (rawPir == HIGH) || (ultimoMovimiento > 0 && (now - ultimoMovimiento < OFF_DELAY_MS));

  // Notificar cambio de estado de presencia para actualizar logs y enviar telemetría
  if (ocupado != presenciaOcupada) {
    presenciaOcupada = ocupado;
    if (presenciaOcupada) {
      Serial.println("\n========================================================");
      Serial.println(">>> [PRESENCIA ACTIVA] Movimiento detectado en PIR HC-SR501");
      Serial.println("========================================================");
    } else {
      Serial.println("\n--------------------------------------------------------");
      Serial.println(">>> [PRESENCIA FINALIZADA] 10 segundos sin movimiento");
      Serial.println("--------------------------------------------------------");
    }
    // Forzar envío inmediato de telemetría a MQTT y dashboard
    lastMsg = 0;
  }

  // 2. Control automático por presencia cuando está en modo auto
  if (!modoManual) {
    if (presenciaOcupada) {
      if (estadoFocoGlobal != "on") {
        aplicarFoco(true);
        Serial.println(">> [AUTO PIR] Presencia detectada -> FOCO ENCENDIDO");
        lastMsg = 0;
      }
    } else {
      if (estadoFocoGlobal != "off") {
        aplicarFoco(false);
        Serial.println(">> [AUTO PIR] 10s cumplidos sin presencia -> FOCO APAGADO");
        lastMsg = 0;
      }
    }
  }

  // 3. Envío periódico de Telemetría cada 4.8 segundos (o inmediata tras cambio)
  if (now - lastMsg > 4800) {
    lastMsg = now;
    enviarTelemetria();
  }

  delay(10);
}

// ─── ENVÍO DE TELEMETRÍA ────────────────────────────────────────────────────
void enviarTelemetria() {
  int rawLdr = analogRead(PIN_LDR);
  int lightLevel = constrain(map(rawLdr, 0, 4095, 100, 0), 0, 100);
  bool presence = presenciaOcupada; // Reporta presencia continua durante los 10 segundos
  String modoActual = modoManual ? "manual" : "auto";

  // Publicar telemetría con el formato exacto que espera el Backend
  String payloadSim = "{\"deviceId\":\"sim-01\",\"presence\":" + String(presence ? "true" : "false") +
                      ",\"lightLevel\":" + String(lightLevel) +
                      ",\"light\":\"" + estadoFocoGlobal +
                      "\",\"mode\":\"" + modoActual + "\"}";

  client.publish("sila/sim-01/telemetry", payloadSim.c_str());

  String payloadEsp = "{\"deviceId\":\"esp32-01\",\"presence\":" + String(presence ? "true" : "false") +
                      ",\"lightLevel\":" + String(lightLevel) +
                      ",\"light\":\"" + estadoFocoGlobal +
                      "\",\"mode\":\"" + modoActual + "\"}";

  client.publish("sila/esp32-01/telemetry", payloadEsp.c_str());

  Serial.printf("[TELEMETRIA] Luz: %s | Modo: %s | Presencia: %s (10s) | NivelLuz: %d%%\n",
                estadoFocoGlobal.c_str(), modoActual.c_str(), presence ? "SI" : "NO", lightLevel);
}
