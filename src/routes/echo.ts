import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface EchoResponse {
  status: string;
  timestamp: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, unknown>;
    ip: string;
  };
  body?: unknown;
  meta: {
    request_id: string;
    duration_ms: number;
  };
}

export async function echoRoutes(fastify: FastifyInstance) {
  fastify.get("/echo", async (request: FastifyRequest, _reply: FastifyReply) => {
    const startTime = performance.now();

    const response: EchoResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        query: request.query as Record<string, unknown>,
        ip: request.ip,
      },
      meta: {
        request_id: request.id,
        duration_ms: 0,
      },
    };

    response.meta.duration_ms = performance.now() - startTime;
    return response;
  });

  fastify.post(
    "/echo",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const startTime = performance.now();

      const response: EchoResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers,
          query: request.query as Record<string, unknown>,
          ip: request.ip,
        },
        body: request.body,
        meta: {
          request_id: request.id,
          duration_ms: 0,
        },
      };

      response.meta.duration_ms = performance.now() - startTime;
      return response;
    }
  );
}
