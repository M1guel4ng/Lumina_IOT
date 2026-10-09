import type { Request, Response } from "express";
import { Event } from "../models/Event.js";
import { NodeState } from "../models/NodeState.js";
import { addRealtimeClient } from "../services/realtimeService.js";

export async function listNodes(_req: Request, res: Response): Promise<void> {
  const nodes = await NodeState.find().sort({ deviceId: 1 }).lean();
  res.json({ nodes });
}

export async function getNode(req: Request, res: Response): Promise<void> {
  const node = await NodeState.findOne({ deviceId: String(req.params.deviceId) }).lean();
  if (!node) { res.status(404).json({ success: false, message: "Nodo no encontrado." }); return; }
  res.json(node);
}

export async function listEvents(req: Request, res: Response): Promise<void> {
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const requestedLimit = Number(req.query.limit ?? 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 10;
  const filter: Record<string, string> = {};
  if (deviceId) filter.deviceId = deviceId;
  if (type) filter.type = type;
  const events = await Event.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
  res.json({ events });
}

export function realtime(req: Request, res: Response): void {
  res.status(200);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const remove = addRealtimeClient(res);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
  req.on("close", () => { clearInterval(heartbeat); remove(); });
}
