import {
  generateRandomToken
} from "../shared/security.js";

import {
  normalizeSlug
} from "../shared/validation.js";

export const EVENT_START =
  "2026-10-25T16:00:00+01:00";

export const EVENT_END =
  "2026-10-28T04:00:00+01:00";

export const EVENT_TIMEZONE =
  "Europe/Paris";

export const PROGRAM_STATUSES =
  new Set(
    Array.of(
      "draft",
      "published",
      "cancelled"
    )
  );

export const PROGRAM_CATEGORIES =
  new Set(
    Array.of(
      "gaming",
      "talk",
      "challenge",
      "creative",
      "charity",
      "community",
      "special",
      "other"
    )
  );

export function normalizeProgramStatus(
  value,
  fallback = "draft"
) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();

  return PROGRAM_STATUSES.has(status)
    ? status
    : fallback;
}

export function normalizeProgramCategory(value) {
  const category = String(value ?? "")
    .trim()
    .toLowerCase();

  return PROGRAM_CATEGORIES.has(category)
    ? category
    : "other";
}

export function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function isWithinEvent(
  startsAt,
  endsAt
) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  const eventStart =
    new Date(EVENT_START).getTime();

  const eventEnd =
    new Date(EVENT_END).getTime();

  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= eventStart &&
    end <= eventEnd &&
    end > start
  );
}

export function getEventDay(startsAt) {
  const date = new Date(startsAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const dateFormatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: EVENT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    );

  const localDate =
    dateFormatter.format(date);

  if (localDate === "2026-10-25") {
    return 1;
  }

  if (localDate === "2026-10-26") {
    return 2;
  }

  if (
    localDate === "2026-10-27" ||
    localDate === "2026-10-28"
  ) {
    return 3;
  }

  return null;
}

export async function findProgramEntry(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT *
    FROM program_entries
    WHERE public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

export async function generateProgramSlug(
  env,
  title,
  exceptEntryId = null
) {
  const base =
    normalizeSlug(title) || "activite";

  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = exceptEntryId
      ? await env.DB.prepare(`
          SELECT id
          FROM program_entries
          WHERE slug = ?
            AND id <> ?
          LIMIT 1
        `)
          .bind(candidate, exceptEntryId)
          .first()
      : await env.DB.prepare(`
          SELECT id
          FROM program_entries
          WHERE slug = ?
          LIMIT 1
        `)
          .bind(candidate)
          .first();

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export function createProgramPublicId() {
  return `program_${generateRandomToken(12)}`;
}

export async function getEntryParticipants(
  env,
  entryId
) {
  const result = await env.DB.prepare(`
    SELECT
      creators.id,
      creators.slug,
      creators.twitch_login,
      creators.twitch_display_name,
      creators.twitch_profile_image_url,

      participants.is_primary,
      participants.display_order

    FROM program_entry_participants
      AS participants

    INNER JOIN creators
      ON creators.id =
        participants.creator_id

    WHERE participants.program_entry_id = ?

    ORDER BY
      participants.is_primary DESC,
      participants.display_order ASC,
      creators.display_order ASC
  `)
    .bind(entryId)
    .all();

  return (result.results ?? []).map(
    participant => ({
      id: Number(participant.id),
      slug: participant.slug,
      twitchLogin:
        participant.twitch_login,
      twitchDisplayName:
        participant.twitch_display_name,
      twitchProfileImageUrl:
        participant.twitch_profile_image_url,
      primary:
        Boolean(participant.is_primary),
      displayOrder:
        Number(
          participant.display_order ?? 0
        )
    })
  );
}

export async function mapProgramEntry(
  env,
  entry
) {
  const participants =
    await getEntryParticipants(
      env,
      entry.id
    );

  return {
    id: Number(entry.id),
    publicId: entry.public_id,
    slug: entry.slug,
    title: entry.title,

    descriptionMarkdown:
      entry.description_markdown ?? "",

    category: entry.category,
    status: entry.status,

    startsAt: entry.starts_at,
    endsAt: entry.ends_at,
    eventDay: Number(entry.event_day),
    timezone:
      entry.timezone || EVENT_TIMEZONE,

    externalUrl: entry.external_url,

    participants,

    primaryCreator:
      participants.find(
        participant =>
          participant.primary
      ) ??
      participants[0] ??
      null,

    cancelledReason:
      entry.cancelled_reason,

    publishedAt: entry.published_at,
    cancelledAt: entry.cancelled_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at
  };
}