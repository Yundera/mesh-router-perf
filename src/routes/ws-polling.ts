import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WebSocket } from "ws";
import crypto from "crypto";

/**
 * Socket.IO-like endpoint that supports both polling and WebSocket transport.
 * This mimics the behavior of CasaOS message bus for testing WebSocket upgrade issues.
 *
 * Flow:
 * 1. Client makes polling request to /ws-polling/?transport=polling
 * 2. Server returns session info with upgrades: ["websocket"]
 * 3. Client upgrades to WebSocket on /ws-polling/?transport=websocket&sid=xxx
 */

// Session storage (in-memory for simplicity)
const sessions = new Map<string, { created: number; messages: string[] }>();

// Cleanup old sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.created > 60000) {
      sessions.delete(sid);
    }
  }
}, 60000);

function generateSid(): string {
  return crypto.randomBytes(8).toString("base64url");
}

export async function wsPollingRoutes(fastify: FastifyInstance) {
  // Combined handler for both polling GET and WebSocket upgrade
  // Fastify websocket plugin handles upgrade detection automatically
  fastify.get(
    "/ws-polling/",
    { websocket: true },
    (
      socket: WebSocket,
      request: FastifyRequest<{
        Querystring: { transport?: string; sid?: string; EIO?: string };
      }>
    ) => {
      const { transport, sid } = request.query;

      fastify.log.info({ transport, sid }, "WebSocket upgrade on /ws-polling/");

      // Validate session if sid provided
      if (sid && !sessions.has(sid)) {
        fastify.log.warn({ sid }, "Invalid session for WebSocket upgrade");
        socket.close(1002, "Invalid session");
        return;
      }

      // Send welcome message
      const welcome = {
        type: "connected",
        timestamp: new Date().toISOString(),
        transport: "websocket",
        upgraded: !!sid,
        data: {
          message: "WebSocket connection established (Socket.IO-like)",
        },
      };
      socket.send(`4${JSON.stringify(welcome)}`);

      socket.on("message", (message: Buffer | string) => {
        const msgStr = message.toString();
        fastify.log.debug({ message: msgStr }, "WebSocket message received");

        // Handle Socket.IO packet types
        if (msgStr === "2") {
          // Ping - respond with pong
          socket.send("3");
          return;
        }

        if (msgStr === "3") {
          // Pong - ignore
          return;
        }

        // Echo other messages
        try {
          // Remove packet type prefix if present
          const data = msgStr.startsWith("4") ? msgStr.slice(1) : msgStr;
          const parsed = JSON.parse(data);
          const response = {
            type: "echo",
            timestamp: new Date().toISOString(),
            echo: parsed,
          };
          socket.send(`4${JSON.stringify(response)}`);
        } catch {
          socket.send(`4${JSON.stringify({ echo: msgStr })}`);
        }
      });

      socket.on("close", () => {
        fastify.log.debug("WebSocket connection closed");
        if (sid) {
          sessions.delete(sid);
        }
      });

      socket.on("error", (error) => {
        fastify.log.error({ err: error }, "WebSocket error");
      });
    }
  );

  // Polling transport handler (non-WebSocket GET requests)
  fastify.get(
    "/ws-polling/poll",
    async (
      request: FastifyRequest<{
        Querystring: { transport?: string; sid?: string; EIO?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { transport, sid, EIO } = request.query;

      fastify.log.info(
        { transport, sid, EIO },
        "ws-polling poll request received"
      );

      // Initial handshake - return session info
      if (transport === "polling" && !sid) {
        const newSid = generateSid();
        sessions.set(newSid, { created: Date.now(), messages: [] });

        // Socket.IO v3 format
        const handshake = {
          sid: newSid,
          upgrades: ["websocket"], // Advertise WebSocket upgrade
          pingInterval: 25000,
          pingTimeout: 60000,
        };

        fastify.log.info({ sid: newSid }, "New session created");

        // Socket.IO format: packet type prefix + JSON
        // 0 = open packet
        return reply
          .header("Content-Type", "text/plain; charset=UTF-8")
          .send(`0${JSON.stringify(handshake)}`);
      }

      // Subsequent polling requests with sid
      if (transport === "polling" && sid) {
        const session = sessions.get(sid);
        if (!session) {
          return reply.status(400).send({ error: "Invalid session" });
        }

        // Return any queued messages or just acknowledge
        if (session.messages.length > 0) {
          const msg = session.messages.shift();
          return reply
            .header("Content-Type", "text/plain; charset=UTF-8")
            .send(msg);
        }

        // No messages - send a noop (ping packet)
        return reply
          .header("Content-Type", "text/plain; charset=UTF-8")
          .send("2"); // 2 = ping packet
      }

      return reply.status(400).send({ error: "Invalid transport" });
    }
  );

  // POST handler for polling (client sending data)
  fastify.post(
    "/ws-polling/poll",
    async (
      request: FastifyRequest<{
        Querystring: { transport?: string; sid?: string };
        Body: string;
      }>,
      reply: FastifyReply
    ) => {
      const { transport, sid } = request.query;

      if (transport === "polling" && sid) {
        const session = sessions.get(sid);
        if (!session) {
          return reply.status(400).send({ error: "Invalid session" });
        }

        fastify.log.info({ sid, body: request.body }, "Polling POST received");

        // Echo back the message
        session.messages.push(`4${JSON.stringify({ echo: request.body })}`);

        return reply.send("ok");
      }

      return reply.status(400).send({ error: "Invalid request" });
    }
  );
}
