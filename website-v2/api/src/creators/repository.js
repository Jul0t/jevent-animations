import {
  generateRandomToken
} from "../shared/security.js";

import {
  normalizeSlug,
  normalizeTwitchLogin,
  sanitizePlainText
} from "../shared/validation.js";

export const RESERVED_CREATOR_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "compte",
  "createur",
  "createurs",
  "don",
  "interactions",
  "moderation",
  "programme",
  "statistiques"
]);

export function validateCreatorSlug(value) {
  const slug = normalizeSlug(value);

  if (slug.length < 2) {
    return {
      valid: false,
      error:
        "Le slug doit contenir au moins deux caractères."
    };
  }

  if (
    RESERVED_CREATOR_SLUGS.has(slug)
  ) {
    return {
      valid: false,
      error: "Ce slug est réservé."
    };
  }

  return {
    valid: true,
    slug
  };
}

export async function findCreatorById(
  env,
  creatorId
) {
  return env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE id = ?
    LIMIT 1
  `)
    .bind(creatorId)
    .first();
}

export async function findCreatorByTwitchId(
  env,
  twitchId
) {
  return env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE twitch_id = ?
    LIMIT 1
  `)
    .bind(String(twitchId))
    .first();
}

export async function creatorSlugExists(
  env,
  slug
) {
  const result = await env.DB.prepare(`
    SELECT 1 AS found
    FROM creators
    WHERE slug = ?
    LIMIT 1
  `)
    .bind(slug)
    .first();

  return Boolean(result);
}

export async function insertCreator(
  env,
  {
    twitchUser,
    slug,
    streamlabsMemberId,
    displayOrder,
    createdByUserId
  }
) {
  const publicId =
    `creator_${generateRandomToken(12)}`;

  const memberId = sanitizePlainText(
    streamlabsMemberId,
    100
  );

  const donationUrl = memberId
    ? buildDonationUrl(env, memberId)
    : null;

  const result = await env.DB.prepare(`
    INSERT INTO creators (
      public_id,
      slug,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      streamlabs_member_id,
      donation_url,
      display_order,
      active,
      archived,
      created_by_user_id,
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
      1,
      0,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      publicId,
      slug,
      String(twitchUser.id),
      normalizeTwitchLogin(
        twitchUser.login
      ),
      sanitizePlainText(
        twitchUser.display_name,
        100
      ),
      sanitizePlainText(
        twitchUser.profile_image_url,
        1000
      ) || null,
      memberId || null,
      donationUrl,
      displayOrder,
      createdByUserId
    )
    .run();

  return findCreatorById(
    env,
    result.meta?.last_row_id
  );
}

function buildDonationUrl(env, memberId) {
  const baseUrl = String(
    env.STREAMLABS_TEAM_URL ?? ""
  ).trim();

  if (!baseUrl || !memberId) {
    return null;
  }

  const url = new URL(baseUrl);

  url.searchParams.set(
    "member",
    memberId
  );

  return url.toString();
}