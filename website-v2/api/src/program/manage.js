import {
    json,
    notFound,
    forbidden,
    validationError
} from "../shared/responses.js";

import {
    readJson,
    normalizeInteger,
    sanitizePlainText
} from "../shared/validation.js";

import {
    requireAuthentication
} from "../auth/permissions.js";

import {
    EVENT_TIMEZONE,
    PROGRAM_STATUSES,
    findProgramEntry,
    generateProgramSlug,
    createProgramPublicId,
    mapProgramEntry,
    normalizeProgramStatus,
    normalizeProgramCategory,
    normalizeDate,
    isWithinEvent,
    getEventDay,
    getEntryParticipants
} from "./repository.js";

const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_PARTICIPANTS = 5;

function normalizeParticipantIds(values) {
    if (!Array.isArray(values)) {
        return Array.of();
    }

    return Array.from(
        new Set(
            values
                .map(value =>
                    normalizeInteger(value, {
                        minimum: 1,
                        fallback: 0
                    })
                )
                .filter(Boolean)
        )
    ).slice(0, MAX_PARTICIPANTS);
}

function isGlobalManager(user) {
    return Boolean(
        user.permissions.isSuperAdmin ||
        user.permissions.isGlobalModerator
    );
}

function getManageableCreatorIds(user) {
    return (
        user.creatorMemberships ??
        Array.of()
    )
        .filter(membership =>
            Array.of(
                "owner",
                "delegate"
            ).includes(
                membership.memberRole
            )
        )
        .map(membership =>
            Number(membership.creatorId)
        );
}

function getAllowedPrimaryCreatorIds(user) {
    if (isGlobalManager(user)) {
        /*
         * Les modérateurs globaux sont contrôlés séparément :
         * ils peuvent administrer tous les programmes.
         */
        return null;
    }

    return getManageableCreatorIds(user);
}

function canManagePrimaryCreator(
    user,
    primaryCreatorId
) {
    if (isGlobalManager(user)) {
        return true;
    }

    const allowedCreatorIds =
        getAllowedPrimaryCreatorIds(user);

    return allowedCreatorIds.includes(
        Number(primaryCreatorId)
    );
}

function canManageParticipants(
    user,
    participantIds
) {
    if (isGlobalManager(user)) {
        return true;
    }

    const manageableCreatorIds =
        getManageableCreatorIds(user);

    /*
     * Un créateur ou délégataire peut créer une activité
     * si au moins l’un des participants lui est associé.
     */
    return participantIds.some(
        creatorId =>
            manageableCreatorIds.includes(
                Number(creatorId)
            )
    );
}

function validateDescription(rawMarkdown) {
    const markdown = String(
        rawMarkdown ?? ""
    )
        .replace(/\u0000/g, "")
        .replace(/\r\n/g, "\n")
        .trim();

    if (
        markdown.length >
        MAX_DESCRIPTION_LENGTH
    ) {
        return {
            valid: false,
            markdown,
            error:
                "La description dépasse 10 000 caractères."
        };
    }

    const rawHtmlPattern = new RegExp(
        "<\\/?[a-z][^>]*>",
        "i"
    );

    const markdownLinkPattern = new RegExp(
        "!?\\[[^\\]]*\\]\\s*\\([^)]*\\)",
        "i"
    );

    const dangerousProtocolPattern = new RegExp(
        "(?:javascript|vbscript|data)\\s*:",
        "i"
    );
    const forbiddenContent = Array.of(
        rawHtmlPattern,
        markdownLinkPattern,
        dangerousProtocolPattern
    );

    if (
        forbiddenContent.some(
            pattern => pattern.test(markdown)
        )
    ) {
        return {
            valid: false,
            markdown,
            error:
                "Le HTML, les liens et les contenus exécutables sont interdits."
        };
    }

    return {
        valid: true,
        markdown,
        error: null
    };
}

