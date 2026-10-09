import type { ErrorRequestHandler } from "express";
export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error("Error interno:", error instanceof Error ? error.message : "Error desconocido");
  res.status(500).json({ success: false, message: "Error interno del servidor." });
};
