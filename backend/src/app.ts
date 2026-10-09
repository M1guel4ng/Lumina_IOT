import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getConfig } from "./config/env.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { authRouter } from "./routes/authRoutes.js";

export function createApp() {
  const config = getConfig();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "16kb" }));
  app.get("/", (_req, res) => res.json({ message: "Smart Lighting IoT API funcionando" }));
  app.get("/api/health", (_req, res) => res.json({ success: true, database: "connected" }));
  app.use("/api/auth", authRouter);
  app.use((_req, res) => res.status(404).json({ success: false, message: "Ruta no encontrada." }));
  app.use(errorMiddleware);
  return app;
}