async function validateParticipants(
    env,
    participantIds,
    primaryCreatorId
) {
    const primaryId = normalizeInteger(
        primaryCreatorId,
        {
            minimum: 1,
            fallback: 0
        }
    );

    if (!primaryId) {
        return {
            valid: false,
            error:
                "Le programme du créateur principal est obligatoire."
        };
    }

    /*
     * Les participants sont seulement les invités.
     * On retire automatiquement le propriétaire du programme
     * s’il a été sélectionné par erreur.
     */
    const guestIds = normalizeParticipantIds(
        participantIds
    ).filter(
        creatorId => creatorId !== primaryId
    );

    const creatorIds = Array.from(
        new Set(
            Array.of(
                primaryId,
                ...guestIds
            )
        )
    );

    const placeholders = creatorIds
        .map(() => "?")
        .join(", ");

    const result = await env.DB.prepare(`
    SELECT id
    FROM creators
    WHERE id IN (${placeholders})
      AND active = 1
      AND archived = 0
  `)
        .bind(...creatorIds)
        .all();

    const existingIds = (
        result.results ?? Array.of()
    ).map(
        creator => Number(creator.id)
    );

    if (
        existingIds.length !==
        creatorIds.length
    ) {
        return {
            valid: false,
            error:
                "Le créateur principal ou un participant est introuvable, inactif ou archivé."
        };
    }

    return {
        valid: true,

        /*
         * La liste stockée comprend le propriétaire du programme
         * et ses invités.
         */
        participantIds: creatorIds,

        guestParticipantIds: guestIds,

        primaryCreatorId: primaryId
    };
}

async function detectConflicts(
    env,
    {
        startsAt,
        endsAt,
        participantIds,
        exceptEntryId = null
    }
) {
    if (participantIds.length === 0) {
        return Array.of();
    }

    const placeholders =
        participantIds
            .map(() => "?")
            .join(", ");

    const bindings = Array.from(
        participantIds
    );

    bindings.push(
        endsAt,
        startsAt
    );

    let exclusion = "";

    if (exceptEntryId) {
        exclusion =
            "AND entries.id <> ?";

        bindings.push(exceptEntryId);
    }

    const result = await env.DB.prepare(`
    SELECT DISTINCT
      entries.id,
      entries.public_id,
      entries.title,
      entries.starts_at,
      entries.ends_at,
      entries.status,

      creators.id AS creator_id,
      creators.twitch_display_name
        AS creator_name

    FROM program_entries AS entries

    INNER JOIN program_entry_participants
      AS participants
      ON participants.program_entry_id =
        entries.id

    INNER JOIN creators
      ON creators.id =
        participants.creator_id

    WHERE participants.creator_id
      IN (${placeholders})

      AND entries.status
        IN ('draft', 'published')

      AND entries.starts_at < ?
      AND entries.ends_at > ?

      ${exclusion}

    ORDER BY entries.starts_at ASC
  `)
        .bind(...bindings)
        .all();

    return (result.results ?? []).map(
        conflict => ({
            entryId: Number(conflict.id),
            publicId: conflict.public_id,
            title: conflict.title,
            startsAt: conflict.starts_at,
            endsAt: conflict.ends_at,
            status: conflict.status,
            creatorId:
                Number(conflict.creator_id),
            creatorName:
                conflict.creator_name
        })
    );
}

async function canManageExistingEntry(
  env,
  user,
  entry
) {
  if (isGlobalManager(user)) {
    return true;
  }

  const participants =
    await getEntryParticipants(
      env,
      entry.id
    );

  const primaryCreator =
    participants.find(
      participant => participant.primary
    );

  if (!primaryCreator) {
    return false;
  }

  return canManagePrimaryCreator(
    user,
    primaryCreator.id
  );
}

function formatInput(body, current = null) {
    const title =
        body.title === undefined
            ? current?.title
            : sanitizePlainText(
                body.title,
                MAX_TITLE_LENGTH
            );

    const startsAt =
        body.startsAt === undefined
            ? current?.starts_at
            : normalizeDate(body.startsAt);

    const endsAt =
        body.endsAt === undefined
            ? current?.ends_at
            : normalizeDate(body.endsAt);

    const category =
        body.category === undefined
            ? current?.category
            : normalizeProgramCategory(
                body.category
            );

    const status =
        body.status === undefined
            ? current?.status
            : normalizeProgramStatus(
                body.status,
                current?.status ?? "draft"
            );

    const description =
        validateDescription(
            body.descriptionMarkdown ===
                undefined
                ? current?.description_markdown
                : body.descriptionMarkdown
        );

    const externalUrl =
        body.externalUrl === undefined
            ? current?.external_url
            : sanitizePlainText(
                body.externalUrl,
                1000
            ) || null;

    return {
        title,
        startsAt,
        endsAt,
        category,
        status,
        description,
        externalUrl
    };
}

