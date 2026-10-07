export type BuilderSpecRecord = {
  id: string;
  builderName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type JobBuilderSpecRecord = {
  builderName: string;
  body: string | null;
  copiedAt: string | null;
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error?.trim() || fallback;
}

export async function fetchBuilderSpecs(): Promise<BuilderSpecRecord[]> {
  const res = await fetch("/api/builder-specs", { credentials: "include" });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to load builder specs"));
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as BuilderSpecRecord[]) : [];
}

export async function fetchBuilderSpecSuggestions(): Promise<string[]> {
  const res = await fetch("/api/builder-specs/suggestions", { credentials: "include" });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to load builder names"));
  const data = (await res.json()) as { clients?: unknown };
  return Array.isArray(data.clients)
    ? data.clients.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];
}

export async function createBuilderSpec(input: {
  builderName: string;
  body: string;
}): Promise<BuilderSpecRecord> {
  const res = await fetch("/api/builder-specs", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to save builder specs"));
  return (await res.json()) as BuilderSpecRecord;
}

export async function updateBuilderSpec(
  id: string,
  input: { builderName?: string; body?: string },
): Promise<BuilderSpecRecord> {
  const res = await fetch(`/api/builder-specs/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to save builder specs"));
  return (await res.json()) as BuilderSpecRecord;
}

export async function deleteBuilderSpec(id: string): Promise<void> {
  const res = await fetch(`/api/builder-specs/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to delete builder specs"));
}

export async function fetchJobBuilderSpecs(jobId: string): Promise<JobBuilderSpecRecord> {
  const res = await fetch(`/api/jobs/${jobId}/builder-specs`, { credentials: "include" });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to load builder specs"));
  return (await res.json()) as JobBuilderSpecRecord;
}
