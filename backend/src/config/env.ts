import dotenv from "dotenv";
dotenv.config();

export interface AppConfig { port: number; mongodbUri: string; jwtSecret: string; jwtExpiresIn: string; frontendUrl: string; }
export function getConfig(): AppConfig {
  const required = ["MONGODB_URI", "JWT_SECRET", "FRONTEND_URL"] as const;
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}`);
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT debe ser un puerto válido");
  const jwtSecret = process.env.JWT_SECRET!.trim();
  if (jwtSecret.length < 16) throw new Error("JWT_SECRET debe tener al menos 16 caracteres");
  return { port, mongodbUri: process.env.MONGODB_URI!.trim(), jwtSecret, jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || "2h", frontendUrl: process.env.FRONTEND_URL!.trim() };
}
