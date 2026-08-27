import archiver from "archiver";
import type { Archiver, ArchiverError } from "archiver";

export function createZipArchive(): Archiver {
  return archiver("zip", { zlib: { level: 5 } });
}

export type { ArchiverError };
