import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { getConfig } from "../config/env.js";
import { User } from "../models/User.js";
import { validatePasswordStrength } from "../utils/passwordStrength.js";

class SecretOutput extends Writable {
  muted = false;
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.muted) stdout.write(chunk);
    callback();
  }
}

const secretOutput = new SecretOutput();
const rl = createInterface({ input: stdin, output: secretOutput, terminal: true });
async function createAdmin(): Promise<void> {
  const username = (await rl.question("Usuario administrador: ")).trim().toLowerCase();
  stdout.write("Contraseña (mínimo 8 caracteres): ");
  secretOutput.muted = true;
  const password = await rl.question("");
  secretOutput.muted = false;
  stdout.write("\n");
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new Error("El usuario debe tener entre 3 y 50 caracteres y usar letras, números, punto, guion o guion bajo");
  const validation = validatePasswordStrength(password, username);
  if (!validation.valid) throw new Error(`Contraseña rechazada: ${validation.errors.join("; ")}`);
  await connectDatabase(getConfig().mongodbUri);
  if (await User.exists({ username })) throw new Error("El usuario ya existe");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, passwordHash, role: "admin", active: true });
  console.log(`Administrador creado: ${user.username}`);
}
createAdmin().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "No se pudo crear el administrador"); process.exitCode = 1; }).finally(async () => { rl.close(); await disconnectDatabase(); });
