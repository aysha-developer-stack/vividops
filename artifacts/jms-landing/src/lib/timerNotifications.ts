/** Create an in-app timer notification for the signed-in user. */
export async function postTimerNotification(
  title: string,
  description: string,
  jobId?: string,
): Promise<void> {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "timer",
        title,
        description,
        ...(jobId ? { jobId } : {}),
      }),
    });
  } catch {
    // Non-blocking — timer flow should continue if notification fails.
  }
}

export const TIMER_PING_INTERVAL_S = 3600;
export const TIMER_AUTO_STOP_S = 300;
