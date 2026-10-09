import { Event } from "../models/Event.js";
import { NodeState } from "../models/NodeState.js";
import { broadcastRealtime } from "./realtimeService.js";

export interface TelemetryPayload { deviceId: string; presence: boolean; lightLevel: number; light: "on" | "off"; mode: "auto" | "manual"; ts?: string; }

export function isTelemetryPayload(value: unknown, topicDeviceId: string): value is TelemetryPayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.deviceId === topicDeviceId && typeof item.presence === "boolean" && Number.isInteger(item.lightLevel) && Number(item.lightLevel) >= 0 && Number(item.lightLevel) <= 100 && ["on", "off"].includes(String(item.light)) && ["auto", "manual"].includes(String(item.mode));
}

export async function processTelemetry(payload: TelemetryPayload): Promise<void> {
  const now = new Date();
  const previous = await NodeState.findOne({ deviceId: payload.deviceId }).lean();
  const state = await NodeState.findOneAndUpdate(
    { deviceId: payload.deviceId },
    { $set: { presence: payload.presence, lightLevel: payload.lightLevel, light: payload.light, mode: payload.mode, status: "online", stale: false, lastSeenAt: now, lastTelemetryAt: now } },
    { upsert: true, new: true, runValidators: true },
  ).lean();

  const events: Array<{ deviceId: string; type: string; value: unknown; source: string; timestamp: Date }> = [];
  if (!previous || previous.presence !== payload.presence) events.push({ deviceId: payload.deviceId, type: "presence", value: payload.presence, source: "node", timestamp: now });
  if (!previous || previous.light !== payload.light) events.push({ deviceId: payload.deviceId, type: "light", value: payload.light, source: "node", timestamp: now });
  if (!previous || previous.mode !== payload.mode) events.push({ deviceId: payload.deviceId, type: "mode", value: payload.mode, source: "node", timestamp: now });
  if (!previous || previous.lightLevel == null || Math.abs(previous.lightLevel - payload.lightLevel) > 10) events.push({ deviceId: payload.deviceId, type: "lightLevel", value: payload.lightLevel, source: "node", timestamp: now });
  if (!previous || previous.status !== "online") events.push({ deviceId: payload.deviceId, type: "connection", value: "online", source: "system", timestamp: now });
  if (events.length) await Event.insertMany(events);
  broadcastRealtime(previous?.status === "online" ? "node-updated" : "node-online", state);
}

export async function processStatus(deviceId: string, status: "online" | "offline"): Promise<void> {
  const now = new Date();
  const previous = await NodeState.findOne({ deviceId }).lean();
  const update = status === "online" ? { status, stale: false, lastSeenAt: now } : { status, stale: true };
  const state = await NodeState.findOneAndUpdate({ deviceId }, { $set: update }, { upsert: true, new: true, runValidators: true }).lean();
  if (!previous || previous.status !== status) await Event.create({ deviceId, type: "connection", value: status, source: "system", timestamp: now });
  broadcastRealtime(status === "online" ? "node-online" : "node-offline", state);
}
