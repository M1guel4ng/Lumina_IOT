import mqtt, { type MqttClient } from "mqtt";
import { isTelemetryPayload, processHeartbeat, processStatus, processTelemetry } from "./nodeStateService.js";

let client: MqttClient | undefined;
export function startMqtt(url: string): MqttClient {
  client = mqtt.connect(url, { clientId: `lumina-backend-${process.pid}`, clean: true, reconnectPeriod: 2000, connectTimeout: 5000 });
  client.on("connect", () => {
    console.log(`MQTT conectado: ${url}`);
    client?.subscribe(["sila/+/telemetry", "sila/+/status", "sila/+/heartbeat"], { qos: 1 }, (error) => {
      if (error) console.error("No se pudo suscribir a MQTT:", error.message);
    });
  });
  client.on("reconnect", () => console.log("Reconectando con MQTT..."));
  client.on("error", (error) => console.error("MQTT:", error.message));
  client.on("message", (topic, buffer) => void handleMessage(topic, buffer.toString("utf8")));
  return client;
}

async function handleMessage(topic: string, message: string): Promise<void> {
  const match = /^sila\/([a-z0-9-]+)\/(telemetry|status|heartbeat)$/.exec(topic);
  if (!match) return;
  const deviceId = match[1]!;
  try {
    if (match[2] === "heartbeat") {
      await processHeartbeat(deviceId);
      return;
    }
    if (match[2] === "status") {
      if (message === "online" || message === "offline") await processStatus(deviceId, message);
      return;
    }
    const payload: unknown = JSON.parse(message);
    if (isTelemetryPayload(payload, deviceId)) await processTelemetry(payload);
    else console.warn(`Telemetría inválida ignorada para ${deviceId}`);
  } catch (error) { console.error(`Mensaje MQTT inválido en ${topic}:`, error instanceof Error ? error.message : "error desconocido"); }
}

/**
 * Publish a command to a specific node's command topic.
 * Topic: sila/{deviceId}/cmd
 * Payload: JSON string, e.g. { "light": "on" }
 */
export function publishCommand(deviceId: string, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!client || !client.connected) { reject(new Error("MQTT no está conectado.")); return; }
    // Tópico unificado: sila/{deviceId}/cmd
    client.publish(`sila/${deviceId}/cmd`, JSON.stringify(payload), { qos: 1 });
    // Tópico específico de foco: sila/{deviceId}/cmd/light (compatible con simulador y firmware previo)
    if (payload.light !== undefined) {
      client.publish(`sila/${deviceId}/cmd/light`, JSON.stringify({ state: payload.light }), { qos: 1 });
    }
    resolve();
  });
}

export async function stopMqtt(): Promise<void> {
  if (!client) return;
  await new Promise<void>((resolve, reject) => client!.end(false, {}, (error) => error ? reject(error) : resolve()));
  client = undefined;
}
