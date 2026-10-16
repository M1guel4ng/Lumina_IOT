/**
 * ============================================================================
 * Proyecto: SILA (Sistema de Iluminación Adaptativa)
 * Firmware: Nodo Físico ESP32 (esp32-01)
 *
 * Cumple con:
 * - Contrato MQTT: docs/mqtt-contract.md
 * - Reglas de Decisión: docs/decision-rules.md
 *
 * Hardware:
 * - ESP32 NodeMCU 30 pines CP2102
 * - Sensor PIR HC-SR501 en GPIO 27
 * - Sensor LDR + Resistencia 10k en GPIO 34 (ADC1_CH6)
 * - Módulo Relé 5V en GPIO 26
 *
 * Librerías necesarias (Instalar desde el Gestor de Bibliotecas de Arduino IDE):
 * 1. PubSubClient por Nick O'Leary
 * 2. ArduinoJson por Benoit Blanchon (versión 6 o 7)
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "config.h"

// ─── Variables de Estado Global ──────────────────────────────────────────────
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Estado actual del nodo
bool currentPresence = false;
int currentLightLevel = 0;
String currentLight = "off";     // "on" | "off"
String currentMode = "auto";     // "auto" | "manual"
String lastManualCommand = "off";

// Parámetros dinámicos (actualizables vía sila/{deviceId}/config)
int lightOnThreshold = DEFAULT_LIGHT_ON_THRESHOLD;
int lightOffThreshold = DEFAULT_LIGHT_OFF_THRESHOLD;
unsigned long offDelaySec = DEFAULT_OFF_DELAY_SEC;

// Tiempos y temporizadores (no bloqueantes)
unsigned long bootAt = 0;
unsigned long lastPresenceAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastTelemetryAt = 0;
unsigned long lastMqttRetryAt = 0;
unsigned long lastWifiRetryAt = 0;
unsigned long lastManualModeAt = 0;

// Caché de telemetría para detectar cambios significativos
bool lastReportedPresence = false;
String lastReportedLight = "off";
String lastReportedMode = "auto";
int lastReportedLightLevel = -999;

// Topics MQTT formateados
char topicTelemetry[64];
char topicStatus[64];
char topicHeartbeat[64];
char topicCmdLight[64];
char topicCmdMode[64];
char topicConfig[64];

// ─── Prototipos de Funciones ─────────────────────────────────────────────────
void setupPins();
void setupMqttTopics();
void connectWiFi();
void connectMqtt();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void handleCommandLight(const JsonDocument& doc);
void handleCommandMode(const JsonDocument& doc);
void handleConfig(const JsonDocument& doc);
void readSensors();
void evaluateDecisionRules();
void setRelay(bool on);
void publishTelemetry(bool force = false);
void publishHeartbeat();
String getIsoTimestamp();

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);

    bootAt = millis();
    Serial.println("\n==================================================");
    Serial.println("  SILA - Nodo IoT Físico ESP32 (" DEVICE_ID ")");
    Serial.println("==================================================");

    setupPins();
    setupMqttTopics();

    // Configurar cliente MQTT
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    // IMPORTANTE (Sección 1 del contrato): Búfer de 512 bytes para mensajes JSON
    mqttClient.setBufferSize(512);

    // Conectar a la red Wi-Fi
    connectWiFi();

    // Inicializar sincronización horaria por NTP
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);

    Serial.println("[SETUP] ESP32 iniciado correctamente.");
    Serial.printf("[SETUP] Estabilización PIR: %d segundos en curso...\n", PIR_WARMUP_SEC);
}

// ─── LOOP PRINCIPAL (No bloqueante) ──────────────────────────────────────────
void loop() {
    unsigned long now = millis();

    // 1. Mantener conexión Wi-Fi
    if (WiFi.status() != WL_CONNECTED) {
        if (now - lastWifiRetryAt > 5000) {
            lastWifiRetryAt = now;
            connectWiFi();
        }
    } else {
        // 2. Mantener conexión MQTT
        if (!mqttClient.connected()) {
            if (now - lastMqttRetryAt > 5000) {
                lastMqttRetryAt = now;
                connectMqtt();
            }
        } else {
            mqttClient.loop();
        }
    }

    // 3. Lectura periódica de sensores (cada 200 ms)
    static unsigned long lastSensorRead = 0;
    if (now - lastSensorRead >= 200) {
        lastSensorRead = now;
        readSensors();
    }

    // 4. Evaluar reglas de decisión de iluminación (docs/decision-rules.md)
    evaluateDecisionRules();

    // 5. Publicar telemetría si hubo cambio de estado relevante
    publishTelemetry(false);

    // 6. Publicar latido (Heartbeat) periódico cada 10 s
    if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt = now;
        publishHeartbeat();
    }

    // Pequeño retardo de cortesía para el Watchdog del ESP32
    delay(10);
}

// ─── CONFIGURACIÓN DE PINES ──────────────────────────────────────────────────
void setupPins() {
    // Sensor PIR como entrada digital
    pinMode(PIN_PIR, INPUT);

    // Pin LDR como entrada analógica (ADC1_CH6 en GPIO 34)
    pinMode(PIN_LDR, INPUT);

    // Relé como salida digital
    pinMode(PIN_RELAY, OUTPUT);

    // Estado inicial seguro: Relé apagado
    setRelay(false);

    Serial.printf("[HW] Pines configurados: PIR=%d, LDR=%d, RELAY=%d\n",
                  PIN_PIR, PIN_LDR, PIN_RELAY);
}

// ─── FORMATEO DE TOPICS MQTT ────────────────────────────────────────────────
void setupMqttTopics() {
    snprintf(topicTelemetry, sizeof(topicTelemetry), "%s/%s/telemetry", TOPIC_PREFIX, DEVICE_ID);
    snprintf(topicStatus,    sizeof(topicStatus),    "%s/%s/status",    TOPIC_PREFIX, DEVICE_ID);
    snprintf(topicHeartbeat, sizeof(topicHeartbeat), "%s/%s/heartbeat", TOPIC_PREFIX, DEVICE_ID);
    snprintf(topicCmdLight,  sizeof(topicCmdLight),  "%s/%s/cmd/light",  TOPIC_PREFIX, DEVICE_ID);
    snprintf(topicCmdMode,   sizeof(topicCmdMode),   "%s/%s/cmd/mode",   TOPIC_PREFIX, DEVICE_ID);
    snprintf(topicConfig,    sizeof(topicConfig),    "%s/%s/config",    TOPIC_PREFIX, DEVICE_ID);
}

// ─── CONEXIÓN WI-FI ──────────────────────────────────────────────────────────
void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.printf("[WIFI] Conectando a red: %s ...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(300);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WIFI] ¡Conectado!");
        Serial.printf("[WIFI] IP asignada: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WIFI] Intensidad RSSI: %d dBm\n", WiFi.RSSI());
    } else {
        Serial.println("\n[WIFI] No se pudo conectar a la red Wi-Fi. Reintentando...");
    }
}

// ─── CONEXIÓN MQTT ───────────────────────────────────────────────────────────
void connectMqtt() {
    if (mqttClient.connected()) return;

    Serial.printf("[MQTT] Conectando a broker %s:%d ...\n", MQTT_SERVER, MQTT_PORT);

    // Configuración LWT (Last Will and Testament) según sección 4 del contrato:
    // Topic: sila/{deviceId}/status, Payload: "offline", QoS: 1, Retained: true
    const char* lwtTopic = topicStatus;
    const char* lwtMessage = "offline";
    uint8_t lwtQos = 1;
    bool lwtRetain = true;

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
        connected = mqttClient.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD,
                                       lwtTopic, lwtQos, lwtRetain, lwtMessage);
    } else {
        connected = mqttClient.connect(DEVICE_ID, lwtTopic, lwtQos, lwtRetain, lwtMessage);
    }

    if (connected) {
        Serial.println("[MQTT] ¡Conectado al broker!");

        // Publicar "online" retenido en topic sila/{deviceId}/status
        mqttClient.publish(topicStatus, "online", true);
        Serial.printf("[MQTT] Publicado status: online en %s\n", topicStatus);

        // Suscribirse a comandos y configuración
        mqttClient.subscribe(topicCmdLight, 1);
        mqttClient.subscribe(topicCmdMode, 1);
        mqttClient.subscribe(topicConfig, 1);
        Serial.printf("[MQTT] Suscrito a comandos: %s, %s, %s\n",
                      topicCmdLight, topicCmdMode, topicConfig);

        // Publicar telemetría inicial de bienvenida
        publishTelemetry(true);
    } else {
        Serial.printf("[MQTT] Falló conexión. rc=%d. Reintentando en 5s...\n", mqttClient.state());
    }
}

// ─── CALLBACK DE MENSAJES MQTT ENTRANTES ─────────────────────────────────────
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String payloadStr = "";
    for (unsigned int i = 0; i < length; i++) {
        payloadStr += (char)payload[i];
    }
    Serial.printf("[MQTT RECV] %s -> %s\n", topic, payloadStr.c_str());

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payloadStr);
    if (error) {
        Serial.printf("[MQTT ERR] JSON inválido: %s\n", error.c_str());
        return;
    }

    if (strcmp(topic, topicCmdLight) == 0) {
        handleCommandLight(doc);
    } else if (strcmp(topic, topicCmdMode) == 0) {
        handleCommandMode(doc);
    } else if (strcmp(topic, topicConfig) == 0) {
        handleConfig(doc);
    }
}

// ─── MANEJADORES DE COMANDOS ────────────────────────────────────────────────
void handleCommandLight(const JsonDocument& doc) {
    // docs/mqtt-contract.md sección 5.1:
    // Solo se aplica en modo 'manual'. Si llega en 'auto', se ignora.
    if (currentMode != "manual") {
        Serial.println("[CMD LIGHT] Ignorado: El nodo está en modo automático.");
        publishTelemetry(true);
        return;
    }

    if (!doc["state"].is<const char*>()) return;
    String state = doc["state"].as<String>();

    if (state == "on" || state == "off") {
        lastManualCommand = state;
        setRelay(state == "on");
        Serial.printf("[CMD LIGHT] Ejecutado: luminaria -> %s\n", state.c_str());
        // Confirmación inmediata por telemetría (sección 5.3)
        publishTelemetry(true);
    }
}

void handleCommandMode(const JsonDocument& doc) {
    if (!doc["mode"].is<const char*>()) return;
    String mode = doc["mode"].as<String>();

    if (mode == "auto" || mode == "manual") {
        currentMode = mode;
        if (mode == "manual") {
            lastManualModeAt = millis();
            // Conserva el estado que tenía
            lastManualCommand = currentLight;
        }
        Serial.printf("[CMD MODE] Modo cambiado a: %s\n", mode.c_str());
        // Al pasar a auto, se evalúan de inmediato las reglas de decisión
        if (mode == "auto") {
            evaluateDecisionRules();
        }
        // Confirmación inmediata por telemetría
        publishTelemetry(true);
    }
}

void handleConfig(const JsonDocument& doc) {
    if (doc["lightOnThreshold"].is<int>()) {
        lightOnThreshold = doc["lightOnThreshold"];
    }
    if (doc["lightOffThreshold"].is<int>()) {
        lightOffThreshold = doc["lightOffThreshold"];
    }
    if (doc["offDelaySec"].is<unsigned long>()) {
        offDelaySec = doc["offDelaySec"];
    }
    Serial.printf("[CONFIG] Actualizado: Umbrales (%d / %d), delay: %lu s\n",
                  lightOnThreshold, lightOffThreshold, offDelaySec);
}

// ─── LECTURA DE SENSORES ─────────────────────────────────────────────────────
void readSensors() {
    unsigned long now = millis();

    // 1. Lectura del sensor PIR
    bool pirRaw = (digitalRead(PIN_PIR) == HIGH);

    // Warmup del PIR: Durante los primeros 60 s tras boot se ignora (docs/decision-rules.md sec 6)
    if (now - bootAt < (PIR_WARMUP_SEC * 1000UL)) {
        currentPresence = false;
    } else {
        currentPresence = pirRaw;
        if (currentPresence) {
            lastPresenceAt = now;
        }
    }

    // 2. Lectura del sensor LDR (Divisor de tensión)
    // Hacemos un promedio de 8 lecturas para filtrar ruido analógico
    long adcSum = 0;
    for (int i = 0; i < 8; i++) {
        adcSum += analogRead(PIN_LDR);
        delayMicroseconds(50);
    }
    int rawAdc = adcSum / 8;

    // Mapeo a escala 0 (oscuridad) a 100 (luz máxima)
    int mappedLight = map(rawAdc, ADC_DARK_VALUE, ADC_BRIGHT_VALUE, 0, 100);
    currentLightLevel = constrain(mappedLight, 0, 100);
}

// ─── REGLAS DE DECISIÓN (docs/decision-rules.md) ──────────────────────────────
void evaluateDecisionRules() {
    unsigned long now = millis();

    // Cálculo de 'occupied'
    bool occupied = false;
    if (now - bootAt >= (PIR_WARMUP_SEC * 1000UL)) {
        occupied = currentPresence || ((now - lastPresenceAt) < (offDelaySec * 1000UL));
    }

    // Manejo de Modo Manual
    if (currentMode == "manual") {
        // Regla 7: Si pasa más de 10 min sin conexión en manual, vuelve solo a auto
        if (!mqttClient.connected() && (now - lastManualModeAt > MANUAL_TIMEOUT_MS)) {
            Serial.println("[RULES] Timeout de desconexión en modo manual. Volviendo a AUTO.");
            currentMode = "auto";
        } else {
            // Regla 1: En manual obedece el último comando manual
            setRelay(lastManualCommand == "on");
            return;
        }
    }

    // Modo Automático (Reglas 2 a 7):
    if (!occupied) {
        // Regla 3: Si no hay ocupación -> OFF
        setRelay(false);
    } else {
        // Hay ocupación (occupied == true)
        if (currentLight == "off") {
            // Regla 4 y 5: Si está apagada y la luz es menor al umbral de encendido -> ON
            if (currentLightLevel < lightOnThreshold) {
                setRelay(true);
            }
            // Si currentLightLevel >= lightOnThreshold, sigue apagada (regla 5)
        } else {
            // Regla 6 y 7: Si está encendida y la luz supera el umbral de apagado -> OFF
            if (currentLightLevel > lightOffThreshold) {
                setRelay(false);
            }
            // Si currentLightLevel <= lightOffThreshold, sigue encendida por histéresis (regla 6)
        }
    }
}

// ─── CONTROL DEL RELÉ ────────────────────────────────────────────────────────
void setRelay(bool on) {
    currentLight = on ? "on" : "off";

    // Manejo de relés Active-LOW o Active-HIGH
    if (RELAY_ACTIVE_LOW) {
        digitalWrite(PIN_RELAY, on ? LOW : HIGH);
    } else {
        digitalWrite(PIN_RELAY, on ? HIGH : LOW);
    }
}

// ─── PUBLICACIÓN DE TELEMETRÍA ───────────────────────────────────────────────
void publishTelemetry(bool force) {
    if (!mqttClient.connected()) return;

    unsigned long now = millis();

    // Detectar si hubo cambio de estado real
    bool stateChanged = (currentPresence != lastReportedPresence) ||
                        (currentLight != lastReportedLight) ||
                        (currentMode != lastReportedMode);

    // Detectar cambio de luz ambiental mayor o igual a 5 puntos
    bool lightLevelChanged = abs(currentLightLevel - lastReportedLightLevel) >= TELEMETRY_LIGHT_DELTA;

    if (!force && !stateChanged && !lightLevelChanged) {
        return;
    }

    // Límite de tasa: máximo 1 telemetría por segundo (excepto comandos forzados)
    if (!force && (now - lastTelemetryAt < 1000)) {
        return;
    }

    lastTelemetryAt = now;
    lastReportedPresence = currentPresence;
    lastReportedLight = currentLight;
    lastReportedMode = currentMode;
    lastReportedLightLevel = currentLightLevel;

    // Crear JSON de telemetría (docs/mqtt-contract.md sección 3)
    JsonDocument doc;
    doc["deviceId"] = DEVICE_ID;
    doc["presence"] = currentPresence;
    doc["lightLevel"] = currentLightLevel;
    doc["light"] = currentLight;
    doc["mode"] = currentMode;

    String ts = getIsoTimestamp();
    if (ts.length() > 0) {
        doc["ts"] = ts;
    }

    char buffer[256];
    serializeJson(doc, buffer);

    mqttClient.publish(topicTelemetry, buffer, false);
    Serial.printf("[TELEMETRY] %s -> %s\n", topicTelemetry, buffer);
}

// ─── PUBLICACIÓN DE HEARTBEAT ────────────────────────────────────────────────
void publishHeartbeat() {
    if (!mqttClient.connected()) return;

    JsonDocument doc;
    doc["deviceId"] = DEVICE_ID;
    doc["uptime"] = (long)(millis() / 1000);

    String ts = getIsoTimestamp();
    if (ts.length() > 0) {
        doc["ts"] = ts;
    }

    char buffer[128];
    serializeJson(doc, buffer);

    // Topic de latido: sila/{deviceId}/heartbeat (no satura eventos históricos)
    mqttClient.publish(topicHeartbeat, buffer, false);
}

// ─── UTILIDAD: FECHA ISO 8601 UTC ───────────────────────────────────────────
String getIsoTimestamp() {
    time_t now;
    struct tm timeinfo;
    time(&now);

    if (now < 100000) {
        // Reloj NTP aún no sincronizado
        return "";
    }

    gmtime_r(&now, &timeinfo);
    char buf[25];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    return String(buf);
}
