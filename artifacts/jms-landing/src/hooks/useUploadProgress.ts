import { useCallback, useState } from "react";

export type UploadProgressItem = {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
};

export type UploadProgressBatch = {
  id: string;
  items: UploadProgressItem[];
  collapsed: boolean;
};

function makeItemId(file: File, index: number): string {
  return `${Date.now()}-${index}-${file.name}-${file.size}`;
}

export function useUploadProgress() {
  const [batch, setBatch] = useState<UploadProgressBatch | null>(null);

  const startBatch = useCallback((files: File[]) => {
    const id = String(Date.now());
    const items: UploadProgressItem[] = files.map((file, index) => ({
      id: makeItemId(file, index),
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: "pending",
    }));
    setBatch({ id, items, collapsed: false });
    return items.map((item) => item.id);
  }, []);

  const setItemUploading = useCallback((itemId: string) => {
    setBatch((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, status: "uploading", progress: Math.max(item.progress, 1) } : item,
        ),
      };
    });
  }, []);

  const updateItemProgress = useCallback((itemId: string, progress: number) => {
    setBatch((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId
            ? { ...item, status: "uploading", progress: Math.max(item.progress, progress) }
            : item,
        ),
      };
    });
  }, []);

  const completeItem = useCallback((itemId: string) => {
    setBatch((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, status: "completed", progress: 100 } : item,
        ),
      };
    });
  }, []);

  const failItem = useCallback((itemId: string, error?: string) => {
    setBatch((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, status: "error", error: error ?? "Upload failed" } : item,
        ),
      };
    });
  }, []);

  const dismiss = useCallback(() => setBatch(null), []);

  const toggleCollapsed = useCallback(() => {
    setBatch((prev) => (prev ? { ...prev, collapsed: !prev.collapsed } : prev));
  }, []);

  return {
    batch,
    startBatch,
    setItemUploading,
    updateItemProgress,
    completeItem,
    failItem,
    dismiss,
    toggleCollapsed,
  };
}
