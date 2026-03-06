import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { config } from "dotenv";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer, WebSocket } from "ws";

import { healthRoutes } from "./routes/health.js";
import { echoRoutes } from "./routes/echo.js";
import { downloadRoutes } from "./routes/download.js";
import { uploadRoutes } from "./routes/upload.js";
import { delayRoutes } from "./routes/delay.js";
import { generateRoutes } from "./routes/generate.js";
import { setupSocketIOHandlers } from "./routes/socket-io.js";
import { handleWebSocket } from "./routes/websocket.js";

config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Create HTTP server first
const httpServer = http.createServer();

// Native WebSocket server for /ws endpoint (noServer mode)
const wss = new WebSocketServer({ noServer: true });

// Socket.IO server - attach to httpServer
const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});
setupSocketIOHandlers(io);

// Store Fastify's request handler for later use
let fastifyHandler: http.RequestListener | null = null;

// Handle native WebSocket connections for /ws
wss.on("connection", (socket: WebSocket) => {
  handleWebSocket(socket);
});

// Handle WebSocket upgrades - route /ws to our server, let Socket.IO handle /socket.io
httpServer.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;

  if (pathname === "/ws") {
    // Handle native WebSocket connections
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
  // Socket.IO handles /socket.io upgrades automatically
});

const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
  },
  serverFactory: (handler) => {
    fastifyHandler = handler;
    // Don't add Fastify's handler directly - we'll route manually
    return httpServer;
  },
});

// Add a request handler that routes to Socket.IO or Fastify
httpServer.on("request", (req, res) => {
  const url = req.url || "";
  // Socket.IO requests are already handled by Socket.IO's attachment
  // Only route non-socket.io requests to Fastify
  if (!url.startsWith("/socket.io") && fastifyHandler) {
    fastifyHandler(req, res);
  }
});

async function main() {
  await fastify.register(multipart, {
    limits: {
      fileSize: 6 * 1024 * 1024 * 1024, // 6GB max
    },
  });

  await fastify.register(healthRoutes);
  await fastify.register(echoRoutes);
  await fastify.register(downloadRoutes);
  await fastify.register(uploadRoutes);
  await fastify.register(delayRoutes);
  await fastify.register(generateRoutes);

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
