import { Router } from "express";
import { getNode, getState, listEvents, listNodes, realtime } from "../controllers/dashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);
dashboardRouter.get("/nodes", listNodes);
dashboardRouter.get("/nodes/:deviceId", getNode);
dashboardRouter.get("/events", listEvents);
dashboardRouter.get("/state", getState);
dashboardRouter.get("/realtime", realtime);
