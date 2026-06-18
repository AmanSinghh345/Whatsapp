import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module.js";

function getAllowedOrigins() {
  const configuredOrigins =
    process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "";

  return Array.from(
    new Set([
      ...configuredOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]),
  );
}

const allowedOrigins = getAllowedOrigins();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS"), false);
      },
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    },
  });

  // Configure Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Fallback for browsers that preflight before route matching.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.setGlobalPrefix("api");
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
}

bootstrap();
