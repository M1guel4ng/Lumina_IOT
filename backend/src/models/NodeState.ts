import { Schema, model } from "mongoose";

const nodeStateSchema = new Schema({
  deviceId: { type: String, required: true, unique: true, trim: true, match: /^[a-z0-9-]+$/ },
  presence: { type: Boolean, default: null },
  lightLevel: { type: Number, min: 0, max: 100, default: null },
  light: { type: String, enum: ["on", "off", null], default: null },
  mode: { type: String, enum: ["auto", "manual", null], default: null },
  status: { type: String, enum: ["online", "offline"], default: "offline", required: true },
  stale: { type: Boolean, default: true, required: true },
  lastSeenAt: { type: Date, default: null },
  lastTelemetryAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

nodeStateSchema.index({ status: 1, lastSeenAt: 1 });
export const NodeState = model("NodeState", nodeStateSchema);
