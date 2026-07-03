import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { logger } from "./logger";

let redisConnection: Redis | null = null;
let defaultQueue: Queue | null = null;
let worker: Worker | null = null;
let redisDisabled = false;

function normalizeRedisUrl(raw?: string): string | null {
  if (!raw) return null;
  let url = raw.trim();
  // Fix copy/paste mistakes like REDIS_URL="rediss://..."
  url = url.replace(/^REDIS_URL=/i, "").replace(/^["']|["']$/g, "");
  if (!url.startsWith("redis://") && !url.startsWith("rediss://")) {
    return null;
  }
  return url;
}

function createRedisConnection(url: string): Redis {
  return new Redis(url, {
    // BullMQ requires null (not 0) so workers can survive reconnects.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
    tls: url.startsWith("rediss://") ? {} : undefined,
  });
}

function getRedisConnection(): Redis | null {
  const url = normalizeRedisUrl(process.env.REDIS_URL);
  if (!url || redisDisabled) {
    return null;
  }
  if (!redisConnection) {
    try {
      redisConnection = createRedisConnection(url);
      redisConnection.on("error", (err) => {
        logger.warn({ err }, "Redis connection error");
      });
    } catch (err) {
      logger.warn({ err }, "Failed to create Redis connection");
      redisConnection = null;
      redisDisabled = true;
    }
  }
  return redisConnection;
}

function getQueue(): Queue | null {
  if (redisDisabled) {
    return null;
  }
  const url = normalizeRedisUrl(process.env.REDIS_URL);
  if (!url) {
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
    defaultQueue.on("error", (err) => {
      logger.warn({ err }, "Redis queue error");
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

export async function setupWorkers(): Promise<Worker | null> {
  const url = normalizeRedisUrl(process.env.REDIS_URL);
  if (!url) {
    logger.info("REDIS_URL not set; background job worker disabled");
    return null;
  }
  if (redisDisabled || worker) {
    return worker;
  }

  let conn: Redis;
  try {
    conn = createRedisConnection(url);
    await conn.ping();
    redisConnection = conn;
    conn.on("error", (err) => {
      logger.warn({ err }, "Redis connection error");
    });
  } catch (err) {
    redisDisabled = true;
    redisConnection?.disconnect();
    redisConnection = null;
    defaultQueue = null;
    logger.warn({ err }, "Redis unavailable; background job worker disabled");
    return null;
  }

  try {
    worker = new Worker(
      "default",
      async (job: Job) => {
        logger.info({ jobId: job.id, jobName: job.name }, "Processing background job");
      },
      { connection: conn },
    );

    worker.on("completed", (job) => {
      logger.info({ jobId: job?.id }, "Job completed successfully");
    });

    worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err }, "Job failed");
    });

    worker.on("error", (err) => {
      logger.warn({ err }, "Redis worker error");
    });

    logger.info("Background job worker started");
    return worker;
  } catch (err) {
    redisDisabled = true;
    worker = null;
    redisConnection?.disconnect();
    redisConnection = null;
    defaultQueue = null;
    logger.warn({ err }, "Failed to start background job worker");
    return null;
  }
}
