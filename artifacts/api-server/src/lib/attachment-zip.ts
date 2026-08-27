import { ZipArchive, type Archiver, type ArchiverError } from "archiver";

export function createZipArchive(): Archiver {
  return new ZipArchive({ zlib: { level: 5 } });
}

export type { ArchiverError };
