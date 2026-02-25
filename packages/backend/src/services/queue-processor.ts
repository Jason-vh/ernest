import { claimJob, completeJob, skipJob, failJob, enqueueMany } from "@/services/job-queue";
import { handleComputeRoutes } from "@/services/handlers/compute-routes";
import { handleAiEnrich } from "@/services/handlers/ai-enrich";
import { handleTelegramNotify } from "@/services/handlers/telegram-notify";
import { invalidateFundaCache } from "@/routes/geodata";
import { ANTHROPIC_API_KEY } from "@/config";
import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { eq } from "drizzle-orm";

type HandlerFn = (job: Job) => Promise<"completed" | "skipped">;

const handlers: Record<string, HandlerFn> = {
  "compute-routes": handleComputeRoutes,
  "ai-enrich": handleAiEnrich,
  "telegram-notify": handleTelegramNotify,
};

const RATE_LIMITS: Record<string, number> = {
  "compute-routes": 200,
  "ai-enrich": 500,
  "telegram-notify": 200,
};

async function maybeEnqueueNotification(fundaId: string): Promise<void> {
  const rows = await db
    .select({
      routeFareharbor: listings.routeFareharbor,
      aiPositives: listings.aiPositives,
    })
    .from(listings)
    .where(eq(listings.fundaId, fundaId));

  if (rows.length === 0) return;
  const listing = rows[0];

  const routesReady = listing.routeFareharbor !== null;
  const aiReady = listing.aiPositives !== null || ANTHROPIC_API_KEY === null;

  if (routesReady && aiReady) {
    await enqueueMany([{ type: "telegram-notify", fundaId, maxAttempts: 3 }]);
  }
}

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

        try {
          const result = await handler(job); // eslint-disable-line no-await-in-loop
          if (result === "completed") {
            await completeJob(job.id); // eslint-disable-line no-await-in-loop
            completedSinceFlush++;
            console.log(`Job ${job.type}/${job.fundaId}: completed`);

            // Trigger notification check after enrichment/route jobs complete
            if (job.type === "ai-enrich" || job.type === "compute-routes") {
              await maybeEnqueueNotification(job.fundaId); // eslint-disable-line no-await-in-loop
            }
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
          await invalidateFundaCache(); // eslint-disable-line no-await-in-loop
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
