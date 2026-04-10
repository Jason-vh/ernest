import { db } from "@/db";
import { listings } from "@/db/schema";
import type { Job } from "@/db/schema";
import { ANTHROPIC_API_KEY } from "@/config";
import { eq, sql } from "drizzle-orm";
import {
  hasMeaningfulDescription,
  hashDescription,
  translateListingDescription,
} from "@/services/listing-description-translation";

export async function handleTranslateDescription(job: Job): Promise<"completed" | "skipped"> {
  if (!ANTHROPIC_API_KEY) return "skipped";

  const rows = await db
    .select({
      fundaId: listings.fundaId,
      description: listings.description,
      descriptionEnSourceHash: listings.descriptionEnSourceHash,
      status: listings.status,
      disappearedAt: listings.disappearedAt,
    })
    .from(listings)
    .where(eq(listings.fundaId, job.fundaId));

  if (rows.length === 0) return "skipped";
  const listing = rows[0];

  if (listing.disappearedAt !== null) return "skipped";
  if (listing.status !== "Beschikbaar" && listing.status !== "") return "skipped";
  if (!hasMeaningfulDescription(listing.description)) return "skipped";

  const descriptionHash = hashDescription(listing.description);
  if (listing.descriptionEnSourceHash === descriptionHash) return "skipped";

  const descriptionEn = await translateListingDescription(listing.description);

  await db
    .update(listings)
    .set({
      descriptionEn,
      descriptionEnSourceHash: descriptionHash,
      updatedAt: sql`now()`,
    })
    .where(eq(listings.fundaId, job.fundaId));

  return "completed";
}
