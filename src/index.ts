import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { config } from "dotenv";
import http from "http";

import { healthRoutes } from "./routes/health.js";
import { echoRoutes } from "./routes/echo.js";
import { downloadRoutes } from "./routes/download.js";
import { uploadRoutes } from "./routes/upload.js";
import { websocketRoutes } from "./routes/websocket.js";
import { wsPollingRoutes } from "./routes/ws-polling.js";
import { delayRoutes } from "./routes/delay.js";
import { setupSocketIO } from "./routes/socket-io.js";

config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Create HTTP server first so Socket.IO can attach before Fastify
const httpServer = http.createServer();

const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
  },
  serverFactory: (handler) => {
    httpServer.on("request", handler);
    return httpServer;
  },
});

// Setup Socket.IO BEFORE Fastify plugins (so it handles /socket.io upgrades first)
const io = setupSocketIO(httpServer);

async function main() {
  await fastify.register(websocket);
  await fastify.register(multipart, {
    limits: {
      fileSize: 6 * 1024 * 1024 * 1024, // 6GB max
    },
  });

  await fastify.register(healthRoutes);
  await fastify.register(echoRoutes);
  await fastify.register(downloadRoutes);
  await fastify.register(uploadRoutes);
  await fastify.register(websocketRoutes);
  await fastify.register(wsPollingRoutes);
  await fastify.register(delayRoutes);

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server listening on ${HOST}:${PORT}`);
    console.log(`Socket.IO listening on path /socket.io`);

    // Graceful shutdown
    const shutdown = async () => {
      io.close();
      await fastify.close();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
