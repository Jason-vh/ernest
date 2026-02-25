import { claimJob, completeJob, skipJob, failJob } from "@/services/job-queue";
import { handleComputeRoutes } from "@/services/handlers/compute-routes";
import { handleAiEnrich } from "@/services/handlers/ai-enrich";
import { invalidateFundaCache } from "@/routes/geodata";
import type { Job } from "@/db/schema";

type HandlerFn = (job: Job) => Promise<"completed" | "skipped">;

const handlers: Record<string, HandlerFn> = {
  "compute-routes": handleComputeRoutes,
  "ai-enrich": handleAiEnrich,
};

const RATE_LIMITS: Record<string, number> = {
  "compute-routes": 200,
  "ai-enrich": 500,
};

export function startQueueProcessor(): void {
  console.log("Queue processor started");

  const poll = async () => {
    let completedSinceFlush = 0;

    for (;;) {
      // eslint-disable-line no-await-in-loop -- sequential poll loop
      try {
        const job = await claimJob(); // eslint-disable-line no-await-in-loop

        if (!job) {
          // Idle: flush cache if any jobs completed
          if (completedSinceFlush > 0) {
            invalidateFundaCache();
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
          const message = err instanceof Error ? err.message : String(err);
          await failJob(job.id, message); // eslint-disable-line no-await-in-loop
          console.warn(
            `Job ${job.type}/${job.fundaId}: failed (attempt ${job.attempts}) — ${message}`,
          );
        }

        // Flush cache every 5 completed jobs
        if (completedSinceFlush >= 5) {
          invalidateFundaCache();
          completedSinceFlush = 0;
        }

        // Rate-limit delay
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
