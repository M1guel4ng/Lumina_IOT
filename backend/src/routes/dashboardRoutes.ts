import { Router } from "express";
import { controlNode, getNode, getState, listEvents, listNodes, realtime } from "../controllers/dashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);
dashboardRouter.get("/nodes", listNodes);
dashboardRouter.get("/nodes/:deviceId", getNode);
dashboardRouter.post("/nodes/:deviceId/control", controlNode);
dashboardRouter.get("/events", listEvents);
dashboardRouter.get("/state", getState);
dashboardRouter.get("/realtime", realtime);
