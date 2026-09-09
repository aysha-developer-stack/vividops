export type JobJuniorStatus = "not_started" | "in_progress";

export type JobJunior = {
  id: string;
  jobId: string;
  name: string;
  status: JobJuniorStatus;
  loggedSeconds: number;
  elapsedSeconds: number;
  running: boolean;
  segmentStartedAt: string | null;
  addedById: string | null;
  addedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export function liveJuniorElapsedSeconds(junior: JobJunior, nowMs = Date.now()): number {
  const base = Math.max(0, junior.loggedSeconds ?? 0);
  if (!junior.running || !junior.segmentStartedAt) {
    return Math.max(base, junior.elapsedSeconds ?? 0);
  }
  const start = new Date(junior.segmentStartedAt).getTime();
  if (!Number.isFinite(start)) return Math.max(base, junior.elapsedSeconds ?? 0);
  return base + Math.max(0, Math.floor((nowMs - start) / 1000));
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // ignore
  }
  return res.statusText || "Request failed";
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function fetchJobJuniors(jobId: string): Promise<JobJunior[]> {
  const res = await fetch(`/api/jobs/${jobId}/juniors`, { credentials: "include" });
  if (res.status === 403) return [];
  const data = await parseJson<unknown>(res);
  return Array.isArray(data) ? (data as JobJunior[]) : [];
}

export async function addJobJunior(
  jobId: string,
  opts: { name: string; status?: JobJuniorStatus },
): Promise<JobJunior> {
  const res = await fetch(`/api/jobs/${jobId}/juniors`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return parseJson<JobJunior>(res);
}

export async function updateJobJunior(
  jobId: string,
  id: string,
  patch: { name?: string; status?: JobJuniorStatus; addSeconds?: number },
): Promise<JobJunior> {
  const res = await fetch(`/api/jobs/${jobId}/juniors/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<JobJunior>(res);
}

export async function toggleJuniorTimer(
  jobId: string,
  id: string,
  action: "start" | "pause",
): Promise<JobJunior> {
  const res = await fetch(`/api/jobs/${jobId}/juniors/${id}/timer`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return parseJson<JobJunior>(res);
}

export async function deleteJobJunior(jobId: string, id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${jobId}/juniors/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) throw new Error(await readError(res));
}
