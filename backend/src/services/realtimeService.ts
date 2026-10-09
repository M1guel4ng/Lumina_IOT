import type { Response } from "express";

export type RealtimeEventName = "node-updated" | "node-online" | "node-offline";
const clients = new Set<Response>();

export function addRealtimeClient(response: Response): () => void {
  clients.add(response);
  response.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);
  return () => clients.delete(response);
}

export function broadcastRealtime(event: RealtimeEventName, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
}

export function closeRealtimeClients(): void {
  for (const client of clients) client.end();
  clients.clear();
}
