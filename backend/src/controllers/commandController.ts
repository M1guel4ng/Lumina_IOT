import type { Request, Response } from "express";
import { CommandError, sendLight, sendMode } from "../services/commandService.js";

const DEVICE_ID = /^[a-z0-9-_]+$/i;

function fail(res: Response, error: unknown): void {
  if (error instanceof CommandError) { res.status(error.status).json({ success: false, message: error.message }); return; }
  console.error("Error enviando comando:", error instanceof Error ? error.message : "error desconocido");
  res.status(502).json({ success: false, message: "No se pudo enviar el comando al nodo." });
}

/** POST /api/nodes/:deviceId/mode   body: { "mode": "auto" | "manual" } */
export async function setMode(req: Request, res: Response): Promise<void> {
  const deviceId = String(req.params.deviceId);
  const mode: unknown = req.body?.mode;
  if (!DEVICE_ID.test(deviceId)) { res.status(400).json({ success: false, message: "deviceId inválido." }); return; }
  if (mode !== "auto" && mode !== "manual") { res.status(400).json({ success: false, message: "mode debe ser 'auto' o 'manual'." }); return; }
  try { res.json(await sendMode(deviceId, mode)); } catch (error) { fail(res, error); }
}

/** POST /api/nodes/:deviceId/light   body: { "state": "on" | "off" }  (solo en modo manual) */
export async function setLight(req: Request, res: Response): Promise<void> {
  const deviceId = String(req.params.deviceId);
  const state: unknown = req.body?.state;
  if (!DEVICE_ID.test(deviceId)) { res.status(400).json({ success: false, message: "deviceId inválido." }); return; }
  if (state !== "on" && state !== "off") { res.status(400).json({ success: false, message: "state debe ser 'on' u 'off'." }); return; }
  try { res.json(await sendLight(deviceId, state)); } catch (error) { fail(res, error); }
}
