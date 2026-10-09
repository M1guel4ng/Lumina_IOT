import { Schema, model } from "mongoose";

const eventSchema = new Schema({
  deviceId: { type: String, required: true, index: true },
  type: { type: String, enum: ["presence", "lightLevel", "light", "mode", "connection"], required: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
  source: { type: String, enum: ["node", "system", "web"], default: "node", required: true },
  timestamp: { type: Date, default: Date.now, required: true, index: true },
}, { versionKey: false });

eventSchema.index({ deviceId: 1, timestamp: -1 });
export const Event = model("Event", eventSchema);
