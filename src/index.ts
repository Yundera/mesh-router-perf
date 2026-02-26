import Fastify from "fastify";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { config } from "dotenv";

import { healthRoutes } from "./routes/health.js";
import { echoRoutes } from "./routes/echo.js";
import { downloadRoutes } from "./routes/download.js";
import { uploadRoutes } from "./routes/upload.js";
import { websocketRoutes } from "./routes/websocket.js";
import { delayRoutes } from "./routes/delay.js";

config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
  },
});

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
  await fastify.register(delayRoutes);

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
