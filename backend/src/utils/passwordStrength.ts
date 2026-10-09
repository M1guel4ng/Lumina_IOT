export type PasswordStrength = "weak" | "medium" | "high";
export interface PasswordValidationResult { valid: boolean; strength: PasswordStrength; score: number; errors: string[]; }
export function validatePasswordStrength(password: unknown, username: unknown): PasswordValidationResult {
  if (typeof password !== "string" || typeof username !== "string") return { valid: false, strength: "weak", score: 0, errors: ["Usuario y contraseña deben ser texto"] };
  const valid = password.length >= 8;
  return {
    valid,
    strength: valid ? "high" : "weak",
    score: valid ? 5 : 0,
    errors: valid ? [] : ["La contraseña debe tener al menos 8 caracteres"],
  };
}
