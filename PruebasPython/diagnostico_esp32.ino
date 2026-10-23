/*
  DIAGNOSTICO ESP32 - PIR + LDR (modulo AO) + RELE/LED
  Sin WiFi ni MQTT: solo prueba el hardware y dice donde falla.

  Pines:  PIR OUT -> GPIO 27 | LDR AO -> GPIO 34 | RELE/LED IN -> GPIO 26
  Monitor Serial: 115200 baudios

  Comandos por serial (escribe una letra y Enter):
    r = alternar rele/LED
    i = invertir logica del rele (ACTIVE_LOW <-> ACTIVE_HIGH)
    s = mostrar resumen de diagnostico ahora
*/

#include <esp_system.h>

#define PIN_PIR    27
#define PIN_LDR    34
#define PIN_RELAY  26

// true = rele se activa con LOW (la mayoria de modulos de rele)
// false = se activa con HIGH (LED de prueba)
bool relayActiveLow = true;

const unsigned long PIR_WARMUP_MS   = 60000;  // estabilizacion del PIR
const unsigned long SAMPLE_MS       = 500;
const unsigned long SUMMARY_MS      = 15000;

bool relayOn = false;
unsigned long tStart, tLastSample, tLastSummary;

// Estadisticas de la ventana
int ldrMin = 4095, ldrMax = 0;
long ldrSum = 0;
int ldrCount = 0;
int pirChanges = 0;
int pirHighSamples = 0, pirSamples = 0;
int lastPir = -1;

void setRelay(bool on) {
  relayOn = on;
  digitalWrite(PIN_RELAY, (on ^ relayActiveLow) ? HIGH : LOW);
  // on=true,activeLow=true  -> LOW  | on=true,activeLow=false -> HIGH
  // on=false,activeLow=true -> HIGH | on=false,activeLow=false -> LOW
}

const char* motivoReset() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "POWERON (encendido normal)";
    case ESP_RST_SW:       return "SW (reinicio por software)";
    case ESP_RST_PANIC:    return "PANIC (el codigo se cayo)";
    case ESP_RST_INT_WDT:  return "INT_WDT (watchdog interrupcion)";
    case ESP_RST_TASK_WDT: return "TASK_WDT (watchdog tarea)";
    case ESP_RST_WDT:      return "WDT (watchdog)";
    case ESP_RST_BROWNOUT: return "BROWNOUT (caida de voltaje: alimentacion insuficiente o corto)";
    case ESP_RST_DEEPSLEEP:return "DEEPSLEEP";
    default:               return "DESCONOCIDO";
  }
}

void resetStats() {
  ldrMin = 4095; ldrMax = 0; ldrSum = 0; ldrCount = 0;
  pirChanges = 0; pirHighSamples = 0; pirSamples = 0;
}

void resumen() {
  Serial.println();
  Serial.println("------------- DIAGNOSTICO -------------");

  // ---- LDR ----
  if (ldrCount == 0) {
    Serial.println("LDR : sin muestras");
  } else {
    int prom = ldrSum / ldrCount;
    int var = ldrMax - ldrMin;
    Serial.printf("LDR : raw min=%d max=%d prom=%d variacion=%d\n", ldrMin, ldrMax, prom, var);
    if (prom < 50 && var < 50) {
      Serial.println("  -> FALLO: lectura ~0 fija. AO desconectado, GND en AO, o VCC del modulo sin 3V3.");
    } else if (prom > 4000 && var < 50) {
      Serial.println("  -> FALLO: lectura saturada (~4095). AO en 3V3, o modulo con VCC en 5V, o sin GND.");
    } else if (var < 150) {
      Serial.println("  -> SIN VARIACION: tapa el sensor y luego iluminalo con la linterna.");
      Serial.println("     Si sigue igual, revisa AO->GPIO34, VCC->3V3 y GND.");
    } else {
      Serial.println("  -> OK: el LDR responde a la luz.");
      Serial.println("     (Si con luz el numero BAJA, el modulo esta invertido: usa 100 - lightLevel)");
    }
  }

  // ---- PIR ----
  if (millis() - tStart < PIR_WARMUP_MS) {
    Serial.printf("PIR : calentando (%lu s de 60). Ignora las lecturas.\n",
                  (PIR_WARMUP_MS - (millis() - tStart)) / 1000);
  } else if (pirSamples == 0) {
    Serial.println("PIR : sin muestras");
  } else {
    Serial.printf("PIR : cambios=%d, %% en HIGH=%d\n", pirChanges, (pirHighSamples * 100) / pirSamples);
    if (pirChanges == 0 && pirHighSamples == 0) {
      Serial.println("  -> SIN SENAL: mueve la mano frente al PIR.");
      Serial.println("     Si nunca cambia: revisa VCC->VIN(5V), GND, OUT->GPIO27 y sensibilidad.");
    } else if (pirChanges == 0 && pirHighSamples == pirSamples) {
      Serial.println("  -> FALLO: siempre en HIGH. Revisa jumper H/L, alimentacion 5V estable o espera mas calentamiento.");
    } else {
      Serial.println("  -> OK: el PIR detecta movimiento y vuelve a reposo.");
    }
  }

  // ---- Rele ----
  Serial.printf("RELE: estado=%s, logica=%s (cambia con 'i', alterna con 'r')\n",
                relayOn ? "ENCENDIDO" : "APAGADO",
                relayActiveLow ? "ACTIVE_LOW" : "ACTIVE_HIGH");
  Serial.println("--------------------------------------");
  Serial.println();
  resetStats();
}

