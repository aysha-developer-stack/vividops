import type { JobRow } from "@workspace/db";
import { notifyAllJobMembersOnce } from "./notifications";
import { jobDisplayNumber } from "./serialize";

/** In-app alert when a job's Zoho Cliq channel is first provisioned (job team only). */
export async function notifyCliqChannelReady(job: JobRow, channelDisplayName: string): Promise<void> {
  const jobLabel = jobDisplayNumber(job);
  const title = `Cliq channel ready: ${job.title}`;
  const description = `Team chat for ${jobLabel} is set up as "${channelDisplayName}". Open the Communication tab to join the conversation.`;

  await notifyAllJobMembersOnce({
    jobId: job.id,
    assigneeId: job.assigneeId,
    supervisorId: job.supervisorId,
    coordinatorId: job.coordinatorId,
    title,
    description,
    type: "cliq_channel",
  });
}
