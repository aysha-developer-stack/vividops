import { createRequire } from "node:module";
import type { Archiver, ArchiverError } from "archiver";

const require = createRequire(import.meta.url);
const createArchive = require("archiver") as (
  format: "zip",
  options?: { zlib?: { level?: number } },
) => Archiver;

export function createZipArchive(): Archiver {
  return createArchive("zip", { zlib: { level: 5 } });
}

export type { ArchiverError };
