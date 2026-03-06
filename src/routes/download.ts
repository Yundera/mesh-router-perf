import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream, statSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.DATA_DIR || "./data";

const FILE_SIZES: Record<string, string> = {
  "50mb": "50mb.bin",
  "200mb": "200mb.bin",
  "500mb": "500mb.bin",
};

interface DownloadParams {
  size: string;
}

export async function downloadRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/download/:size",
    async (request: FastifyRequest<{ Params: DownloadParams }>, reply: FastifyReply) => {
      const { size } = request.params;
      const filename = FILE_SIZES[size.toLowerCase()];

      if (!filename) {
        reply.code(400);
        return {
          status: "error",
          message: `Invalid size. Available: ${Object.keys(FILE_SIZES).join(", ")}`,
        };
      }

      const filePath = join(DATA_DIR, filename);

      if (!existsSync(filePath)) {
        reply.code(404);
        return {
          status: "error",
          message: `File not found. Run 'pnpm run generate-data' to create test files.`,
        };
      }

      const stat = statSync(filePath);
      const fileSize = stat.size;
      const rangeHeader = request.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          reply.code(416);
          reply.header("Content-Range", `bytes */${fileSize}`);
          return { status: "error", message: "Range not satisfiable" };
        }

        const chunkSize = end - start + 1;
        const stream = createReadStream(filePath, { start, end });

        reply.code(206);
        reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Length", chunkSize);
        reply.header("Content-Type", "application/octet-stream");
        reply.header(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );

        return reply.send(stream);
      }

      const stream = createReadStream(filePath);

      reply.header("Content-Length", fileSize);
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);

      return reply.send(stream);
    }
  );

  fastify.get("/download", async (_request: FastifyRequest, _reply: FastifyReply) => {
    const available: Record<string, { exists: boolean; size?: number }> = {};

    for (const [size, filename] of Object.entries(FILE_SIZES)) {
      const filePath = join(DATA_DIR, filename);
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        available[size] = { exists: true, size: stat.size };
      } else {
        available[size] = { exists: false };
      }
    }

    return {
      status: "ok",
      available,
      usage: "GET /download/:size where size is one of: 50mb, 200mb, 500mb",
    };
  });
}
