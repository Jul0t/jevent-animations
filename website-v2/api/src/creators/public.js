import {
  json,
  notFound,
  redirect
} from "../shared/responses.js";

import {
  normalizeSlug
} from "../shared/validation.js";

import {
  getTwitchStreamsByUserIds
} from "../twitch/api.js";

/* ============================================================
   UTILITAIRES
   ============================================================ */

function buildTwitchUrl(login) {
  if (!login) {
    return null;
  }

  return (
    "https://www.twitch.tv/" +
    encodeURIComponent(login)
  );
}

function buildThumbnailUrl(
  template,
  width = 640,
  height = 360
) {
  if (!template) {
    return null;
  }

  return String(template)
    .replace("{width}", String(width))
    .replace("{height}", String(height));
}

function buildDonationDestination(
  env,
  creator
) {
  if (creator.donation_url) {
    return creator.donation_url;
  }

  if (
    !creator.streamlabs_member_id ||
    !env.STREAMLABS_TEAM_URL
  ) {
    return null;
  }

  try {
    const destination = new URL(
      env.STREAMLABS_TEAM_URL
    );

    destination.searchParams.set(
      "member",
      creator.streamlabs_member_id
    );

    return destination.toString();
  } catch {
    return null;
  }
}

function isAllowedDonationDestination(value) {
  if (!value) {
    return false;
  }

  try {
    const destination = new URL(value);

    const hostname =
      destination.hostname.toLowerCase();

    return (
      destination.protocol === "https:" &&
      (
        hostname ===
          "streamlabscharity.com" ||
        hostname.endsWith(
          ".streamlabscharity.com"
        )
      )
    );
  } catch {
    return false;
  }
}

function createStreamMap(streams) {
  return new Map(
    streams.map(stream => [
      String(stream.user_id),
      stream
    ])
  );
}

function mapPublicCreator(
  request,
  env,
  creator,
  stream
) {
  const apiOrigin =
    new URL(request.url).origin;

  const hasDonationDestination =
    Boolean(
      buildDonationDestination(
        env,
        creator
      )
    );

  return {
    id: Number(creator.id),

    slug: creator.slug,

    twitchId: creator.twitch_id,

    twitchLogin:
      creator.twitch_login,

    twitchDisplayName:
      creator.twitch_display_name,

    twitchProfileImageUrl:
      creator.twitch_profile_image_url,

    descriptionMarkdown:
      creator.public_description_markdown ??
      "",

    displayOrder: Number(
      creator.display_order ?? 100
    ),

    twitchUrl: buildTwitchUrl(
      creator.twitch_login
    ),

    donationAvailable:
      hasDonationDestination,

    donationUrl:
      hasDonationDestination
        ? (
            apiOrigin +
            "/don/" +
            encodeURIComponent(
              creator.slug
            )
          )
        : null,

    isLive: Boolean(stream),

    live: stream
      ? {
          id: stream.id,

          title:
            stream.title ?? "",

          gameId:
            stream.game_id ?? null,

          gameName:
            stream.game_name ?? null,

          viewerCount: Number(
            stream.viewer_count ?? 0
          ),

          startedAt:
            stream.started_at ?? null,

          language:
            stream.language ?? null,

          thumbnailUrl:
            buildThumbnailUrl(
              stream.thumbnail_url,
              640,
              360
            )
        }
      : null
  };
}

async function getVisibleCreators(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      slug,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      public_description_markdown,
      streamlabs_member_id,
      donation_url,
      display_order,
      active,
      archived

    FROM creators

    WHERE active = 1
      AND archived = 0

    ORDER BY
      display_order ASC,
      twitch_display_name ASC
  `).all();

  return result.results ?? [];
}

/* ============================================================
   LISTE PUBLIQUE DES CRÉATEURS
   ============================================================ */

export async function listPublicCreators(
  request,
  env
) {
  const creators =
    await getVisibleCreators(env);

  const twitchIds = creators
    .map(creator => creator.twitch_id)
    .filter(Boolean);

  const streams =
    await getTwitchStreamsByUserIds(
      env,
      twitchIds
    );

  const streamMap =
    createStreamMap(streams);

  const mappedCreators = creators.map(
    creator =>
      mapPublicCreator(
        request,
        env,
        creator,
        streamMap.get(
          String(creator.twitch_id)
        ) ?? null
      )
  );

  /*
   * Les chaînes en direct sont affichées en premier.
   * L’ordre configuré par les super admins reste ensuite
   * prioritaire.
   */
  mappedCreators.sort(
    (first, second) => {
      const liveDifference =
        Number(second.isLive) -
        Number(first.isLive);

      if (liveDifference !== 0) {
        return liveDifference;
      }

      const orderDifference =
        first.displayOrder -
        second.displayOrder;

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return first.twitchDisplayName
        .localeCompare(
          second.twitchDisplayName,
          "fr"
        );
    }
  );

  return json({
    creators: mappedCreators,

    total:
      mappedCreators.length,

    liveCount:
      mappedCreators.filter(
        creator => creator.isLive
      ).length
  });
}

/* ============================================================
   PROFIL PUBLIC D’UN CRÉATEUR
   ============================================================ */

export async function getPublicCreatorBySlug(
  request,
  env,
  rawSlug
) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const creator = await env.DB.prepare(`
    SELECT
      id,
      slug,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      public_description_markdown,
      streamlabs_member_id,
      donation_url,
      display_order,
      active,
      archived

    FROM creators

    WHERE slug = ?
      AND active = 1
      AND archived = 0

    LIMIT 1
  `)
    .bind(slug)
    .first();

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const streams =
    await getTwitchStreamsByUserIds(
      env,
      Array.of(creator.twitch_id)
    );

  const stream =
    streams.find(
      item =>
        String(item.user_id) ===
        String(creator.twitch_id)
    ) ?? null;

  return json({
    creator: mapPublicCreator(
      request,
      env,
      creator,
      stream
    )
  });
}

/* ============================================================
   REDIRECTION VERS LA CAGNOTTE
   ============================================================ */

export async function redirectToCreatorDonation(
  request,
  env,
  rawSlug
) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const creator = await env.DB.prepare(`
    SELECT
      id,
      slug,
      streamlabs_member_id,
      donation_url,
      active,
      archived

    FROM creators

    WHERE slug = ?
      AND active = 1
      AND archived = 0

    LIMIT 1
  `)
    .bind(slug)
    .first();

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const destination =
    buildDonationDestination(
      env,
      creator
    );

  if (!destination) {
    return json(
      {
        error:
          "La cagnotte de ce créateur n’est pas encore configurée."
      },
      404
    );
  }

  if (
    !isAllowedDonationDestination(
      destination
    )
  ) {
    console.error(
      "Destination de don refusée :",
      destination
    );

    return json(
      {
        error:
          "Le lien de cagnotte configuré est invalide."
      },
      500
    );
  }

  return redirect(destination, 302);
}