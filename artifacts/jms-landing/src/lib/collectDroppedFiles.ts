/** Collect files from a drag-drop event, including nested folders. */

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    success: (file: File) => void,
    error?: (err: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  };
};

function readDirectoryEntries(
  reader: NonNullable<FileSystemEntryLike["createReader"]> extends () => infer R ? R : never,
): Promise<FileSystemEntryLike[]> {
  const all: FileSystemEntryLike[] = [];
  const readBatch = (): Promise<FileSystemEntryLike[]> =>
    new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

  const pump = async (): Promise<FileSystemEntryLike[]> => {
    const batch = await readBatch();
    if (batch.length === 0) return all;
    all.push(...batch);
    return pump();
  };

  return pump();
}

async function walkEntry(entry: FileSystemEntryLike, pathPrefix: string, out: File[]): Promise<void> {
  if (entry.isFile && typeof entry.file === "function") {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    const relativeName = `${pathPrefix}${file.name}`;
    // Preserve folder-relative path in the file name when dropped from a folder.
    out.push(
      relativeName === file.name
        ? file
        : new File([file], relativeName, { type: file.type, lastModified: file.lastModified }),
    );
    return;
  }

  if (entry.isDirectory && typeof entry.createReader === "function") {
    const reader = entry.createReader();
    const children = await readDirectoryEntries(reader);
    const nextPrefix = `${pathPrefix}${entry.name}/`;
    for (const child of children) {
      await walkEntry(child, nextPrefix, out);
    }
  }
}

export async function collectFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const entries: FileSystemEntryLike[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry = (item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntryLike | null;
      }).webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      const files: File[] = [];
      for (const entry of entries) {
        await walkEntry(entry, "", files);
      }
      if (files.length > 0) return files;
    }
  }

  return Array.from(dataTransfer.files ?? []).filter((f) => f && typeof f.name === "string");
}

export function collectFilesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f && typeof f.name === "string" && f.size >= 0);
}
