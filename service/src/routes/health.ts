import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
let version = "1.0.0";

try {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "../../package.json"), "utf-8")
  );
  version = pkg.version;
} catch {
  // Use default version
}

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  uptime: number;
}

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/health",
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const response: HealthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
        version,
        uptime: process.uptime(),
      };
      return response;
    }
  );
}
