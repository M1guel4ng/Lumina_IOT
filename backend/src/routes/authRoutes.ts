import { Router } from "express";
import { login, me } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { loginRateLimiter } from "../middleware/loginRateLimiter.js";
export const authRouter = Router();
authRouter.post("/login", loginRateLimiter, login);
authRouter.get("/me", authMiddleware, me);
