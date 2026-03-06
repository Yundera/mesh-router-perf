import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createWriteStream, existsSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const DATA_DIR = process.env.DATA_DIR || "./data";

// Allowed sizes with their byte values
const ALLOWED_SIZES: Record<string, number> = {
  "50mb": 50 * 1024 * 1024,
  "200mb": 200 * 1024 * 1024,
  "500mb": 500 * 1024 * 1024,
};

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

interface GenerateParams {
  size: string;
}

async function generateFile(filePath: string, totalSize: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    let written = 0;

    const writeChunk = () => {
      while (written < totalSize) {
        const remaining = totalSize - written;
        const chunkSize = Math.min(CHUNK_SIZE, remaining);
        const chunk = randomBytes(chunkSize);

        const canContinue = stream.write(chunk);
        written += chunkSize;

        if (!canContinue) {
          stream.once("drain", writeChunk);
          return;
        }
      }

      stream.end();
    };

    stream.on("finish", resolve);
    stream.on("error", reject);

    writeChunk();
  });
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export async function generateRoutes(fastify: FastifyInstance) {
  // Generate a specific size payload
  fastify.post(
    "/generate/:size",
    async (request: FastifyRequest<{ Params: GenerateParams }>, reply: FastifyReply) => {
      const { size } = request.params;
      const sizeKey = size.toLowerCase();
      const totalSize = ALLOWED_SIZES[sizeKey];

      if (!totalSize) {
        reply.code(400);
        return {
          status: "error",
          message: `Invalid size. Allowed sizes: ${Object.keys(ALLOWED_SIZES).join(", ")}`,
        };
      }

      // Ensure data directory exists
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      const filename = `${sizeKey}.bin`;
      const filePath = join(DATA_DIR, filename);

      // Check if file already exists with correct size
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        if (stat.size === totalSize) {
          return {
            status: "ok",
            message: "File already exists",
            size: sizeKey,
            bytes: stat.size,
            path: filename,
          };
        }
        // File exists but wrong size - will regenerate
      }

      const startTime = performance.now();

      try {
        await generateFile(filePath, totalSize);
        const duration = performance.now() - startTime;

        return {
          status: "ok",
          message: "File generated",
          size: sizeKey,
          bytes: totalSize,
          path: filename,
          duration_ms: duration,
        };
      } catch (err) {
        reply.code(500);
        return {
          status: "error",
          message: `Failed to generate file: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }
    }
  );

  // Generate all allowed payloads
  fastify.post("/generate", async (_request: FastifyRequest, reply: FastifyReply) => {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    const results: Record<string, { status: string; message: string; bytes?: number; duration_ms?: number }> = {};
    const startTime = performance.now();

    for (const [sizeKey, totalSize] of Object.entries(ALLOWED_SIZES)) {
      const filename = `${sizeKey}.bin`;
      const filePath = join(DATA_DIR, filename);

      // Check if file already exists with correct size
      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        if (stat.size === totalSize) {
          results[sizeKey] = {
            status: "exists",
            message: "File already exists",
            bytes: stat.size,
          };
          continue;
        }
      }

      // Generate the file
      const fileStartTime = performance.now();
      try {
        await generateFile(filePath, totalSize);
        results[sizeKey] = {
          status: "generated",
          message: "File generated",
          bytes: totalSize,
          duration_ms: performance.now() - fileStartTime,
        };
      } catch (err) {
        results[sizeKey] = {
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }

    const totalDuration = performance.now() - startTime;

    return {
      status: "ok",
      results,
      total_duration_ms: totalDuration,
    };
  });

  // List available and allowed sizes
  fastify.get("/generate", async (_request: FastifyRequest, _reply: FastifyReply) => {
    const sizes: Record<string, { allowed: boolean; exists: boolean; size_bytes?: number; expected_bytes: number }> = {};

    for (const [sizeKey, expectedSize] of Object.entries(ALLOWED_SIZES)) {
      const filename = `${sizeKey}.bin`;
      const filePath = join(DATA_DIR, filename);

      if (existsSync(filePath)) {
        const stat = statSync(filePath);
        sizes[sizeKey] = {
          allowed: true,
          exists: true,
          size_bytes: stat.size,
          expected_bytes: expectedSize,
        };
      } else {
        sizes[sizeKey] = {
          allowed: true,
          exists: false,
          expected_bytes: expectedSize,
        };
      }
    }

    return {
      status: "ok",
      sizes,
      usage: {
        generate_all: "POST /generate",
        generate_one: "POST /generate/:size where size is one of: " + Object.keys(ALLOWED_SIZES).join(", "),
      },
    };
  });
}
