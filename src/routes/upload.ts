import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface UploadResponse {
  status: string;
  size: number;
  duration_ms: number;
  throughput_mbps: number;
}

export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post("/upload", async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = performance.now();
    let totalBytes = 0;

    const contentType = request.headers["content-type"] || "";

    if (contentType.includes("multipart/form-data")) {
      const data = await request.file();
      if (!data) {
        reply.code(400);
        return { status: "error", message: "No file uploaded" };
      }

      for await (const chunk of data.file) {
        totalBytes += chunk.length;
      }
    } else {
      const body = request.body;
      if (Buffer.isBuffer(body)) {
        totalBytes = body.length;
      } else if (typeof body === "string") {
        totalBytes = Buffer.byteLength(body);
      } else if (body && typeof body === "object") {
        totalBytes = Buffer.byteLength(JSON.stringify(body));
      }
    }

    const durationMs = performance.now() - startTime;
    const durationSec = durationMs / 1000;
    const throughputMbps =
      durationSec > 0 ? (totalBytes * 8) / (durationSec * 1_000_000) : 0;

    const response: UploadResponse = {
      status: "ok",
      size: totalBytes,
      duration_ms: durationMs,
      throughput_mbps: Math.round(throughputMbps * 100) / 100,
    };

    return response;
  });

  fastify.addContentTypeParser(
    "application/octet-stream",
    function (_request, payload, done) {
      const chunks: Buffer[] = [];
      payload.on("data", (chunk: Buffer) => chunks.push(chunk));
      payload.on("end", () => done(null, Buffer.concat(chunks)));
      payload.on("error", done);
    }
  );
}
