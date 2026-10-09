import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { getConfig } from "./config/env.js";
import { User } from "./models/User.js";

process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const activeUsername = `test-active-${suffix}`;
const inactiveUsername = `test-inactive-${suffix}`;
const password = "Luz#Segura2026!";
let activeUserId = "";

before(async () => {
  await connectDatabase(getConfig().mongodbUri);
  const passwordHash = await bcrypt.hash(password, 12);
  const active = await User.create({ username: activeUsername, passwordHash, role: "admin", active: true });
  await User.create({ username: inactiveUsername, passwordHash, role: "operator", active: false });
  activeUserId = String(active._id);
});

after(async () => {
  await User.deleteMany({ username: { $in: [activeUsername, inactiveUsername] } });
  await disconnectDatabase();
});

test("login correcto no expone passwordHash", async () => {
  const response = await request(createApp()).post("/api/auth/login").send({ username: activeUsername, password });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.token, "string");
  assert.equal(response.body.user.username, activeUsername);
  assert.equal("passwordHash" in response.body.user, false);
});

test("contraseña incorrecta y usuario inexistente usan el mismo mensaje", async () => {
  const app = createApp();
  const wrongPassword = await request(app).post("/api/auth/login").send({ username: activeUsername, password: "Incorrecta#2026" });
  const missingUser = await request(app).post("/api/auth/login").send({ username: `missing-${suffix}`, password });
  assert.equal(wrongPassword.status, 401);
  assert.equal(missingUser.status, 401);
  assert.equal(wrongPassword.body.message, missingUser.body.message);
});

test("usuario inactivo no puede iniciar sesión", async () => {
  const response = await request(createApp()).post("/api/auth/login").send({ username: inactiveUsername, password });
  assert.equal(response.status, 401);
});

test("/me rechaza ausencia, manipulación y expiración del JWT", async () => {
  const app = createApp();
  assert.equal((await request(app).get("/api/auth/me")).status, 401);
  assert.equal((await request(app).get("/api/auth/me").set("Authorization", "Bearer token-invalido")).status, 401);
  const config = getConfig();
  const expired = jwt.sign({ username: activeUsername, role: "admin" }, config.jwtSecret, { subject: activeUserId, expiresIn: -1 });
  assert.equal((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expired}`)).status, 401);
});

test("/me acepta un JWT válido", async () => {
  const app = createApp();
  const login = await request(app).post("/api/auth/login").send({ username: activeUsername, password });
  const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.id, activeUserId);
  assert.equal(response.body.username, activeUsername);
  assert.equal("passwordHash" in response.body, false);
});

test("login limita intentos repetidos", async () => {
  const app = createApp();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request(app).post("/api/auth/login").send({ username: `rate-${suffix}`, password: "Incorrecta#2026" });
    statuses.push(response.status);
    if (response.status === 429) break;
  }
  assert.ok(statuses.includes(429));
});
