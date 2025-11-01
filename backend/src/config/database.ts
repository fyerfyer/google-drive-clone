import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI!);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (e) {
    console.log(`MongoDB connection error: ${e}`);
    process.exit(1);
  }
};
