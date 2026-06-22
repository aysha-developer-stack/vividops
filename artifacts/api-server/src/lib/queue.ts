import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL;

let redisConnection: Redis | null = null;
let defaultQueue: Queue | null = null;

function getRedisConnection(): Redis | null {
  if (!REDIS_URL) {
    return null;
  }
  if (!redisConnection) {
    try {
      redisConnection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 0,
        enableReadyCheck: false,
        lazyConnect: true,
        tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
      });
      redisConnection.on("error", (err) => {
        logger.warn({ err }, "Redis connection error");
      });
    } catch (err) {
      logger.warn({ err }, "Failed to create Redis connection");
      redisConnection = null;
    }
  }
  return redisConnection;
}

function getQueue(): Queue | null {
  if (!REDIS_URL) {
    return null;
  }
  if (!defaultQueue) {
    const conn = getRedisConnection();
    if (!conn) {
      return null;
    }
    defaultQueue = new Queue("default", {
      connection: conn,
    });
  }
  return defaultQueue;
}

export async function addToQueue(jobName: string, data: any): Promise<void> {
  const queue = getQueue();
  if (!queue) {
    logger.warn({ jobName, data }, "Queue not available, skipping job");
    return;
  }
  try {
    await queue.add(jobName, data);
  } catch (err) {
    logger.warn({ err, jobName, data }, "Failed to add job to queue");
  }
}

export function setupWorkers() {
  const conn = getRedisConnection();
  if (!conn) {
    logger.warn("Redis not available, skipping worker setup");
    return null;
  }

  const worker = new Worker(
    "default",
    async (job: Job) => {
      logger.info({ jobId: job.id, jobName: job.name }, "Processing background job");
      // Add job processing logic here
    },
    { connection: conn }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job?.id }, "Job completed successfully");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Job failed");
  });

  return worker;
}
