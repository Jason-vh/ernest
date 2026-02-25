import { db } from "@/db";
import { jobs } from "@/db/schema";
import type { Job, JobType, JobStatus } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";

export type { JobType } from "@/db/schema";

const JOB_TYPES: Set<string> = new Set<string>(["compute-routes", "ai-enrich"]);
const JOB_STATUSES: Set<string> = new Set<string>([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);

function toJobType(s: string): JobType {
  if (!JOB_TYPES.has(s)) throw new Error(`Invalid job type: ${s}`);
  return s as JobType;
}

function toJobStatus(s: string): JobStatus {
  if (!JOB_STATUSES.has(s)) throw new Error(`Invalid job status: ${s}`);
  return s as JobStatus;
}

interface EnqueueItem {
  type: Job["type"];
  fundaId: string;
  maxAttempts?: number;
}

export async function enqueueMany(items: EnqueueItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const values = items.map((item) => ({
    id: crypto.randomUUID(),
    type: item.type,
    fundaId: item.fundaId,
    maxAttempts: item.maxAttempts ?? 3,
  }));

  const result = await db
    .insert(jobs)
    .values(values)
    .onConflictDoNothing({ target: [jobs.type, jobs.fundaId] })
    .returning({ id: jobs.id });

  return result.length;
}

/**
 * Map a raw postgres row (snake_case) to the Job type (camelCase).
 * db.execute returns Record<string, unknown> — we extract and narrow each field.
 */
function mapRawRow(r: Record<string, unknown>): Job {
  return {
    id: String(r.id),
    type: toJobType(String(r.type)),
    fundaId: String(r.funda_id),
    status: toJobStatus(String(r.status)),
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    lastError: r.last_error === null ? null : String(r.last_error),
    runAfter: r.run_after instanceof Date ? r.run_after : new Date(String(r.run_after)),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    updatedAt: r.updated_at instanceof Date ? r.updated_at : new Date(String(r.updated_at)),
  };
}

export async function claimJob(): Promise<Job | null> {
  const rows = await db.execute(sql`
    UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY created_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED
    ) RETURNING *
  `);

  if (rows.length === 0) return null;
  return mapRawRow(rows[0]);
}

export async function completeJob(id: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "completed", updatedAt: sql`now()` })
    .where(eq(jobs.id, id));
}

export async function skipJob(id: string, reason: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "skipped", lastError: reason, updatedAt: sql`now()` })
    .where(eq(jobs.id, id));
}

export async function failJob(id: string, error: string): Promise<void> {
  const truncated = error.slice(0, 1000);

  // Fetch current state
  const rows = await db
    .select({ attempts: jobs.attempts, maxAttempts: jobs.maxAttempts })
    .from(jobs)
    .where(eq(jobs.id, id));

  if (rows.length === 0) return;
  const job = rows[0];

  if (job.attempts < job.maxAttempts) {
    // Exponential backoff: 30s, 120s, 480s
    const delaySec = 30 * Math.pow(4, job.attempts - 1);
    await db
      .update(jobs)
      .set({
        status: "pending",
        lastError: truncated,
        runAfter: sql`now() + (${delaySec} * interval '1 second')`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, id));
  } else {
    await db
      .update(jobs)
      .set({ status: "failed", lastError: truncated, updatedAt: sql`now()` })
      .where(eq(jobs.id, id));
  }
}

export async function resetStaleJobs(): Promise<void> {
  // Reset jobs that still have retries left, decrementing the wasted attempt
  const reset = await db
    .update(jobs)
    .set({
      status: "pending",
      attempts: sql`GREATEST(0, ${jobs.attempts} - 1)`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(jobs.status, "running"), lt(jobs.attempts, jobs.maxAttempts)))
    .returning({ id: jobs.id });

  // Mark exhausted jobs as failed (crashed on their final attempt)
  const failed = await db
    .update(jobs)
    .set({
      status: "failed",
      lastError: "Server crashed during final attempt",
      updatedAt: sql`now()`,
    })
    .where(eq(jobs.status, "running"))
    .returning({ id: jobs.id });

  if (reset.length > 0 || failed.length > 0) {
    console.log(`Reset ${reset.length} stale jobs to pending, marked ${failed.length} as failed`);
  }
}
