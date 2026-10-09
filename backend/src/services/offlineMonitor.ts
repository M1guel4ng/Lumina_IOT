import { Event } from "../models/Event.js";
import { NodeState } from "../models/NodeState.js";
import { broadcastRealtime } from "./realtimeService.js";

let timer: NodeJS.Timeout | undefined;
export function startOfflineMonitor(offlineMs: number): void {
  timer = setInterval(() => void markOfflineNodes(offlineMs), 5000);
  timer.unref();
}

export async function markOfflineNodes(offlineMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - offlineMs);
  const nodes = await NodeState.find({ status: "online", lastSeenAt: { $lt: cutoff } }).lean();
  if (!nodes.length) return 0;
  const ids = nodes.map((node) => node.deviceId);
  await NodeState.updateMany({ deviceId: { $in: ids } }, { $set: { status: "offline", stale: true } });
  await Event.insertMany(ids.map((deviceId) => ({ deviceId, type: "connection", value: "offline", source: "system", timestamp: new Date() })));
  for (const node of nodes) broadcastRealtime("node-offline", { ...node, status: "offline", stale: true });
  return nodes.length;
}

export function stopOfflineMonitor(): void { if (timer) clearInterval(timer); timer = undefined; }
