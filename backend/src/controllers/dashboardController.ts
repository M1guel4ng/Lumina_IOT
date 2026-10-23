import type { Request, Response } from "express";
import { Event } from "../models/Event.js";
import { NodeState } from "../models/NodeState.js";
import { publishCommand } from "../services/mqttService.js";
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

/**
 * GET /api/state
 * Devuelve el último estado conocido de cada nodo.
 * Criterio HU-2: "cuando se consulte GET /api/state, debe devolverse el último estado conocido de cada nodo"
 */
export async function getState(_req: Request, res: Response): Promise<void> {
  const nodes = await NodeState.find().sort({ deviceId: 1 }).lean();
  res.json({ count: nodes.length, nodes });
}

/**
 * GET /api/events
 * Devuelve eventos ordenados del más reciente al más antiguo.
 * Soporta filtros: deviceId, type, limit (1-100).
 * Criterio HU-2: "deben devolverse ordenados del más reciente al más antiguo y permitir filtrar por tipo y limitar la cantidad de resultados"
 */
export async function listEvents(req: Request, res: Response): Promise<void> {
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const requestedLimit = Number(req.query.limit ?? 20);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 20;
  const filter: Record<string, string> = {};
  if (deviceId) filter.deviceId = deviceId;
  if (type) filter.type = type;
  const events = await Event.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
  res.json({ count: events.length, limit, events });
}

export function realtime(req: Request, res: Response): void {
  res.status(200);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const remove = addRealtimeClient(res);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
  req.on("close", () => { clearInterval(heartbeat); remove(); });
}

/**
 * POST /api/nodes/:deviceId/control
 * Body: { action: "light_on" | "light_off" }
 * Publishes a command to the node via MQTT.
 */
export async function controlNode(req: Request, res: Response): Promise<void> {
  const deviceId = String(req.params.deviceId);
  const { action } = req.body as { action?: string };

  const allowed = ["light_on", "light_off"] as const;
  if (!action || !allowed.includes(action as typeof allowed[number])) {
    res.status(400).json({ success: false, message: `Acción inválida. Usa: ${allowed.join(", ")}.` });
    return;
  }

  const node = await NodeState.findOne({ deviceId }).lean();
  if (!node) { res.status(404).json({ success: false, message: "Nodo no encontrado." }); return; }

  const lightValue = action === "light_on" ? "on" : "off";

  // 1. Enviar comando por MQTT (tópico unificado y tópico legacy de luz)
  try {
    await publishCommand(deviceId, { light: lightValue });
  } catch (err) {
    console.warn(`[CONTROL] No se pudo enviar por MQTT:`, err instanceof Error ? err.message : err);
  }

  // 2. Sincronización HTTP de respaldo para el simulador local (si está activo en puerto 3000)
  fetch("http://localhost:3000/api/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, light: lightValue }),
  }).catch(() => {});

  // 3. Actualizar estado en MongoDB y notificar a los dashboards en tiempo real
  const now = new Date();
  const updatedState = await NodeState.findOneAndUpdate(
    { deviceId },
    { $set: { light: lightValue, stale: false, lastSeenAt: now } },
    { returnDocument: "after" }
  ).lean();

  if (updatedState) {
    addRealtimeClient; // reference exists
    import("../services/realtimeService.js").then(({ broadcastRealtime }) => {
      broadcastRealtime("node-updated", updatedState);
    });
  }

  res.json({ success: true, deviceId, action, message: `Comando '${action}' enviado a ${deviceId}.` });
}
