import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { getConfig } from "../config/env.js";
import { User } from "../models/User.js";

interface AuthPayload extends JwtPayload { sub: string; username: string; role: "admin" | "operator"; }
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "No autorizado." }); return; }
  try {
    const payload = jwt.verify(authorization.slice(7).trim(), getConfig().jwtSecret) as AuthPayload;
    if (!payload.sub || !payload.username || !["admin", "operator"].includes(payload.role)) throw new Error("Payload inválido");
    const user = await User.findById(payload.sub).select("username role active").lean();
    if (!user?.active) { res.status(401).json({ success: false, message: "No autorizado." }); return; }
    req.user = { id: String(user._id), username: user.username, role: user.role };
    next();
  } catch { res.status(401).json({ success: false, message: "No autorizado." }); }
}
