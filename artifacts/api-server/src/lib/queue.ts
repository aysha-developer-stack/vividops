import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
});

export const defaultQueue = new Queue("default", {
  connection: redisConnection,
});

export function setupWorkers() {
  const worker = new Worker(
    "default",
    async (job: Job) => {
      logger.info({ jobId: job.id, jobName: job.name }, "Processing background job");
      // Add job processing logic here
    },
    { connection: redisConnection }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job?.id }, "Job completed successfully");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Job failed");
  });

  return worker;
}
