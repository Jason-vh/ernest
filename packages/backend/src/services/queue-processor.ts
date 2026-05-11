import { claimJob, completeJob, skipJob, failJob } from "@/services/job-queue";
import { handleTelegramNotify } from "@/services/handlers/telegram-notify";
import { invalidateFundaCache } from "@/routes/geodata";
import type { Job } from "@/db/schema";
import { TelegramRateLimitError } from "@/services/telegram";

type HandlerFn = (job: Job) => Promise<"completed" | "skipped">;

const handlers: Record<string, HandlerFn> = {
  "telegram-notify": handleTelegramNotify,
};

const RATE_LIMITS: Record<string, number> = {
  "telegram-notify": 1500,
};

export function startQueueProcessor(): void {
  console.log("Queue processor started");

  const poll = async () => {
    let completedSinceFlush = 0;
    const blockedUntil: Record<string, number> = {};

    for (;;) {
      // eslint-disable-line no-await-in-loop -- sequential poll loop
      try {
        const job = await claimJob(); // eslint-disable-line no-await-in-loop

        if (!job) {
          if (completedSinceFlush > 0) {
            await invalidateFundaCache(); // eslint-disable-line no-await-in-loop
            completedSinceFlush = 0;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000)); // eslint-disable-line no-await-in-loop
          continue;
        }

        const handler = handlers[job.type];
        if (!handler) {
          await skipJob(job.id, `Unknown job type: ${job.type}`); // eslint-disable-line no-await-in-loop
          continue;
        }

        const blockUntil = blockedUntil[job.type] ?? 0;
        if (blockUntil > Date.now()) {
          await new Promise((resolve) => setTimeout(resolve, blockUntil - Date.now())); // eslint-disable-line no-await-in-loop
        }

        try {
          const result = await handler(job); // eslint-disable-line no-await-in-loop
          if (result === "completed") {
            await completeJob(job.id); // eslint-disable-line no-await-in-loop
            completedSinceFlush++;
            console.log(`Job ${job.type}/${job.fundaId}: completed`);
          } else {
            await skipJob(job.id, "Handler returned skipped"); // eslint-disable-line no-await-in-loop
            console.log(`Job ${job.type}/${job.fundaId}: skipped`);
          }
        } catch (err) {
          if (err instanceof TelegramRateLimitError) {
            const retryAfterSec = err.retryAfterSec + 1;
            blockedUntil[job.type] = Date.now() + retryAfterSec * 1000;
            // eslint-disable-next-line no-await-in-loop
            await failJob(job.id, err.message, {
              retryAfterSec,
              consumeAttempt: false,
            });
            console.warn(
              `Job ${job.type}/${job.fundaId}: rate limited by Telegram, retrying in ${retryAfterSec}s`,
            );
          } else {
            const message = err instanceof Error ? err.message : String(err);
            await failJob(job.id, message); // eslint-disable-line no-await-in-loop
            console.warn(
              `Job ${job.type}/${job.fundaId}: failed (attempt ${job.attempts}) — ${message}`,
            );
          }
        }

        if (completedSinceFlush >= 5) {
          await invalidateFundaCache(); // eslint-disable-line no-await-in-loop
          completedSinceFlush = 0;
        }

        const delay = RATE_LIMITS[job.type] ?? 200;
        await new Promise((resolve) => setTimeout(resolve, delay)); // eslint-disable-line no-await-in-loop
      } catch (err) {
        console.error("Queue processor error:", err);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // eslint-disable-line no-await-in-loop
      }
    }
  };

  // Fire and forget — non-blocking
  poll();
}