function validateExternalUrl(externalUrl) {
    if (!externalUrl) {
        return true;
    }

    try {
        const parsedUrl =
            new URL(externalUrl);

        return parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

async function replaceParticipants(
    env,
    entryId,
    participantIds,
    primaryCreatorId,
    userId
) {
    await env.DB.prepare(`
    DELETE FROM program_entry_participants
    WHERE program_entry_id = ?
  `)
        .bind(entryId)
        .run();

    const statements =
        participantIds.map(
            (creatorId, index) =>
                env.DB.prepare(`
          INSERT INTO program_entry_participants (
            program_entry_id,
            creator_id,
            is_primary,
            display_order,
            added_by_user_id,
            created_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `)
                    .bind(
                        entryId,
                        creatorId,
                        creatorId === primaryCreatorId
                            ? 1
                            : 0,
                        index * 10,
                        userId
                    )
        );

    if (statements.length > 0) {
        await env.DB.batch(statements);
    }
}

/* ============================================================
   LISTE GÉRABLE
   ============================================================ */

export async function listManageableProgram(
    request,
    env
) {
    const authentication =
        await requireAuthentication(
            request,
            env
        );

    if (!authentication.allowed) {
        return authentication.response;
    }

    const user = authentication.user;
    let result;

    if (isGlobalManager(user)) {
        result = await env.DB.prepare(`
      SELECT *
      FROM program_entries
      ORDER BY starts_at ASC, id ASC
    `).all();
    } else {
        const creatorIds =
            getManageableCreatorIds(user);

        if (creatorIds.length === 0) {
            return json({
                entries: Array.of()
            });
        }

        const placeholders =
            creatorIds
                .map(() => "?")
                .join(", ");

        result = await env.DB.prepare(`
      SELECT DISTINCT entries.*

      FROM program_entries AS entries

      INNER JOIN program_entry_participants
        AS participants
        ON participants.program_entry_id =
          entries.id

      WHERE participants.creator_id
        IN (${placeholders})

      ORDER BY
        entries.starts_at ASC,
        entries.id ASC
    `)
            .bind(...creatorIds)
            .all();
    }

    const entries = await Promise.all(
        (result.results ?? []).map(
            entry =>
                mapProgramEntry(env, entry)
        )
    );

    return json({ entries });
}

/* ============================================================
   CRÉATION
   ============================================================ */

export async function createProgramEntry(
    request,
    env
) {
    const authentication =
        await requireAuthentication(
            request,
            env
        );

    if (!authentication.allowed) {
        return authentication.response;
    }

    const body = await readJson(request);

    if (!body) {
        return validationError(
            "Corps JSON invalide."
        );
    }

    const input = formatInput(body);

    if (!input.title) {
        return validationError(
            "Le titre est obligatoire."
        );
    }

    if (
        !input.startsAt ||
        !input.endsAt ||
        !isWithinEvent(
            input.startsAt,
            input.endsAt
        )
    ) {
        return validationError(
            "Les horaires doivent être compris entre le 25 octobre 2026 à 16 h et le 28 octobre 2026 à 4 h."
        );
    }

    if (!input.description.valid) {
        return validationError(
            input.description.error
        );
    }

    if (
        !validateExternalUrl(
            input.externalUrl
        )
    ) {
        return validationError(
            "Le lien externe doit être une adresse HTTPS valide."
        );
    }

    const participants =
        await validateParticipants(
            env,
            body.participantIds,
            body.primaryCreatorId
        );

    if (!participants.valid) {
        return validationError(
            participants.error
        );
    }

    if (
        !canManagePrimaryCreator(
            authentication.user,
            participants.primaryCreatorId
        )
    ) {
        return forbidden(
            "Tu ne peux créer une activité que dans ton propre programme."
        );
    }

    const conflicts =
        await detectConflicts(env, {
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            participantIds:
                participants.participantIds
        });

    const canOverride =
        isGlobalManager(
            authentication.user
        );

    const overrideConflicts =
        body.overrideConflicts === true;

    if (
        conflicts.length > 0 &&
        !(canOverride && overrideConflicts)
    ) {
        return json(
            {
                error:
                    "Cette activité entre en conflit avec le programme existant.",
                conflicts,
                canOverride
            },
            409
        );
    }

    const slug =
        await generateProgramSlug(
            env,
            body.slug || input.title
        );

    const publicId =
        createProgramPublicId();

    const eventDay =
        getEventDay(input.startsAt);

    const result = await env.DB.prepare(`
    INSERT INTO program_entries (
      public_id,
      slug,
      title,
      description_markdown,
      category,
      status,
      starts_at,
      ends_at,
      event_day,
      timezone,
      external_url,
      created_by_user_id,
      published_at,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
        .bind(
            publicId,
            slug,
            input.title,
            input.description.markdown,
            input.category,
            input.status,
            input.startsAt,
            input.endsAt,
            eventDay,
            EVENT_TIMEZONE,
            input.externalUrl,
            authentication.user.id,
            input.status === "published"
                ? new Date().toISOString()
                : null
        )
        .run();

    const entryId =
        Number(result.meta?.last_row_id);

    await replaceParticipants(
        env,
        entryId,
        participants.participantIds,
        participants.primaryCreatorId,
        authentication.user.id
    );

    const entry =
        await env.DB.prepare(`
      SELECT *
      FROM program_entries
      WHERE id = ?
    `)
            .bind(entryId)
            .first();

    return json(
        {
            success: true,
            entry:
                await mapProgramEntry(
                    env,
                    entry
                ),
            conflictsOverridden:
                conflicts.length > 0 &&
                overrideConflicts
        },
        201
    );
}

/* ============================================================
   MODIFICATION
   ============================================================ */

export async function updateProgramEntry(
    request,
    env,
    publicId
) {
    const authentication =
        await requireAuthentication(
            request,
            env
        );

    if (!authentication.allowed) {
        return authentication.response;
    }

    const entry = await findProgramEntry(
        env,
        publicId
    );

    if (!entry) {
        return notFound(
            "Activité introuvable."
        );
    }

    if (
        !(await canManageExistingEntry(
            env,
            authentication.user,
            entry
        ))
    ) {
        return forbidden(
            "Tu ne peux pas modifier cette activité."
        );
    }

    const body = await readJson(request);

    if (!body) {
        return validationError(
            "Corps JSON invalide."
        );
    }

    const currentParticipants =
        await getEntryParticipants(
            env,
            entry.id
        );

    const input =
        formatInput(body, entry);

    if (!input.title) {
        return validationError(
            "Le titre est obligatoire."
        );
    }

    if (
        !input.startsAt ||
        !input.endsAt ||
        !isWithinEvent(
            input.startsAt,
            input.endsAt
        )
    ) {
        return validationError(
            "Les horaires sont en dehors des dates du JEvent 26."
        );
    }

    if (!input.description.valid) {
        return validationError(
            input.description.error
        );
    }

    if (
        !validateExternalUrl(
            input.externalUrl
        )
    ) {
        return validationError(
            "Le lien externe doit être une adresse HTTPS valide."
        );
    }

    const currentPrimary =
  currentParticipants.find(
    participant => participant.primary
  );

const participantIds =
  body.participantIds === undefined
    ? currentParticipants
        .filter(
          participant =>
            !participant.primary
        )
        .map(
          participant =>
            participant.id
        )
    : body.participantIds;

    const participants =
        await validateParticipants(
            env,
            participantIds,
            body.primaryCreatorId === undefined
                ? currentPrimary?.id
                : body.primaryCreatorId
        );

    if (!participants.valid) {
        return validationError(
            participants.error
        );
    }

    if (
        !canManageParticipants(
            authentication.user,
            participants.participantIds
        )
    ) {
        return forbidden(
            "Tu ne peux pas associer ces créateurs."
        );
    }

    const conflicts =
        await detectConflicts(env, {
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            participantIds:
                participants.participantIds,
            exceptEntryId: entry.id
        });

    const canOverride =
        isGlobalManager(
            authentication.user
        );

    const overrideConflicts =
        body.overrideConflicts === true;

    if (
        conflicts.length > 0 &&
        !(canOverride && overrideConflicts)
    ) {
        return json(
            {
                error:
                    "Cette modification crée un conflit d’horaires.",
                conflicts,
                canOverride
            },
            409
        );
    }

    let slug = entry.slug;

    if (
        body.slug !== undefined ||
        input.title !== entry.title
    ) {
        slug = await generateProgramSlug(
            env,
            body.slug || input.title,
            entry.id
        );
    }

    const publishedAt =
        input.status === "published"
            ? (
                entry.published_at ||
                new Date().toISOString()
            )
            : entry.published_at;

    const cancelledAt =
        input.status === "cancelled"
            ? (
                entry.cancelled_at ||
                new Date().toISOString()
            )
            : null;

    const cancelledReason =
        input.status === "cancelled"
            ? sanitizePlainText(
                body.cancelledReason ??
                entry.cancelled_reason,
                1000
            ) || null
            : null;

    await env.DB.prepare(`
    UPDATE program_entries
    SET
      slug = ?,
      title = ?,
      description_markdown = ?,
      category = ?,
      status = ?,
      starts_at = ?,
      ends_at = ?,
      event_day = ?,
      timezone = ?,
      external_url = ?,
      published_at = ?,
      cancelled_at = ?,
      cancelled_reason = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
        .bind(
            slug,
            input.title,
            input.description.markdown,
            input.category,
            input.status,
            input.startsAt,
            input.endsAt,
            getEventDay(input.startsAt),
            EVENT_TIMEZONE,
            input.externalUrl,
            publishedAt,
            cancelledAt,
            cancelledReason,
            entry.id
        )
        .run();

    await replaceParticipants(
        env,
        entry.id,
        participants.participantIds,
        participants.primaryCreatorId,
        authentication.user.id
    );

    const updatedEntry =
        await findProgramEntry(
            env,
            publicId
        );

    return json({
        success: true,
        entry:
            await mapProgramEntry(
                env,
                updatedEntry
            ),
        conflictsOverridden:
            conflicts.length > 0 &&
            overrideConflicts
    });
}

/* ============================================================
   ANNULATION
   ============================================================ */

export async function cancelProgramEntry(
    request,
    env,
    publicId
) {
    const authentication =
        await requireAuthentication(
            request,
            env
        );

    if (!authentication.allowed) {
        return authentication.response;
    }

    const entry = await findProgramEntry(
        env,
        publicId
    );

    if (!entry) {
        return notFound(
            "Activité introuvable."
        );
    }

    if (
        !(await canManageExistingEntry(
            env,
            authentication.user,
            entry
        ))
    ) {
        return forbidden(
            "Tu ne peux pas annuler cette activité."
        );
    }

    const body =
        (await readJson(request)) ?? {};

    const reason = sanitizePlainText(
        body.reason,
        1000
    );

    await env.DB.prepare(`
    UPDATE program_entries
    SET
      status = 'cancelled',
      cancelled_reason = ?,
      cancelled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
        .bind(reason || null, entry.id)
        .run();

    return json({
        success: true,
        status: "cancelled"
    });
}

/* ============================================================
   SUPPRESSION DÉFINITIVE
   ============================================================ */

export async function deleteProgramEntry(
    request,
    env,
    publicId
) {
    const authentication =
        await requireAuthentication(
            request,
            env
        );

    if (!authentication.allowed) {
        return authentication.response;
    }

    if (
        !authentication.user.permissions
            .isSuperAdmin
    ) {
        return forbidden(
            "Seuls les super administrateurs peuvent supprimer définitivement une activité."
        );
    }

    const entry = await findProgramEntry(
        env,
        publicId
    );

    if (!entry) {
        return notFound(
            "Activité introuvable."
        );
    }

    await env.DB.batch(
        Array.of(
            env.DB.prepare(`
        DELETE FROM
          program_entry_participants
        WHERE program_entry_id = ?
      `).bind(entry.id),

            env.DB.prepare(`
        DELETE FROM program_entries
        WHERE id = ?
      `).bind(entry.id)
        )
    );

    return json({
        success: true
    });
}