import {
  json,
  notFound
} from "../shared/responses.js";

import {
  EVENT_START,
  EVENT_END,
  EVENT_TIMEZONE,
  findProgramEntry,
  mapProgramEntry
} from "./repository.js";

import {
  normalizeSlug,
  normalizeInteger
} from "../shared/validation.js";

export async function listPublicProgram(
  request,
  env
) {
  const url = new URL(request.url);

  const day = normalizeInteger(
    url.searchParams.get("day"),
    {
      minimum: 1,
      maximum: 3,
      fallback: 0
    }
  );

  const creatorSlug = normalizeSlug(
    url.searchParams.get("creator")
  );

  const bindings = Array.of();
  let creatorJoin = "";
  let conditions =
    "WHERE entries.status = 'published'";

  if (day) {
    conditions +=
      " AND entries.event_day = ?";

    bindings.push(day);
  }

  if (creatorSlug) {
    creatorJoin = `
      INNER JOIN program_entry_participants
        AS creator_filter
        ON creator_filter.program_entry_id =
          entries.id

      INNER JOIN creators AS creator_search
        ON creator_search.id =
          creator_filter.creator_id
    `;

    conditions +=
      " AND creator_search.slug = ?";

    bindings.push(creatorSlug);
  }

  const result = await env.DB.prepare(`
    SELECT DISTINCT entries.*

    FROM program_entries AS entries

    ${creatorJoin}

    ${conditions}

    ORDER BY
      entries.starts_at ASC,
      entries.id ASC
  `)
    .bind(...bindings)
    .all();

  const program = await Promise.all(
    (result.results ?? []).map(
      entry =>
        mapProgramEntry(env, entry)
    )
  );

  return json({
    program,

    filters: {
      day: day || null,
      creator: creatorSlug || null
    },

    event: {
      name: "JEvent 26",
      association:
        "Association Petits Princes",
      startsAt: EVENT_START,
      endsAt: EVENT_END,
      timezone: EVENT_TIMEZONE,

      days: Array.of(
        {
          day: 1,
          date: "2026-10-25"
        },
        {
          day: 2,
          date: "2026-10-26"
        },
        {
          day: 3,
          date: "2026-10-27",
          endsOn: "2026-10-28"
        }
      )
    }
  });
}

export async function getPublicProgramEntry(
  request,
  env,
  publicId
) {
  const entry = await findProgramEntry(
    env,
    publicId
  );

  if (
    !entry ||
    entry.status !== "published"
  ) {
    return notFound(
      "Activité introuvable."
    );
  }

  return json({
    entry: await mapProgramEntry(
      env,
      entry
    )
  });
}
