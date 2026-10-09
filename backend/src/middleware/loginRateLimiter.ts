import { rateLimit } from "express-rate-limit";
export const loginRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests: true, message: { success: false, message: "Demasiados intentos. Intente nuevamente más tarde." } });
