import { Schema, model } from "mongoose";
const userSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true, minlength: 3, maxlength: 50, match: /^[a-z0-9._-]+$/ },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["admin", "operator"], default: "operator", required: true },
  active: { type: Boolean, default: true, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, toJSON: { transform: (_document, object) => { delete (object as Record<string, unknown>).passwordHash; return object; } } });
export const User = model("User", userSchema);
