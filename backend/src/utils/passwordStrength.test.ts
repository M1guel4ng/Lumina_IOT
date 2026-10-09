import assert from "node:assert/strict";
import test from "node:test";
import { validatePasswordStrength } from "./passwordStrength.js";
test("rechaza contraseñas de menos de 8 caracteres", () => { const result = validatePasswordStrength("1234567", "admin"); assert.equal(result.valid, false); assert.equal(result.strength, "weak"); });
test("acepta una contraseña de exactamente 8 caracteres", () => { assert.deepEqual(validatePasswordStrength("admin123", "admin"), { valid: true, strength: "high", score: 5, errors: [] }); });
test("acepta contraseñas de más de 8 caracteres", () => { assert.equal(validatePasswordStrength("Contra123456?", "admin123").valid, true); });
