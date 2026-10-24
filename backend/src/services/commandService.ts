import { NodeState } from "../models/NodeState.js";
import { publishCommand } from "./mqttService.js";

/** Error con código HTTP, para que el controlador responda 404 / 409 / 504 según el contrato (§5.3 y §5.4). */
export class CommandError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const CONFIRM_TIMEOUT_MS = 3000; // contrato §5.3
const POLL_MS = 150;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function findNode(deviceId: string) { return NodeState.findOne({ deviceId }).lean(); }
type NodeDoc = NonNullable<Awaited<ReturnType<typeof findNode>>>;

async function requireOnlineNode(deviceId: string): Promise<NodeDoc> {
  const node = await findNode(deviceId);
  if (!node) throw new CommandError(404, "Nodo no encontrado.");
  // Contrato §5.4: si el nodo está offline no se publica nada.
  if (node.status !== "online") throw new CommandError(409, "El nodo está desconectado; el comando no se envió.");
  return node;
}

// Contrato §5.3: el nodo confirma publicando una telemetría inmediata con el nuevo estado.
async function waitForConfirmation(deviceId: string, sentAt: number, matches: (node: NodeDoc) => boolean): Promise<NodeDoc> {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const node = await findNode(deviceId);
    if (node?.lastTelemetryAt instanceof Date && node.lastTelemetryAt.getTime() >= sentAt && matches(node)) return node;
  }
  throw new CommandError(504, "El nodo no confirmó el comando a tiempo.");
}

export async function sendMode(deviceId: string, mode: "auto" | "manual"): Promise<NodeDoc> {
  await requireOnlineNode(deviceId);
  const sentAt = Date.now();
  await publishCommand(deviceId, "mode", { mode });
  return waitForConfirmation(deviceId, sentAt, (node) => node.mode === mode);
}

export async function sendLight(deviceId: string, state: "on" | "off"): Promise<NodeDoc> {
  const node = await requireOnlineNode(deviceId);
  // Contrato §5.1: en modo auto el nodo ignora cmd/light.
  if (node.mode !== "manual") throw new CommandError(409, "Cambia primero a modo manual para encender o apagar la luminaria.");
  const sentAt = Date.now();
  await publishCommand(deviceId, "light", { state });
  return waitForConfirmation(deviceId, sentAt, (current) => current.light === state);
}
