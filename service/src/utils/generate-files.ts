import { createWriteStream, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const DATA_DIR = process.env.DATA_DIR || "./data";

interface FileConfig {
  name: string;
  size: number;
  skipUnlessFlagged?: boolean;
}

const FILES: FileConfig[] = [
  { name: "50mb.bin", size: 50 * 1024 * 1024 },
  { name: "500mb.bin", size: 500 * 1024 * 1024 },
  { name: "5gb.bin", size: 5 * 1024 * 1024 * 1024, skipUnlessFlagged: true },
];

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

async function generateFile(
  filePath: string,
  totalSize: number
): Promise<void> {
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

        const progress = ((written / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r  Progress: ${progress}%`);

        if (!canContinue) {
          stream.once("drain", writeChunk);
          return;
        }
      }

      stream.end();
    };

    stream.on("finish", () => {
      console.log(" - Done");
      resolve();
    });

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

async function main() {
  const generateLarge = process.argv.includes("--large");

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created directory: ${DATA_DIR}`);
  }

  console.log("Generating test files...\n");

  for (const file of FILES) {
    if (file.skipUnlessFlagged && !generateLarge) {
      console.log(
        `Skipping ${file.name} (${formatSize(file.size)}) - use --large flag to generate`
      );
      continue;
    }

    const filePath = join(DATA_DIR, file.name);

    if (existsSync(filePath)) {
      console.log(`Skipping ${file.name} - already exists`);
      continue;
    }

    console.log(`Generating ${file.name} (${formatSize(file.size)})...`);
    await generateFile(filePath, file.size);
  }

  console.log("\nAll files generated!");
  console.log(`\nFiles are located in: ${DATA_DIR}/`);
}

main().catch((err) => {
  console.error("Error generating files:", err);
  process.exit(1);
});
