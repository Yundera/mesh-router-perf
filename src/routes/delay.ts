import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface DelayParams {
  ms: string;
}

interface DelayResponse {
  status: string;
  requested_delay_ms: number;
  actual_delay_ms: number;
  timestamp: string;
}

const MAX_DELAY_MS = 60000; // 1 minute max

export async function delayRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/delay/:ms",
    async (request: FastifyRequest<{ Params: DelayParams }>, reply: FastifyReply) => {
      const requestedMs = parseInt(request.params.ms, 10);

      if (isNaN(requestedMs) || requestedMs < 0) {
        reply.code(400);
        return {
          status: "error",
          message: "Invalid delay value. Must be a positive integer.",
        };
      }

      if (requestedMs > MAX_DELAY_MS) {
        reply.code(400);
        return {
          status: "error",
          message: `Delay cannot exceed ${MAX_DELAY_MS}ms (1 minute).`,
        };
      }

      const startTime = performance.now();

      await new Promise((resolve) => setTimeout(resolve, requestedMs));

      const actualDelay = performance.now() - startTime;

      const response: DelayResponse = {
        status: "ok",
        requested_delay_ms: requestedMs,
        actual_delay_ms: Math.round(actualDelay * 100) / 100,
        timestamp: new Date().toISOString(),
      };

      return response;
    }
  );
}
