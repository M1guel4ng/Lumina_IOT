import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { getConfig } from "../config/env.js";
import { User } from "../models/User.js";

const invalidCredentials = { success: false, message: "Usuario o contraseña incorrectos." };
export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) { res.status(400).json({ success: false, message: "Complete todos los campos." }); return; }
  const normalizedUsername = username.trim().toLowerCase();
  const suppliedPassword = password;
  if (normalizedUsername.length > 50 || suppliedPassword.length > 256) { res.status(401).json(invalidCredentials); return; }
  const user = await User.findOne({ username: normalizedUsername }).select("+passwordHash username role active");
  if (!user || !user.active || !(await bcrypt.compare(suppliedPassword, String(user.passwordHash)))) { res.status(401).json(invalidCredentials); return; }
  const config = getConfig();
  const options: SignOptions = { subject: String(user._id), expiresIn: config.jwtExpiresIn as NonNullable<SignOptions["expiresIn"]> };
  const token = jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, options);
  res.json({ success: true, token, user: { id: String(user._id), username: user.username, role: user.role } });
}
export function me(req: Request, res: Response): void { res.json(req.user); }
