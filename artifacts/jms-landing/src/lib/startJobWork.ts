/** Mark a pending job as in progress when a field user starts the timer. */
export async function startJobWork(jobId: string): Promise<boolean> {
  const res = await fetch(`/api/jobs/${jobId}/start-work`, {
    method: "POST",
    credentials: "include",
  });
  return res.ok;
}