void setup() {
  // Rele apagado ANTES de configurar el pin (evita un "clic" al arrancar)
  digitalWrite(PIN_RELAY, relayActiveLow ? HIGH : LOW);
  pinMode(PIN_RELAY, OUTPUT);
  setRelay(false);

  pinMode(PIN_PIR, INPUT_PULLDOWN);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_LDR, ADC_11db);

  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("  DIAGNOSTICO ESP32  (PIR + LDR + RELE/LED)");
  Serial.println("==================================================");
  Serial.printf("Motivo del ultimo reinicio: %s\n", motivoReset());
  Serial.printf("Chip: %s rev %d, %d nucleos, %u MHz\n",
                ESP.getChipModel(), ESP.getChipRevision(), ESP.getChipCores(), ESP.getCpuFreqMHz());
  Serial.printf("Flash: %u KB | Heap libre: %u bytes\n", ESP.getFlashChipSize() / 1024, ESP.getFreeHeap());
  Serial.printf("Pines: PIR=%d LDR=%d RELE=%d\n", PIN_PIR, PIN_LDR, PIN_RELAY);
  Serial.println("Si el motivo es BROWNOUT/WDT: problema de alimentacion o cortocircuito.");
  Serial.println();

  // ---- Prueba del rele/LED ----
  Serial.println("[TEST 1] Rele/LED: 3 pulsos (debes oir 'clic' o ver el LED parpadear)");
  for (int i = 0; i < 3; i++) {
    setRelay(true);  Serial.println("  ON");  delay(500);
    setRelay(false); Serial.println("  OFF"); delay(500);
  }
  Serial.println("  Si no hubo clic/parpadeo: prueba el comando 'i' (logica invertida),");
  Serial.println("  revisa IN->GPIO26, VCC->VIN(5V) y GND.");
  Serial.println();

  Serial.println("[TEST 2/3] LDR y PIR en vivo cada 0.5 s. Resumen cada 15 s.");
  Serial.println("Tapa/ilumina el LDR y mueve la mano frente al PIR (el PIR calienta 60 s).");
  Serial.println();

  tStart = millis();
  tLastSample = tStart;
  tLastSummary = tStart;
}

void loop() {
  // Comandos
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'r') { setRelay(!relayOn); Serial.printf(">> RELE %s\n", relayOn ? "ENCENDIDO" : "APAGADO"); }
    else if (c == 'i') {
      relayActiveLow = !relayActiveLow;
      setRelay(relayOn);
      Serial.printf(">> Logica: %s\n", relayActiveLow ? "ACTIVE_LOW" : "ACTIVE_HIGH");
    }
    else if (c == 's') resumen();
  }

  unsigned long now = millis();

  if (now - tLastSample >= SAMPLE_MS) {
    tLastSample = now;

    int raw = analogRead(PIN_LDR);
    float volt = raw * 3.3f / 4095.0f;
    int pct = map(raw, 0, 4095, 0, 100);
    int pir = digitalRead(PIN_PIR);

    ldrMin = min(ldrMin, raw);
    ldrMax = max(ldrMax, raw);
    ldrSum += raw;
    ldrCount++;

    bool pirListo = (now - tStart) >= PIR_WARMUP_MS;
    if (pirListo) {
      pirSamples++;
      if (pir) pirHighSamples++;
      if (lastPir != -1 && pir != lastPir) {
        pirChanges++;
        Serial.printf(">> PIR cambio a %s\n", pir ? "MOVIMIENTO" : "REPOSO");
      }
      lastPir = pir;
    }

    Serial.printf("LDR raw=%4d  %.2fV  (%3d%%) | PIR=%s%s | RELE=%s\n",
                  raw, volt, pct,
                  pir ? "HIGH" : "LOW ",
                  pirListo ? "" : " (calentando)",
                  relayOn ? "ON" : "OFF");
  }

  if (now - tLastSummary >= SUMMARY_MS) {
    tLastSummary = now;
    resumen();
  }
}
