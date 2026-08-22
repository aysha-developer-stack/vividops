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

export const TIMER_PING_INTERVAL_S = 3 * 60 * 60;
export const TIMER_AUTO_STOP_S = 300;

export function formatTimerPingIntervalLabel(): string {
  const hours = TIMER_PING_INTERVAL_S / 3600;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function timerStillWorkingDescription(jobLabel: string): string {
  return `Your timer on ${jobLabel} has been running for ${formatTimerPingIntervalLabel()}. Continue or stop within 5 minutes.`;
}

export function timerStillWorkingPopupText(jobLabel?: string): string {
  const interval = formatTimerPingIntervalLabel();
  if (jobLabel) {
    return `Timer on ${jobLabel} has been running for ${interval}.`;
  }
  return `Your timer has been running for ${interval}.`;
}
