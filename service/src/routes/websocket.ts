import { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

interface WsMessage {
  type: string;
  timestamp: string;
  data?: unknown;
  echo?: unknown;
}

export async function websocketRoutes(fastify: FastifyInstance) {
  fastify.get("/ws", { websocket: true }, (socket: WebSocket) => {
    const welcome: WsMessage = {
      type: "connected",
      timestamp: new Date().toISOString(),
      data: {
        message: "WebSocket echo server ready",
      },
    };
    socket.send(JSON.stringify(welcome));

    socket.on("message", (message: Buffer | string) => {
      const receiveTime = performance.now();

      if (Buffer.isBuffer(message)) {
        socket.send(message);
        return;
      }

      try {
        const parsed = JSON.parse(message.toString());
        const response: WsMessage = {
          type: "echo",
          timestamp: new Date().toISOString(),
          echo: parsed,
          data: {
            server_receive_time: receiveTime,
            original_size: message.toString().length,
          },
        };
        socket.send(JSON.stringify(response));
      } catch {
        socket.send(message);
      }
    });

    socket.on("close", () => {
      fastify.log.debug("WebSocket connection closed");
    });

    socket.on("error", (error) => {
      fastify.log.error({ err: error }, "WebSocket error");
    });
  });
}
