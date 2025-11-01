import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/env";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app: Application = express();
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(helmet());
if (config.nodeEnv === "development") {
  app.use(morgan("dev"));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

app.get("api", (req, res) => {
  res.json({
    success: true,
    message: "MERN Drive API",
    version: "1.0.0",
  });
});

app.use(notFound);
app.use(errorHandler);

export default app;