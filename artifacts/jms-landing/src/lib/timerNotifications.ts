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
/** Remind workers/supervisors to start the job timer if it is still off. */
export const TIMER_START_REMINDER_INTERVAL_S = 30 * 60;

export function formatTimerPingIntervalLabel(): string {
  const hours = TIMER_PING_INTERVAL_S / 3600;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export function timerStillWorkingDescription(jobLabel: string): string {
  return `Your timer on ${jobLabel} has been running for ${formatTimerPingIntervalLabel()}. Continue or stop within 5 minutes.`;
}

export function timerStartReminderDescription(jobLabel: string): string {
  return `You're on ${jobLabel} but your work timer isn't running. Tap Start Work to track your time.`;
}

export function timerStillWorkingPopupText(jobLabel?: string): string {
  const interval = formatTimerPingIntervalLabel();
  if (jobLabel) {
    return `Timer on ${jobLabel} has been running for ${interval}.`;
  }
  return `Your timer has been running for ${interval}.`;
}
