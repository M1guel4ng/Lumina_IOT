import { Router } from "express";
import { controlNode, getNode, getState, listEvents, listNodes, realtime } from "../controllers/dashboardController.js";
import { setLight, setMode } from "../controllers/commandController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);
dashboardRouter.get("/nodes", listNodes);
dashboardRouter.get("/nodes/:deviceId", getNode);
dashboardRouter.post("/nodes/:deviceId/control", controlNode);
dashboardRouter.post("/nodes/:deviceId/mode", setMode);
dashboardRouter.post("/nodes/:deviceId/light", setLight);
dashboardRouter.get("/events", listEvents);
dashboardRouter.get("/state", getState);
dashboardRouter.get("/realtime", realtime);
