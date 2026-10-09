import type { Server } from "node:http";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { getConfig } from "./config/env.js";

const config = getConfig();
let server: Server | undefined;
async function start(): Promise<void> {
  await connectDatabase(config.mongodbUri);
  server = createApp().listen(config.port, () => console.log(`Servidor ejecutándose en http://localhost:${config.port}`));
}
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido. Cerrando servidor...`);
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  await disconnectDatabase();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
start().catch((error: unknown) => { console.error("No se pudo iniciar el servidor:", error instanceof Error ? error.message : "Error desconocido"); process.exit(1); });
