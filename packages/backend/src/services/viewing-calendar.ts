import { CALENDAR_WEBHOOK_URL, ORIGIN } from "@/config";

const ATTENDEES = ["jason@vhattum.xyz", "denisamicas@hotmail.com"];

const VIEWING_DURATION_MINS = 30;

interface ViewingPayload {
  fundaId: string;
  address: string;
  scheduledAt: Date;
  note: string | null;
}

function buildTitle(address: string): string {
  return `viewing @ ${address}`;
}

function buildDescription(p: ViewingPayload): string {
  const link = `${ORIGIN}/?listing=${encodeURIComponent(p.fundaId)}`;
  const lines = [`View this listing: ${link}`];
  if (p.note) {
    lines.push("");
    lines.push(p.note);
  }
  return lines.join("\n");
}

interface CreateBody {
  action: "create";
  title: string;
  scheduledAt: string;
  durationMins: number;
  description: string;
  location: string;
  attendees: string[];
}

interface UpdateBody extends Omit<CreateBody, "action"> {
  action: "update";
  eventId: string;
}

interface DeleteBody {
  action: "delete";
  eventId: string;
}

async function callWebhook(
  body: CreateBody | UpdateBody | DeleteBody,
): Promise<Record<string, unknown> | null> {
  if (!CALENDAR_WEBHOOK_URL) return null;
  try {
    const res = await fetch(CALENDAR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`Calendar webhook ${body.action} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(`Calendar webhook ${body.action} failed:`, err);
    return null;
  }
}

/**
 * Creates a calendar event for a scheduled viewing.
 * Returns the calendar event ID, or null if the webhook is not configured or fails.
 */
export async function createCalendarEvent(p: ViewingPayload): Promise<string | null> {
  const result = await callWebhook({
    action: "create",
    title: buildTitle(p.address),
    scheduledAt: p.scheduledAt.toISOString(),
    durationMins: VIEWING_DURATION_MINS,
    description: buildDescription(p),
    location: p.address,
    attendees: ATTENDEES,
  });
  if (!result) return null;
  return typeof result.eventId === "string" ? result.eventId : null;
}

/**
 * Updates an existing calendar event with new details.
 * Fire-and-forget — caller does not need to await unless they want confirmation.
 */
export async function updateCalendarEvent(eventId: string, p: ViewingPayload): Promise<void> {
  await callWebhook({
    action: "update",
    eventId,
    title: buildTitle(p.address),
    scheduledAt: p.scheduledAt.toISOString(),
    durationMins: VIEWING_DURATION_MINS,
    description: buildDescription(p),
    location: p.address,
    attendees: ATTENDEES,
  });
}

/**
 * Deletes a calendar event. Safe to call on an already-deleted event
 * (the GAS returns an error but we ignore it).
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await callWebhook({ action: "delete", eventId });
}
