import mongoose from "mongoose";
export async function connectDatabase(uri: string): Promise<void> { await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }); console.log("MongoDB Atlas conectado"); }
export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
