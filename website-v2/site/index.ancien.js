const SESSION_COOKIE = "jevent_v2_session";
const OAUTH_STATE_COOKIE = "jevent_v2_oauth_state";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

const VALID_CREATOR_STATUSES = new Set([
  "pending",
  "active",
  "hidden",
  "archived"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(request, env, null, 204);
    }

    try {
      let response;

      /* Authentification */
      if (
        request.method === "GET" &&
        url.pathname === "/api/auth/twitch/start"
      ) {
        response = startTwitchLogin(env);
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/auth/twitch/callback"
      ) {
        response = await finishTwitchLogin(request, env);
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/auth/me"
      ) {
        response = await getCurrentUser(request, env);
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/auth/logout"
      ) {
        response = logout();

      /* Installation */
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/bootstrap/super-admin"
      ) {
        response = await bootstrapSuperAdmin(request, env);

      /* Événement public */
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/event"
      ) {
        response = await getPublicEvent(env);
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/features"
      ) {
        response = await getPublicFeatures(env);

      /* Créateurs publics */
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/creators"
      ) {
        response = await getPublicCreators(env);
      } else if (
        request.method === "GET" &&
        /^\/api\/creators\/[^/]+$/.test(url.pathname)
      ) {
        const slug = decodeURIComponent(
          url.pathname.split("/")[3]
        );

        response = await getPublicCreator(env, slug);

      /* Redirection dynamique des dons */
      } else if (
        request.method === "GET" &&
        /^\/don\/[^/]+$/.test(url.pathname)
      ) {
        const slug = decodeURIComponent(
          url.pathname.split("/")[2]
        );

        response = await redirectToDonation(env, slug);

      /* Compte */
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/account"
      ) {
        response = await getAccount(request, env);

      /* Panel créateur */
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/creator-panel"
      ) {
        response = await getCreatorPanel(request, env);
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/creator-panel/description"
      ) {
        response = await submitCreatorDescription(
          request,
          env
        );
      } else if (
        request.method === "PUT" &&
        url.pathname === "/api/creator-panel/social-links"
      ) {
        response = await replaceCreatorSocialLinks(
          request,
          env
        );
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/creator-panel/staff-requests"
      ) {
        response = await createStaffRequest(request, env);

      /* Super administration */
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/admin/creators"
      ) {
        response = await adminGetCreators(request, env);
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/admin/creators"
      ) {
        response = await adminCreateCreator(request, env);
      } else if (
        request.method === "PUT" &&
        /^\/api\/admin\/creators\/\d+$/.test(url.pathname)
      ) {
        const creatorId = Number(
          url.pathname.split("/")[4]
        );

        response = await adminUpdateCreator(
          request,
          env,
          creatorId
        );
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/admin/description-revisions"
      ) {
        response = await adminGetDescriptionRevisions(
          request,
          env
        );
      } else if (
        request.method === "POST" &&
        /^\/api\/admin\/description-revisions\/\d+\/approve$/.test(
          url.pathname
        )
      ) {
        const revisionId = Number(
          url.pathname.split("/")[4]
        );

        response = await adminReviewDescription(
          request,
          env,
          revisionId,
          "approved"
        );
      } else if (
        request.method === "POST" &&
        /^\/api\/admin\/description-revisions\/\d+\/reject$/.test(
          url.pathname
        )
      ) {
        const revisionId = Number(
          url.pathname.split("/")[4]
        );

        response = await adminReviewDescription(
          request,
          env,
          revisionId,
          "rejected"
        );
      } else if (
        request.method === "GET" &&
        url.pathname === "/api/admin/staff-requests"
      ) {
        response = await adminGetStaffRequests(
          request,
          env
        );
      } else if (
        request.method === "POST" &&
        /^\/api\/admin\/staff-requests\/\d+\/approve$/.test(
          url.pathname
        )
      ) {
        const requestId = Number(
          url.pathname.split("/")[4]
        );

        response = await adminReviewStaffRequest(
          request,
          env,
          requestId,
          "approved"
        );
      } else if (
        request.method === "POST" &&
        /^\/api\/admin\/staff-requests\/\d+\/reject$/.test(
          url.pathname
        )
      ) {
        const requestId = Number(
          url.pathname.split("/")[4]
        );

        response = await adminReviewStaffRequest(
          request,
          env,
          requestId,
          "rejected"
        );
      } else {
        response = json(
          { error: "Route introuvable." },
          404
        );
      }

      return cors(request, env, response);
    } catch (error) {
      console.error(error);

      return cors(
        request,
        env,
        json(
          {
            error: "Erreur interne.",
            requestId: crypto.randomUUID()
          },
          500
        )
      );
    }
  }
};

/* ============================================================
   AUTHENTIFICATION TWITCH
   ============================================================ */

function startTwitchLogin(env) {
  const state = randomHex(32);

  const parameters = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    redirect_uri: env.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: "",
    state
  });

  let response = Response.redirect(
    `https://id.twitch.tv/oauth2/authorize?${parameters}`,
    302
  );

  response = withCookie(
    response,
    makeCookie(OAUTH_STATE_COOKIE, state, {
      maxAge: 600,
      httpOnly: true
    })
  );

  return response;
}

async function finishTwitchLogin(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = getCookie(
    request,
    OAUTH_STATE_COOKIE
  );

  if (
    !code ||
    !returnedState ||
    !expectedState ||
    !safeEqual(returnedState, expectedState)
  ) {
    return redirectWithError(
      env,
      "La vérification Twitch a échoué."
    );
  }

  const tokenResponse = await fetch(
    "https://id.twitch.tv/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: env.TWITCH_REDIRECT_URI
      })
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error("Twitch token error:", tokenData);

    return redirectWithError(
      env,
      "Twitch a refusé la connexion."
    );
  }

  const twitchUserResponse = await fetch(
    "https://api.twitch.tv/helix/users",
    {
      headers: {
        Authorization:
          `Bearer ${tokenData.access_token}`,
        "Client-Id": env.TWITCH_CLIENT_ID
      }
    }
  );

  const twitchUserData =
    await twitchUserResponse.json();

  const twitchUser =
    twitchUserData.data?.[0];

  if (!twitchUserResponse.ok || !twitchUser) {
    return redirectWithError(
      env,
      "Impossible de récupérer le compte Twitch."
    );
  }

  await env.DB.prepare(`
    INSERT INTO users (
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(twitch_id) DO UPDATE SET
      twitch_login = excluded.twitch_login,
      twitch_display_name =
        excluded.twitch_display_name,
      twitch_profile_image_url =
        excluded.twitch_profile_image_url,
      updated_at = CURRENT_TIMESTAMP
  `)
    .bind(
      twitchUser.id,
      twitchUser.login,
      twitchUser.display_name,
      twitchUser.profile_image_url
    )
    .run();

  const user = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE twitch_id = ?
  `)
    .bind(twitchUser.id)
    .first();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO user_roles (
      user_id,
      role_key
    )
    VALUES (?, 'viewer')
  `)
    .bind(user.id)
    .run();

  /*
   * Si ce compte Twitch avait été préinscrit comme créateur,
   * il devient propriétaire du profil à sa première connexion.
   */
  const creator = await env.DB.prepare(`
    SELECT id
    FROM creators
    WHERE twitch_id = ?
  `)
    .bind(twitchUser.id)
    .first();

  if (creator) {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE creators
        SET
          owner_user_id = ?,
          twitch_login = ?,
          twitch_display_name = ?,
          twitch_profile_image_url = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        user.id,
        twitchUser.login,
        twitchUser.display_name,
        twitchUser.profile_image_url,
        creator.id
      ),

      env.DB.prepare(`
        INSERT OR IGNORE INTO user_roles (
          user_id,
          role_key
        )
        VALUES (?, 'creator')
      `).bind(user.id),

      env.DB.prepare(`
        UPDATE creator_staff_requests
        SET proposed_user_id = ?
        WHERE proposed_user_id IS NULL
          AND proposed_twitch_login = ?
            COLLATE NOCASE
      `).bind(user.id, twitchUser.login)
    ]);
  }

  const sessionToken = randomHex(32);

  const tokenHash = await hash(
    `${sessionToken}:${env.TOKEN_PEPPER}`
  );

  const expiresAt = new Date(
    Date.now() +
    SESSION_DURATION_SECONDS * 1000
  ).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (
      token_hash,
      user_id,
      expires_at
    )
    VALUES (?, ?, ?)
  `)
    .bind(tokenHash, user.id, expiresAt)
    .run();

  let response = Response.redirect(
    `${env.SITE_URL}/compte.html`,
    302
  );

  response = withCookie(
    response,
    makeCookie(
      SESSION_COOKIE,
      sessionToken,
      {
        maxAge: SESSION_DURATION_SECONDS,
        httpOnly: true
      }
    )
  );

  return withCookie(
    response,
    makeCookie(OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      httpOnly: true
    })
  );
}

async function getCurrentUser(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json({
      authenticated: false
    });
  }

  const roles = await getUserRoles(env, user.id);
  const creatorAccess =
    await getCreatorAccess(env, user.id);

  return json({
    authenticated: true,
    user: publicUser(user),
    roles,
    creatorAccess
  });
}

function logout() {
  return withCookie(
    json({ success: true }),
    makeCookie(SESSION_COOKIE, "", {
      maxAge: 0,
      httpOnly: true
    })
  );
}

/* ============================================================
   INSTALLATION DU PREMIER SUPER ADMIN
   ============================================================ */

async function bootstrapSuperAdmin(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json(
      { error: "Connexion Twitch requise." },
      401
    );
  }

  const suppliedSecret =
    request.headers.get("X-Bootstrap-Secret");

  if (
    !suppliedSecret ||
    !env.BOOTSTRAP_SECRET ||
    !safeEqual(suppliedSecret, env.BOOTSTRAP_SECRET)
  ) {
    return json(
      { error: "Secret d’installation invalide." },
      401
    );
  }

  const existing = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM user_roles
    WHERE role_key = 'super_admin'
  `).first();

  if (Number(existing?.total ?? 0) > 0) {
    return json(
      {
        error:
          "Un super administrateur existe déjà."
      },
      409
    );
  }

  await env.DB.prepare(`
    INSERT INTO user_roles (
      user_id,
      role_key,
      granted_by_user_id
    )
    VALUES (?, 'super_admin', ?)
  `)
    .bind(user.id, user.id)
    .run();

  await writeAudit(env, user.id, {
    action: "bootstrap.super_admin",
    entityType: "user",
    entityId: String(user.id),
    newValue: {
      role: "super_admin"
    }
  });

  return json({
    success: true,
    message:
      "Tu es maintenant super administrateur."
  });
}

/* ============================================================
   ÉVÉNEMENT ET INTERACTIONS
   ============================================================ */

async function getPublicEvent(env) {
  const settings = await env.DB.prepare(`
    SELECT setting_key, setting_value
    FROM event_settings
  `).all();

  const mapped = Object.fromEntries(
    (settings.results ?? []).map(item => [
      item.setting_key,
      item.setting_value
    ])
  );

  return json({
    name: mapped.event_name ?? env.EVENT_NAME,
    charity:
      mapped.charity_name ?? env.CHARITY_NAME,
    timezone:
      mapped.event_timezone ?? env.EVENT_TIMEZONE,
    startsAt:
      mapped.event_start ?? env.EVENT_START,
    endsAt:
      mapped.event_end ?? env.EVENT_END,
    siteMode: mapped.site_mode ?? "development",
    publicStatisticsEnabled:
      mapped.public_statistics_enabled !== "false"
  });
}

async function getPublicFeatures(env) {
  const result = await env.DB.prepare(`
    SELECT
      feature_key,
      title,
      description,
      icon,
      target_url,
      status,
      opens_at,
      closes_at
    FROM site_features
    WHERE status <> 'archived'
    ORDER BY display_order ASC
  `).all();

  const now = Date.now();

  return json({
    features: (result.results ?? []).map(item => {
      const opensAt = item.opens_at
        ? new Date(item.opens_at).getTime()
        : null;

      const closesAt = item.closes_at
        ? new Date(item.closes_at).getTime()
        : null;

      const scheduledOpen =
        (!opensAt || now >= opensAt) &&
        (!closesAt || now < closesAt);

      return {
        key: item.feature_key,
        title: item.title,
        description: item.description,
        icon: item.icon,
        targetUrl: item.target_url,
        status: item.status,
        isOpen:
          item.status === "open" && scheduledOpen
      };
    })
  });
}

/* ============================================================
   CRÉATEURS PUBLICS
   ============================================================ */

async function getPublicCreators(env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      slug,
      banner_storage_key,
      public_description_markdown,
      donation_url,
      display_order
    FROM creators
    WHERE status = 'active'
    ORDER BY display_order ASC, id ASC
  `).all();

  return json({
    creators: (result.results ?? []).map(
      mapPublicCreator
    )
  });
}

async function getPublicCreator(env, slug) {
  const creator = await env.DB.prepare(`
    SELECT
      id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      slug,
      banner_storage_key,
      public_description_markdown,
      donation_url,
      display_order
    FROM creators
    WHERE slug = ? COLLATE NOCASE
      AND status = 'active'
  `)
    .bind(slug)
    .first();

  if (!creator) {
    return json(
      { error: "Créateur introuvable." },
      404
    );
  }

  const socialLinks = await env.DB.prepare(`
    SELECT
      platform,
      url,
      label
    FROM creator_social_links
    WHERE creator_id = ?
      AND is_visible = 1
    ORDER BY display_order ASC, id ASC
  `)
    .bind(creator.id)
    .all();

  const schedule = await env.DB.prepare(`
    SELECT DISTINCT
      schedule_entries.id,
      schedule_entries.title,
      schedule_entries.description_markdown,
      schedule_entries.starts_at,
      schedule_entries.ends_at
    FROM schedule_entries
    LEFT JOIN schedule_participants
      ON schedule_participants.schedule_entry_id =
        schedule_entries.id
    WHERE schedule_entries.status = 'published'
      AND (
        schedule_entries.primary_creator_id = ?
        OR schedule_participants.creator_id = ?
      )
    ORDER BY schedule_entries.starts_at ASC
  `)
    .bind(creator.id, creator.id)
    .all();

  return json({
    creator: {
      ...mapPublicCreator(creator),
      socialLinks: socialLinks.results ?? [],
      schedule: schedule.results ?? []
    }
  });
}

async function redirectToDonation(env, slug) {
  const creator = await env.DB.prepare(`
    SELECT donation_url
    FROM creators
    WHERE slug = ? COLLATE NOCASE
      AND status = 'active'
  `)
    .bind(slug)
    .first();

  if (!creator?.donation_url) {
    return Response.redirect(
      `${env.SITE_URL}/createur.html?slug=` +
      encodeURIComponent(slug) +
      "&donationError=unavailable",
      302
    );
  }

  return Response.redirect(
    creator.donation_url,
    302
  );
}

/* ============================================================
   COMPTE
   ============================================================ */

async function getAccount(request, env) {
  const user = await requireUser(request, env);

  if (!user) {
    return json(
      { error: "Connexion Twitch requise." },
      401
    );
  }

  const roles = await getUserRoles(env, user.id);
  const creatorAccess =
    await getCreatorAccess(env, user.id);

  const creditBalance = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS balance
    FROM credit_ledger
    WHERE user_id = ?
  `)
    .bind(user.id)
    .first();

  return json({
    user: publicUser(user),
    roles,
    creatorAccess,
    creditsAvailable:
      Number(creditBalance?.balance ?? 0),
    onboardingCompleted:
      Boolean(user.onboarding_completed)
  });
}

/* ============================================================
   PANEL CRÉATEUR
   ============================================================ */

async function getCreatorPanel(request, env) {
  const access = await requireCreatorAccess(
    request,
    env
  );

  if (!access) {
    return json(
      { error: "Accès créateur requis." },
      403
    );
  }

  const creator = await env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE id = ?
  `)
    .bind(access.creatorId)
    .first();

  const pendingRevision = await env.DB.prepare(`
    SELECT
      id,
      original_markdown,
      moderated_markdown,
      status,
      moderator_note,
      submitted_at,
      reviewed_at
    FROM creator_description_revisions
    WHERE creator_id = ?
      AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `)
    .bind(access.creatorId)
    .first();

  const socialLinks = await env.DB.prepare(`
    SELECT
      id,
      platform,
      url,
      label,
      display_order,
      is_visible
    FROM creator_social_links
    WHERE creator_id = ?
    ORDER BY display_order ASC, id ASC
  `)
    .bind(access.creatorId)
    .all();

  const staffRequests = await env.DB.prepare(`
    SELECT
      id,
      proposed_twitch_login,
      staff_type,
      reason,
      status,
      reviewer_note,
      created_at,
      reviewed_at
    FROM creator_staff_requests
    WHERE creator_id = ?
    ORDER BY id DESC
  `)
    .bind(access.creatorId)
    .all();

  return json({
    access,
    creator,
    pendingRevision,
    socialLinks: socialLinks.results ?? [],
    staffRequests: staffRequests.results ?? []
  });
}

async function submitCreatorDescription(
  request,
  env
) {
  const access = await requireCreatorAccess(
    request,
    env
  );

  if (!access || !access.canEditProfile) {
    return json(
      { error: "Modification non autorisée." },
      403
    );
  }

  const body = await readJson(request);

  if (!body) {
    return json(
      { error: "JSON invalide." },
      400
    );
  }

  const markdown = normalizeMarkdown(
    body.markdown
  );

  if (!markdown) {
    return json(
      {
        error:
          "La description ne peut pas être vide."
      },
      400
    );
  }

  if (markdown.length > 20000) {
    return json(
      {
        error:
          "La description dépasse 20 000 caractères."
      },
      400
    );
  }

  const creator = await env.DB.prepare(`
    SELECT validation_bypass
    FROM creators
    WHERE id = ?
  `)
    .bind(access.creatorId)
    .first();

  await env.DB.prepare(`
    UPDATE creator_description_revisions
    SET status = 'superseded'
    WHERE creator_id = ?
      AND status = 'pending'
  `)
    .bind(access.creatorId)
    .run();

  const bypass =
    Boolean(creator?.validation_bypass);

  const result = await env.DB.prepare(`
    INSERT INTO creator_description_revisions (
      creator_id,
      submitted_by_user_id,
      original_markdown,
      moderated_markdown,
      status,
      reviewed_by_user_id,
      reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      access.creatorId,
      access.user.id,
      markdown,
      bypass ? markdown : null,
      bypass ? "approved" : "pending",
      bypass ? access.user.id : null,
      bypass ? new Date().toISOString() : null
    )
    .run();

  if (bypass) {
    await env.DB.prepare(`
      UPDATE creators
      SET
        public_description_markdown = ?,
        public_description_updated_at =
          CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(markdown, access.creatorId)
      .run();
  }

  await writeAudit(env, access.user.id, {
    action: bypass
      ? "creator.description.publish_bypass"
      : "creator.description.submit",
    entityType: "creator",
    entityId: String(access.creatorId),
    newValue: {
      revisionId: result.meta?.last_row_id,
      markdown,
      bypass
    }
  });

  return json({
    success: true,
    status: bypass ? "approved" : "pending"
  });
}

async function replaceCreatorSocialLinks(
  request,
  env
) {
  const access = await requireCreatorAccess(
    request,
    env
  );

  if (!access || !access.canEditProfile) {
    return json(
      { error: "Modification non autorisée." },
      403
    );
  }

  const body = await readJson(request);

  if (!body || !Array.isArray(body.links)) {
    return json(
      { error: "Liste de liens invalide." },
      400
    );
  }

  const links = body.links
    .slice(0, 20)
    .map((item, index) => ({
      platform: String(item.platform ?? "")
        .trim()
        .slice(0, 50),
      url: String(item.url ?? "")
        .trim()
        .slice(0, 1000),
      label: String(item.label ?? "")
        .trim()
        .slice(0, 100),
      displayOrder: index,
      isVisible: item.isVisible !== false
    }))
    .filter(
      item =>
        item.platform &&
        isAllowedHttpUrl(item.url)
    );

  const statements = [
    env.DB.prepare(`
      DELETE FROM creator_social_links
      WHERE creator_id = ?
    `).bind(access.creatorId)
  ];

  for (const link of links) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO creator_social_links (
          creator_id,
          platform,
          url,
          label,
          display_order,
          is_visible
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        access.creatorId,
        link.platform,
        link.url,
        link.label || null,
        link.displayOrder,
        link.isVisible ? 1 : 0
      )
    );
  }

  await env.DB.batch(statements);

  return json({
    success: true,
    links
  });
}

async function createStaffRequest(request, env) {
  const access = await requireCreatorAccess(
    request,
    env
  );

  if (
    !access ||
    !access.canProposeStaff
  ) {
    return json(
      { error: "Action non autorisée." },
      403
    );
  }

  const body = await readJson(request);

  const login = String(
    body?.twitchLogin ?? ""
  )
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  const staffType = String(
    body?.staffType ?? ""
  );

  const reason = String(body?.reason ?? "")
    .trim()
    .slice(0, 1000);

  if (
    !login ||
    ![
      "creator_moderator",
      "creator_delegate"
    ].includes(staffType) ||
    !reason
  ) {
    return json(
      {
        error:
          "Login, rôle et motif sont obligatoires."
      },
      400
    );
  }

  const twitchUser = await getTwitchUserByLogin(
    env,
    login
  );

  if (!twitchUser) {
    return json(
      { error: "Compte Twitch introuvable." },
      404
    );
  }

  const knownUser = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE twitch_id = ?
  `)
    .bind(twitchUser.id)
    .first();

  const result = await env.DB.prepare(`
    INSERT INTO creator_staff_requests (
      creator_id,
      proposed_user_id,
      proposed_twitch_id,
      proposed_twitch_login,
      staff_type,
      reason,
      proposed_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      access.creatorId,
      knownUser?.id ?? null,
      twitchUser.id,
      twitchUser.login,
      staffType,
      reason,
      access.user.id
    )
    .run();

  return json({
    success: true,
    requestId: result.meta?.last_row_id,
    twitchUser: {
      id: twitchUser.id,
      login: twitchUser.login,
      displayName: twitchUser.display_name,
      profileImageUrl:
        twitchUser.profile_image_url
    }
  });
}

/* ============================================================
   SUPER ADMINISTRATION
   ============================================================ */

async function adminGetCreators(request, env) {
  const admin = await requireSuperAdmin(
    request,
    env
  );

  if (!admin) {
    return json(
      { error: "Accès super admin requis." },
      403
    );
  }

  const result = await env.DB.prepare(`
    SELECT *
    FROM creators
    ORDER BY display_order ASC, id ASC
  `).all();

  return json({
    creators: result.results ?? []
  });
}

async function adminCreateCreator(request, env) {
  const admin = await requireSuperAdmin(
    request,
    env
  );

  if (!admin) {
    return json(
      { error: "Accès super admin requis." },
      403
    );
  }

  const body = await readJson(request);

  const login = String(
    body?.twitchLogin ?? ""
  )
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  const requestedSlug =
    String(body?.slug ?? "")
      .trim()
      .toLowerCase();

  if (!login) {
    return json(
      { error: "Login Twitch obligatoire." },
      400
    );
  }

  const twitchUser = await getTwitchUserByLogin(
    env,
    login
  );

  if (!twitchUser) {
    return json(
      { error: "Compte Twitch introuvable." },
      404
    );
  }

  const slug =
    sanitizeSlug(requestedSlug) ||
    sanitizeSlug(twitchUser.login);

  if (!slug) {
    return json(
      { error: "Slug invalide." },
      400
    );
  }

  const memberId = String(
    body?.streamlabsMemberId ?? ""
  )
    .trim()
    .slice(0, 100);

  const donationUrl = memberId
    ? `${env.STREAMLABS_TEAM_URL}?member=` +
      encodeURIComponent(memberId)
    : null;

  try {
    const result = await env.DB.prepare(`
      INSERT INTO creators (
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        slug,
        streamlabs_member_id,
        donation_url,
        display_order,
        status,
        created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        twitchUser.id,
        twitchUser.login,
        twitchUser.display_name,
        twitchUser.profile_image_url,
        slug,
        memberId || null,
        donationUrl,
        Number(body?.displayOrder ?? 0),
        VALID_CREATOR_STATUSES.has(body?.status)
          ? body.status
          : "pending",
        admin.id
      )
      .run();

    await writeAudit(env, admin.id, {
      action: "creator.create",
      entityType: "creator",
      entityId: String(result.meta?.last_row_id),
      newValue: {
        twitchId: twitchUser.id,
        twitchLogin: twitchUser.login,
        slug,
        memberId: memberId || null
      }
    });

    return json(
      {
        success: true,
        creatorId: result.meta?.last_row_id,
        creator: {
          twitchId: twitchUser.id,
          twitchLogin: twitchUser.login,
          twitchDisplayName:
            twitchUser.display_name,
          twitchProfileImageUrl:
            twitchUser.profile_image_url,
          slug,
          donationUrl
        }
      },
      201
    );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return json(
        {
          error:
            "Ce compte Twitch ou ce slug existe déjà."
        },
        409
      );
    }

    throw error;
  }
}

async function adminUpdateCreator(
  request,
  env,
  creatorId
) {
  const admin = await requireSuperAdmin(
    request,
    env
  );

  if (!admin) {
    return json(
      { error: "Accès super admin requis." },
      403
    );
  }

  const current = await env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE id = ?
  `)
    .bind(creatorId)
    .first();

  if (!current) {
    return json(
      { error: "Créateur introuvable." },
      404
    );
  }

  const body = await readJson(request);

  const slug =
    body?.slug === undefined
      ? current.slug
      : sanitizeSlug(body.slug);

  const status =
    VALID_CREATOR_STATUSES.has(body?.status)
      ? body.status
      : current.status;

  const memberId =
    body?.streamlabsMemberId === undefined
      ? current.streamlabs_member_id
      : (
          String(body.streamlabsMemberId ?? "")
            .trim()
            .slice(0, 100) || null
        );

  const donationUrl = memberId
    ? `${env.STREAMLABS_TEAM_URL}?member=` +
      encodeURIComponent(memberId)
    : null;

  const newValue = {
    slug,
    status,
    streamlabsMemberId: memberId,
    donationUrl,
    displayOrder: Number(
      body?.displayOrder ??
      current.display_order
    ),
    validationBypass:
      body?.validationBypass === undefined
        ? Boolean(current.validation_bypass)
        : Boolean(body.validationBypass)
  };

  await env.DB.prepare(`
    UPDATE creators
    SET
      slug = ?,
      status = ?,
      streamlabs_member_id = ?,
      donation_url = ?,
      display_order = ?,
      validation_bypass = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      newValue.slug,
      newValue.status,
      newValue.streamlabsMemberId,
      newValue.donationUrl,
      newValue.displayOrder,
      newValue.validationBypass ? 1 : 0,
      creatorId
    )
    .run();

  await writeAudit(env, admin.id, {
    action: "creator.update",
    entityType: "creator",
    entityId: String(creatorId),
    oldValue: current,
    newValue
  });

  return json({
    success: true,
    creator: newValue
  });
}

async function adminGetDescriptionRevisions(
  request,
  env
) {
  const moderator =
    await requireGlobalModerator(request, env);

  if (!moderator) {
    return json(
      { error: "Accès modérateur requis." },
      403
    );
  }

  const url = new URL(request.url);

  const status =
    url.searchParams.get("status") ?? "pending";

  const allowed = new Set([
    "pending",
    "approved",
    "rejected",
    "superseded",
    "all"
  ]);

  const selected = allowed.has(status)
    ? status
    : "pending";

  const baseQuery = `
    SELECT
      revisions.id,
      revisions.creator_id,
      revisions.original_markdown,
      revisions.moderated_markdown,
      revisions.status,
      revisions.moderator_note,
      revisions.submitted_at,
      revisions.reviewed_at,
      creators.slug,
      creators.twitch_login,
      creators.twitch_display_name
    FROM creator_description_revisions AS revisions
    INNER JOIN creators
      ON creators.id = revisions.creator_id
  `;

  const result = selected === "all"
    ? await env.DB.prepare(`
        ${baseQuery}
        ORDER BY revisions.id DESC
        LIMIT 200
      `).all()
    : await env.DB.prepare(`
        ${baseQuery}
        WHERE revisions.status = ?
        ORDER BY revisions.id DESC
        LIMIT 200
      `)
        .bind(selected)
        .all();

  return json({
    revisions: result.results ?? []
  });
}

async function adminReviewDescription(
  request,
  env,
  revisionId,
  decision
) {
  const moderator =
    await requireGlobalModerator(request, env);

  if (!moderator) {
    return json(
      { error: "Accès modérateur requis." },
      403
    );
  }

  const revision = await env.DB.prepare(`
    SELECT *
    FROM creator_description_revisions
    WHERE id = ?
  `)
    .bind(revisionId)
    .first();

  if (!revision) {
    return json(
      { error: "Révision introuvable." },
      404
    );
  }

  if (revision.status !== "pending") {
    return json(
      { error: "Cette révision est déjà traitée." },
      409
    );
  }

  const body = await readJson(request);

  const moderatedMarkdown = normalizeMarkdown(
    body?.moderatedMarkdown ??
    revision.original_markdown
  );

  const note = String(
    body?.moderatorNote ?? ""
  )
    .trim()
    .slice(0, 2000);

  if (
    decision === "approved" &&
    !moderatedMarkdown
  ) {
    return json(
      {
        error:
          "La description approuvée est vide."
      },
      400
    );
  }

  const statements = [
    env.DB.prepare(`
      UPDATE creator_description_revisions
      SET
        moderated_markdown = ?,
        status = ?,
        moderator_note = ?,
        reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'pending'
    `).bind(
      decision === "approved"
        ? moderatedMarkdown
        : null,
      decision,
      note || null,
      moderator.id,
      revisionId
    )
  ];

  if (decision === "approved") {
    statements.push(
      env.DB.prepare(`
        UPDATE creators
        SET
          public_description_markdown = ?,
          public_description_updated_at =
            CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        moderatedMarkdown,
        revision.creator_id
      )
    );
  }

  await env.DB.batch(statements);

  await writeAudit(env, moderator.id, {
    action:
      `creator.description.${decision}`,
    entityType: "creator_description_revision",
    entityId: String(revisionId),
    oldValue: revision,
    newValue: {
      decision,
      moderatedMarkdown:
        decision === "approved"
          ? moderatedMarkdown
          : null,
      note
    }
  });

  return json({
    success: true,
    status: decision
  });
}

async function adminGetStaffRequests(
  request,
  env
) {
  const admin = await requireSuperAdmin(
    request,
    env
  );

  if (!admin) {
    return json(
      { error: "Accès super admin requis." },
      403
    );
  }

  const result = await env.DB.prepare(`
    SELECT
      requests.*,
      creators.twitch_display_name
        AS creator_display_name,
      creators.twitch_login
        AS creator_login
    FROM creator_staff_requests AS requests
    INNER JOIN creators
      ON creators.id = requests.creator_id
    ORDER BY requests.id DESC
    LIMIT 300
  `).all();

  return json({
    requests: result.results ?? []
  });
}

async function adminReviewStaffRequest(
  request,
  env,
  requestId,
  decision
) {
  const admin = await requireSuperAdmin(
    request,
    env
  );

  if (!admin) {
    return json(
      { error: "Accès super admin requis." },
      403
    );
  }

  const staffRequest = await env.DB.prepare(`
    SELECT *
    FROM creator_staff_requests
    WHERE id = ?
  `)
    .bind(requestId)
    .first();

  if (!staffRequest) {
    return json(
      { error: "Demande introuvable." },
      404
    );
  }

  if (staffRequest.status !== "pending") {
    return json(
      { error: "Demande déjà traitée." },
      409
    );
  }

  const body = await readJson(request);

  const reviewerNote = String(
    body?.reviewerNote ?? ""
  )
    .trim()
    .slice(0, 1000);

  let proposedUserId =
    staffRequest.proposed_user_id;

  if (
    decision === "approved" &&
    !proposedUserId
  ) {
    const known = await env.DB.prepare(`
      SELECT id
      FROM users
      WHERE twitch_id = ?
    `)
      .bind(staffRequest.proposed_twitch_id)
      .first();

    proposedUserId = known?.id ?? null;
  }

  if (
    decision === "approved" &&
    !proposedUserId
  ) {
    return json(
      {
        error:
          "La personne doit se connecter une première fois avant l’approbation définitive."
      },
      409
    );
  }

  const statements = [
    env.DB.prepare(`
      UPDATE creator_staff_requests
      SET
        proposed_user_id = ?,
        status = ?,
        reviewed_by_user_id = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewer_note = ?
      WHERE id = ?
    `).bind(
      proposedUserId,
      decision,
      admin.id,
      reviewerNote || null,
      requestId
    )
  ];

  if (decision === "approved") {
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO creator_staff (
          creator_id,
          user_id,
          staff_type,
          approved_request_id
        )
        VALUES (?, ?, ?, ?)
      `).bind(
        staffRequest.creator_id,
        proposedUserId,
        staffRequest.staff_type,
        requestId
      )
    );
  }

  await env.DB.batch(statements);

  return json({
    success: true,
    status: decision
  });
}

/* ============================================================
   AUTORISATIONS
   ============================================================ */

async function requireUser(request, env) {
  const token = getCookie(
    request,
    SESSION_COOKIE
  );

  if (!token) {
    return null;
  }

  const tokenHash = await hash(
    `${token}:${env.TOKEN_PEPPER}`
  );

  return await env.DB.prepare(`
    SELECT
      users.id,
      users.twitch_id,
      users.twitch_login,
      users.twitch_display_name,
      users.twitch_profile_image_url,
      users.onboarding_completed
    FROM sessions
    INNER JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
      AND users.is_active = 1
  `)
    .bind(tokenHash, new Date().toISOString())
    .first();
}

async function getUserRoles(env, userId) {
  const result = await env.DB.prepare(`
    SELECT role_key
    FROM user_roles
    WHERE user_id = ?
  `)
    .bind(userId)
    .all();

  return (result.results ?? []).map(
    item => item.role_key
  );
}

async function hasRole(env, userId, roleKey) {
  const result = await env.DB.prepare(`
    SELECT 1 AS allowed
    FROM user_roles
    WHERE user_id = ?
      AND role_key = ?
  `)
    .bind(userId, roleKey)
    .first();

  return Boolean(result);
}

async function requireSuperAdmin(request, env) {
  const user = await requireUser(request, env);

  if (
    !user ||
    !(await hasRole(
      env,
      user.id,
      "super_admin"
    ))
  ) {
    return null;
  }

  return user;
}

async function requireGlobalModerator(
  request,
  env
) {
  const user = await requireUser(request, env);

  if (!user) {
    return null;
  }

  const roles = await getUserRoles(
    env,
    user.id
  );

  if (
    !roles.includes("moderator") &&
    !roles.includes("super_admin")
  ) {
    return null;
  }

  return user;
}

async function getCreatorAccess(env, userId) {
  const roles = await getUserRoles(
    env,
    userId
  );

  const ownedCreator = await env.DB.prepare(`
    SELECT id
    FROM creators
    WHERE owner_user_id = ?
      AND status <> 'archived'
    LIMIT 1
  `)
    .bind(userId)
    .first();

  const staff = await env.DB.prepare(`
    SELECT
      creator_id,
      staff_type
    FROM creator_staff
    WHERE user_id = ?
    ORDER BY
      CASE staff_type
        WHEN 'creator_delegate' THEN 1
        ELSE 2
      END
    LIMIT 1
  `)
    .bind(userId)
    .first();

  return {
    isSuperAdmin:
      roles.includes("super_admin"),
    isGlobalModerator:
      roles.includes("moderator") ||
      roles.includes("super_admin"),
    isCreator:
      roles.includes("creator") &&
      Boolean(ownedCreator),
    ownedCreatorId:
      ownedCreator?.id ?? null,
    staffCreatorId:
      staff?.creator_id ?? null,
    staffType:
      staff?.staff_type ?? null
  };
}

async function requireCreatorAccess(
  request,
  env
) {
  const user = await requireUser(request, env);

  if (!user) {
    return null;
  }

  const access = await getCreatorAccess(
    env,
    user.id
  );

  let creatorId =
    access.ownedCreatorId ??
    access.staffCreatorId;

  if (
    !creatorId &&
    access.isSuperAdmin
  ) {
    const url = new URL(request.url);

    creatorId = Number(
      url.searchParams.get("creatorId")
    ) || null;
  }

  if (!creatorId) {
    return null;
  }

  const isOwner =
    access.ownedCreatorId === creatorId;

  const isDelegate =
    access.staffCreatorId === creatorId &&
    access.staffType === "creator_delegate";

  return {
    ...access,
    user,
    creatorId,
    isOwner,
    isDelegate,
    canEditProfile:
      isOwner ||
      isDelegate ||
      access.isSuperAdmin,
    canProposeStaff:
      isOwner ||
      access.isSuperAdmin
  };
}

/* ============================================================
   TWITCH
   ============================================================ */

async function getAppAccessToken(env) {
  const response = await fetch(
    "https://id.twitch.tv/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret:
          env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error(
      "Twitch app token error:",
      data
    );

    return null;
  }

  return data.access_token;
}

async function getTwitchUserByLogin(
  env,
  login
) {
  const token = await getAppAccessToken(env);

  if (!token) {
    throw new Error(
      "Impossible d’obtenir le jeton Twitch."
    );
  }

  const response = await fetch(
    "https://api.twitch.tv/helix/users?" +
    new URLSearchParams({
      login
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": env.TWITCH_CLIENT_ID
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "Twitch user lookup error:",
      data
    );

    throw new Error(
      "La recherche Twitch a échoué."
    );
  }

  return data.data?.[0] ?? null;
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function mapPublicCreator(creator) {
  return {
    id: creator.id,
    login: creator.twitch_login,
    displayName:
      creator.twitch_display_name,
    profileImageUrl:
      creator.twitch_profile_image_url,
    slug: creator.slug,
    bannerUrl: creator.banner_storage_key
      ? `/api/media/${encodeURIComponent(
          creator.banner_storage_key
        )}`
      : null,
    descriptionMarkdown:
      creator.public_description_markdown,
    donationUrl:
      `/don/${encodeURIComponent(
        creator.slug
      )}`,
    twitchUrl:
      `https://www.twitch.tv/` +
      encodeURIComponent(
        creator.twitch_login
      ),
    displayOrder: creator.display_order
  };
}

function publicUser(user) {
  return {
    id: user.id,
    twitchId: user.twitch_id,
    login: user.twitch_login,
    displayName:
      user.twitch_display_name,
    profileImageUrl:
      user.twitch_profile_image_url
  };
}

function normalizeMarkdown(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function sanitizeSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isAllowedHttpUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

async function writeAudit(
  env,
  actorUserId,
  {
    action,
    entityType,
    entityId = null,
    oldValue = null,
    newValue = null
  }
) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      old_value_json,
      new_value_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(
      actorUserId ?? null,
      action,
      entityType,
      entityId,
      oldValue === null
        ? null
        : JSON.stringify(oldValue),
      newValue === null
        ? null
        : JSON.stringify(newValue)
    )
    .run();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function randomHex(length) {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(length)
    );

  return [...bytes]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}

async function hash(value) {
  const encoded =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return [...new Uint8Array(digest)]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}

function safeEqual(first, second) {
  if (
    typeof first !== "string" ||
    typeof second !== "string" ||
    first.length !== second.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < first.length;
    index++
  ) {
    difference |=
      first.charCodeAt(index) ^
      second.charCodeAt(index);
  }

  return difference === 0;
}

function getCookie(request, name) {
  const cookieHeader =
    request.headers.get("Cookie") ?? "";

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] =
      part.trim().split("=");

    if (rawName === name) {
      try {
        return decodeURIComponent(
          rawValue.join("=")
        );
      } catch {
        return null;
      }
    }
  }

  return null;
}

function makeCookie(
  name,
  value,
  {
    maxAge,
    httpOnly = false,
    secure = true,
    sameSite = "Lax",
    path = "/"
  } = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `SameSite=${sameSite}`
  ];

  if (Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${Math.floor(maxAge)}`);
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function withCookie(response, cookie) {
  const result = new Response(
    response.body,
    response
  );

  result.headers.append(
    "Set-Cookie",
    cookie
  );

  return result;
}

function normalizeTwitchLogin(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizeBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function normalizeInteger(
  value,
  {
    minimum = Number.MIN_SAFE_INTEGER,
    maximum = Number.MAX_SAFE_INTEGER,
    fallback = 0
  } = {}
) {
  const integer =
    Number.parseInt(value, 10);

  if (!Number.isFinite(integer)) {
    return fallback;
  }

  return Math.min(
    Math.max(integer, minimum),
    maximum
  );
}

function sanitizePlainText(
  value,
  maximumLength = 255
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maximumLength);
}

function sanitizeMarkdown(
  value,
  maximumLength = 20000
) {
  /*
   * Cette fonction prépare le Markdown pour son stockage.
   * La conversion en HTML devra également utiliser une
   * bibliothèque de rendu et une sanitisation stricte.
   */
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/<\s*script/gi, "&lt;script")
    .replace(/<\s*iframe/gi, "&lt;iframe")
    .slice(0, maximumLength)
    .trim();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff"
      }
    }
  );
}

function redirect(
  destination,
  status = 302
) {
  return new Response(null, {
    status,
    headers: {
      "Location": destination,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function redirectWithError(
  env,
  message,
  pathname = "/"
) {
  const destination =
    new URL(pathname, env.SITE_URL);

  destination.searchParams.set(
    "error",
    message
  );

  return redirect(
    destination.toString()
  );
}

function notFound(
  message = "Ressource introuvable."
) {
  return json(
    { error: message },
    404
  );
}

function forbidden(
  message = "Accès refusé."
) {
  return json(
    { error: message },
    403
  );
}

function unauthorized(
  message = "Connexion requise."
) {
  return json(
    { error: message },
    401
  );
}

function validationError(
  message,
  fields = {}
) {
  return json(
    {
      error: message,
      fields
    },
    400
  );
}

function internalError() {
  return json(
    {
      error:
        "Une erreur interne est survenue."
    },
    500
  );
}

function corsResponse(
  request,
  env,
  response,
  status
) {
  const origin =
    request.headers.get("Origin");

  const allowedOrigins =
    String(
      env.ALLOWED_ORIGINS ??
      env.ALLOWED_ORIGIN ??
      ""
    )
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

  const headers = {
    "Access-Control-Allow-Methods":
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Allow-Credentials":
      "true",

    "Access-Control-Max-Age":
      "86400",

    "Vary":
      "Origin"
  };

  if (
    origin &&
    allowedOrigins.includes(origin)
  ) {
    headers[
      "Access-Control-Allow-Origin"
    ] = origin;
  }

  if (!response) {
    return new Response(null, {
      status: status ?? 204,
      headers
    });
  }

  const result = new Response(
    response.body,
    response
  );

  for (
    const [headerName, headerValue]
    of Object.entries(headers)
  ) {
    result.headers.set(
      headerName,
      headerValue
    );
  }

  return result;
}

function publicUser(user) {
  return {
    id: Number(user.id),

    twitchId:
      user.twitch_id,

    login:
      user.twitch_login,

    displayName:
      user.twitch_display_name,

    profileImageUrl:
      user.twitch_profile_image_url,

    createdAt:
      user.created_at
  };
}

function publicCreator(creator) {
  return {
    id:
      Number(creator.id),

    slug:
      creator.slug,

    twitchId:
      creator.twitch_id,

    twitchLogin:
      creator.twitch_login,

    twitchDisplayName:
      creator.twitch_display_name,

    twitchProfileImageUrl:
      creator.twitch_profile_image_url,

    bannerUrl:
      creator.banner_storage_key
        ? `/api/media/${creator.banner_storage_key}`
        : null,

    descriptionMarkdown:
      creator.public_description_markdown ?? "",

    donationUrl:
      creator.donation_url,

    streamlabsMemberId:
      creator.streamlabs_member_id,

    displayOrder:
      Number(creator.display_order ?? 0),

    active:
      Boolean(creator.active),

    archived:
      Boolean(creator.archived),

    live: Boolean(creator.is_live),

    liveInformation: creator.is_live
      ? {
          title:
            creator.live_title,

          gameName:
            creator.live_game_name,

          viewerCount:
            Number(
              creator.live_viewer_count ?? 0
            ),

          thumbnailUrl:
            creator.live_thumbnail_url,

          startedAt:
            creator.live_started_at
        }
      : null
  };
}

function mapRoleRows(rows) {
  const roles = new Set();

  for (const row of rows ?? []) {
    if (row.role_key) {
      roles.add(row.role_key);
    }
  }

  return [...roles];
}

function userHasRole(
  roles,
  expectedRole
) {
  return (
    Array.isArray(roles) &&
    roles.includes(expectedRole)
  );
}

function userHasAnyRole(
  roles,
  expectedRoles
) {
  if (!Array.isArray(roles)) {
    return false;
  }

  return expectedRoles.some(
    role => roles.includes(role)
  );
}

function canAccessGlobalModeration(roles) {
  return userHasAnyRole(
    roles,

"moderator",
      "super_admin"

  );
}

function canAccessAdministration(roles) {
  return userHasRole(
    roles,
    "super_admin"
  );
}

function canAccessCreatorPanel(roles) {
  return userHasAnyRole(
    roles,

"creator",
      "moderator",
      "super_admin"

  );
}

function buildDonationUrl(
  teamSlug,
  campaignSlug,
  memberId
) {
  if (
    !teamSlug ||
    !campaignSlug ||
    !memberId
  ) {
    return null;
  }

  const base =
    "https://streamlabscharity.com/teams/";

  const pathname =
    `${encodeURIComponent(teamSlug)}/` +
    `${encodeURIComponent(campaignSlug)}`;

  const destination =
    new URL(pathname, base);

  destination.searchParams.set(
    "member",
    memberId
  );

  return destination.toString();
}

function formatEventConfiguration(
  settings = {}
) {
  return {
    name:
      settings.event_name ??
      "JEvent 26",

    shortName:
      settings.event_short_name ??
      "JEvent 26",

    associationName:
      settings.association_name ??
      "Association Petits Princes",

    timezone:
      settings.timezone ??
      "Europe/Paris",

    /*
     * JEvent 26 :
     * du 25 au 27 octobre 2026,
     * avec une fin dans la nuit du 27 au 28.
     */
    startsAt:
      settings.starts_at ??
      "2026-10-25T16:00:00+01:00",

    endsAt:
      settings.ends_at ??
      "2026-10-28T04:00:00+01:00",

    publicStatistics:
      settings.public_statistics !== false,

    maintenanceMode:
      Boolean(settings.maintenance_mode)
  };
}

function generateRandomToken(
  byteLength = 32
) {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(byteLength)
    );

  return [...bytes]
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function sha256(value) {
  const encoded =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return [...new Uint8Array(digest)]
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function hashSecret(
  secret,
  pepper
) {
  return sha256(
    `${secret}:${pepper}`
  );
}

async function verifyBearerSecret(
  request,
  expectedSecret
) {
  if (
    typeof expectedSecret !== "string" ||
    expectedSecret.length < 32
  ) {
    return false;
  }

  const authorization =
    request.headers.get(
      "Authorization"
    );

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }

  const suppliedSecret =
    authorization.slice(7);

  return safeEqual(
    suppliedSecret,
    expectedSecret
  );
}

function getRequestIp(request) {
  return (
    request.headers.get(
      "CF-Connecting-IP"
    ) ??
    request.headers.get(
      "X-Forwarded-For"
    ) ??
    null
  );
}

function getRequestUserAgent(request) {
  return sanitizePlainText(
    request.headers.get("User-Agent"),
    500
  );
}

async function writeAuditLog(
  env,
  {
    actorUserId = null,
    action,
    entityType,
    entityId = null,
    oldValue = null,
    newValue = null,
    metadata = null,
    request = null
  }
) {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        old_value_json,
        new_value_json,
        metadata_json,
        ip_address,
        user_agent,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(
        actorUserId,

        sanitizePlainText(
          action,
          100
        ),

        sanitizePlainText(
          entityType,
          100
        ),

        entityId === null
          ? null
          : String(entityId),

        oldValue === null
          ? null
          : JSON.stringify(oldValue),

        newValue === null
          ? null
          : JSON.stringify(newValue),

        metadata === null
          ? null
          : JSON.stringify(metadata),

        request
          ? getRequestIp(request)
          : null,

        request
          ? getRequestUserAgent(request)
          : null
      )
      .run();
  } catch (error) {
    /*
     * Une erreur de journalisation ne doit pas annuler
     * l'action principale, mais elle est signalée.
     */
    console.error(
      "Impossible d’écrire le journal d’audit :",
      error
    );
  }
}

function createPagination(url) {
  const page = normalizeInteger(
    url.searchParams.get("page"),
    {
      minimum: 1,
      maximum: 100000,
      fallback: 1
    }
  );

  const pageSize = normalizeInteger(
    url.searchParams.get("pageSize"),
    {
      minimum: 1,
      maximum: 100,
      fallback: 20
    }
  );

  return {
    page,
    pageSize,
    offset:
      (page - 1) * pageSize
  };
}

function paginationResponse(
  items,
  {
    page,
    pageSize,
    total
  }
) {
  const numericTotal =
    Number(total ?? 0);

  return {
    items,

    pagination: {
      page,
      pageSize,
      total: numericTotal,

      pageCount:
        numericTotal === 0
          ? 0
          : Math.ceil(
              numericTotal / pageSize
            )
    }
  };
}

function createPublicIdentifier(
  prefix
) {
  const value =
    generateRandomToken(12);

  return `${prefix}_${value}`;
}

function isValidTwitchLogin(value) {
  return /^[a-z0-9_]{4,25}$/.test(
    normalizeTwitchLogin(value)
  );
}

function isValidSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    String(value ?? "")
  );
}

function isAllowedSocialUrl(
  platform,
  rawUrl
) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const hostname =
    url.hostname.toLowerCase();

  const allowedHosts = {
    youtube: [
      "youtube.com",
      "www.youtube.com",
      "youtu.be"
    ],

    twitter: [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com"
    ],

    tiktok: [
      "tiktok.com",
      "www.tiktok.com"
    ],

    instagram: [
      "instagram.com",
      "www.instagram.com"
    ],

    discord: [
      "discord.gg",
      "discord.com",
      "www.discord.com"
    ],

    bluesky: [
      "bsky.app"
    ],

    website: [
      hostname
    ]
  };

  return (
    allowedHosts[platform]?.includes(
      hostname
    ) ?? false
  );
}

function getEventPhase(settings) {
  const now = Date.now();

  const startsAt =
    new Date(settings.startsAt)
      .getTime();

  const endsAt =
    new Date(settings.endsAt)
      .getTime();

  if (
    Number.isNaN(startsAt) ||
    Number.isNaN(endsAt)
  ) {
    return "configuration_error";
  }

  if (now < startsAt) {
    return "upcoming";
  }

  if (now <= endsAt) {
    return "live";
  }

  return "archive";
}

function calculateGoalState(
  currentAmountCents,
  targetAmountCents,
  completed
) {
  if (completed) {
    return "completed";
  }

  if (
    Number(currentAmountCents) >=
    Number(targetAmountCents)
  ) {
    return "reached";
  }

  return "active";
}

function calculateProgressPercentage(
  currentValue,
  targetValue
) {
  const current =
    Number(currentValue);

  const target =
    Number(targetValue);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (current / target) * 10000
      ) / 100
    )
  );
  /* ============================================================
 * SESSIONS, UTILISATEURS ET RÔLES
 * ============================================================
 */

const SESSION_COOKIE_NAME =
  "jevent_v2_session";

const SESSION_DURATION_SECONDS =
  60 * 60 * 24 * 30;

const AVAILABLE_ROLES = new Set([
  "viewer",
  "creator",
  "moderator",
  "super_admin"
]);

const CREATOR_MEMBER_ROLES = new Set([
  "owner",
  "delegate",
  "creator_moderator"
]);

const CREATOR_MEMBER_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "revoked"
]);

async function getSessionTokenHash(
  env,
  sessionToken
) {
  return hashSecret(
    sessionToken,
    env.TOKEN_PEPPER
  );
}

async function createSession(
  env,
  {
    userId,
    request = null
  }
) {
  const sessionToken =
    generateRandomToken(32);

  const tokenHash =
    await getSessionTokenHash(
      env,
      sessionToken
    );

  const expiresAt =
    new Date(
      Date.now() +
      SESSION_DURATION_SECONDS * 1000
    ).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (
      token_hash,
      user_id,
      expires_at,
      ip_address,
      user_agent,
      created_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
    .bind(
      tokenHash,
      userId,
      request
        ? getRequestIp(request)
        : null,
      request
        ? getRequestUserAgent(request)
        : null
    )
    .run();

  return {
    token: sessionToken,
    expiresAt,
    maxAge: SESSION_DURATION_SECONDS
  };
}

function createSessionCookie(session) {
  return makeCookie(
    SESSION_COOKIE_NAME,
    session.token,
    {
      maxAge: session.maxAge,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createExpiredSessionCookie() {
  return makeCookie(
    SESSION_COOKIE_NAME,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

async function getSession(
  request,
  env
) {
  const sessionToken =
    getCookie(
      request,
      SESSION_COOKIE_NAME
    );

  if (!sessionToken) {
    return null;
  }

  const tokenHash =
    await getSessionTokenHash(
      env,
      sessionToken
    );

  const session =
    await env.DB.prepare(`
      SELECT
        sessions.id,
        sessions.user_id,
        sessions.expires_at,
        sessions.last_seen_at,

        users.twitch_id,
        users.twitch_login,
        users.twitch_display_name,
        users.twitch_profile_image_url,
        users.created_at,
        users.disabled_at

      FROM sessions

      INNER JOIN users
        ON users.id = sessions.user_id

      WHERE sessions.token_hash = ?
        AND sessions.expires_at > ?
        AND users.disabled_at IS NULL

      LIMIT 1
    `)
      .bind(
        tokenHash,
        new Date().toISOString()
      )
      .first();

  if (!session) {
    return null;
  }

  return {
    id:
      Number(session.id),

    userId:
      Number(session.user_id),

    expiresAt:
      session.expires_at,

    lastSeenAt:
      session.last_seen_at,

    tokenHash,

    user: {
      id:
        Number(session.user_id),

      twitch_id:
        session.twitch_id,

      twitch_login:
        session.twitch_login,

      twitch_display_name:
        session.twitch_display_name,

      twitch_profile_image_url:
        session.twitch_profile_image_url,

      created_at:
        session.created_at
    }
  };
}

async function touchSession(
  env,
  session
) {
  const lastSeenAt =
    session.lastSeenAt
      ? new Date(session.lastSeenAt)
      : null;

  /*
   * Évite une écriture D1 à chaque appel.
   * La date n’est rafraîchie qu’après cinq minutes.
   */
  if (
    lastSeenAt &&
    Date.now() - lastSeenAt.getTime() <
      5 * 60 * 1000
  ) {
    return;
  }

  try {
    await env.DB.prepare(`
      UPDATE sessions
      SET last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(session.id)
      .run();
  } catch (error) {
    console.error(
      "Impossible d’actualiser la session :",
      error
    );
  }
}

async function deleteSession(
  request,
  env
) {
  const sessionToken =
    getCookie(
      request,
      SESSION_COOKIE_NAME
    );

  if (!sessionToken) {
    return;
  }

  const tokenHash =
    await getSessionTokenHash(
      env,
      sessionToken
    );

  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE token_hash = ?
  `)
    .bind(tokenHash)
    .run();
}

async function deleteAllUserSessions(
  env,
  userId,
  exceptSessionId = null
) {
  if (exceptSessionId === null) {
    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE user_id = ?
    `)
      .bind(userId)
      .run();

    return;
  }

  await env.DB.prepare(`
    DELETE FROM sessions
    WHERE user_id = ?
      AND id <> ?
  `)
    .bind(
      userId,
      exceptSessionId
    )
    .run();
}

async function deleteExpiredSessions(env) {
  const result =
    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE expires_at <= ?
    `)
      .bind(
        new Date().toISOString()
      )
      .run();

  return Number(
    result.meta?.changes ?? 0
  );
}

async function getUserRoles(
  env,
  userId
) {
  const result =
    await env.DB.prepare(`
      SELECT role_key
      FROM user_roles
      WHERE user_id = ?
        AND revoked_at IS NULL
      ORDER BY role_key ASC
    `)
      .bind(userId)
      .all();

  return mapRoleRows(
    result.results ?? []
  );
}

async function getUserCreatorMemberships(
  env,
  userId,
  {
    includePending = false
  } = {}
) {
  const statuses =
    includePending
      ? ["pending", "approved"]
      : ["approved"];

  const placeholders =
    statuses.map(() => "?").join(", ");

  const result =
    await env.DB.prepare(`
      SELECT
        creator_members.id,
        creator_members.creator_id,
        creator_members.member_role,
        creator_members.status,
        creator_members.reason,
        creator_members.created_at,
        creator_members.approved_at,

        creators.slug,
        creators.twitch_id,
        creators.twitch_login,
        creators.twitch_display_name,
        creators.twitch_profile_image_url,
        creators.active,
        creators.archived

      FROM creator_members

      INNER JOIN creators
        ON creators.id =
          creator_members.creator_id

      WHERE creator_members.user_id = ?
        AND creator_members.status
          IN (${placeholders})

      ORDER BY
        creators.display_order ASC,
        creators.twitch_display_name ASC
    `)
      .bind(
        userId,
        ...statuses
      )
      .all();

  return (result.results ?? []).map(
    membership => ({
      id:
        Number(membership.id),

      creatorId:
        Number(membership.creator_id),

      memberRole:
        membership.member_role,

      status:
        membership.status,

      reason:
        membership.reason,

      createdAt:
        membership.created_at,

      approvedAt:
        membership.approved_at,

      creator: {
        id:
          Number(membership.creator_id),

        slug:
          membership.slug,

        twitchId:
          membership.twitch_id,

        twitchLogin:
          membership.twitch_login,

        twitchDisplayName:
          membership.twitch_display_name,

        twitchProfileImageUrl:
          membership.twitch_profile_image_url,

        active:
          Boolean(membership.active),

        archived:
          Boolean(membership.archived)
      }
    })
  );
}

async function buildAuthenticatedUser(
  env,
  session
) {
  const roles =
    await getUserRoles(
      env,
      session.userId
    );

  const creatorMemberships =
    await getUserCreatorMemberships(
      env,
      session.userId
    );

  return {
    ...publicUser(session.user),

    roles,

    creatorMemberships,

    permissions:
      buildUserPermissions(
        roles,
        creatorMemberships
      )
  };
}

function buildUserPermissions(
  roles,
  creatorMemberships
) {
  const creatorScopes =
    creatorMemberships.map(
      membership => ({
        creatorId:
          membership.creatorId,

        role:
          membership.memberRole
      })
    );

  return {
    isViewer: true,

    isCreator:
      userHasRole(
        roles,
        "creator"
      ),

    isGlobalModerator:
      userHasRole(
        roles,
        "moderator"
      ),

    isSuperAdmin:
      userHasRole(
        roles,
        "super_admin"
      ),

    canAccessCreatorPanel:
      canAccessCreatorPanel(roles) ||
      creatorScopes.length > 0,

    canAccessGlobalModeration:
      canAccessGlobalModeration(roles),

    canAccessAdministration:
      canAccessAdministration(roles),

    creatorScopes
  };
}

async function requireSession(
  request,
  env
) {
  const session =
    await getSession(
      request,
      env
    );

  if (!session) {
    return null;
  }

  await touchSession(
    env,
    session
  );

  return session;
}

async function requireAuthenticatedUser(
  request,
  env
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return null;
  }

  const user =
    await buildAuthenticatedUser(
      env,
      session
    );

  return {
    session,
    user
  };
}

async function requireRole(
  request,
  env,
  requiredRole
) {
  if (
    !AVAILABLE_ROLES.has(
      requiredRole
    )
  ) {
    throw new Error(
      `Rôle inconnu : ${requiredRole}`
    );
  }

  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return {
      allowed: false,
      response: unauthorized()
    };
  }

  if (
    !userHasRole(
      authentication.user.roles,
      requiredRole
    )
  ) {
    return {
      allowed: false,
      response: forbidden(
        "Tu ne possèdes pas le rôle requis."
      )
    };
  }

  return {
    allowed: true,
    ...authentication
  };
}

async function requireAnyRole(
  request,
  env,
  requiredRoles
) {
  const validRoles =
    requiredRoles.filter(
      role =>
        AVAILABLE_ROLES.has(role)
    );

  if (validRoles.length === 0) {
    throw new Error(
      "Aucun rôle valide fourni."
    );
  }

  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return {
      allowed: false,
      response: unauthorized()
    };
  }

  if (
    !userHasAnyRole(
      authentication.user.roles,
      validRoles
    )
  ) {
    return {
      allowed: false,
      response: forbidden(
        "Tu ne possèdes pas les droits requis."
      )
    };
  }

  return {
    allowed: true,
    ...authentication
  };
}

async function requireSuperAdmin(
  request,
  env
) {
  return requireRole(
    request,
    env,
    "super_admin"
  );
}

async function requireGlobalModerator(
  request,
  env
) {
  return requireAnyRole(
    request,
    env,

"moderator",
      "super_admin"

  );
}

async function userCanManageCreator(
  env,
  user,
  creatorId,
  {
    allowCreatorModerator = true,
    allowDelegate = true,
    allowOwner = true,
    requireGlobalModerator = false
  } = {}
) {
  if (
    userHasRole(
      user.roles,
      "super_admin"
    )
  ) {
    return true;
  }

  if (
    userHasRole(
      user.roles,
      "moderator"
    )
  ) {
    return true;
  }

  if (requireGlobalModerator) {
    return false;
  }

  const membership =
    user.creatorMemberships.find(
      item =>
        Number(item.creatorId) ===
        Number(creatorId)
    );

  if (!membership) {
    return false;
  }

  if (
    allowOwner &&
    membership.memberRole === "owner"
  ) {
    return true;
  }

  if (
    allowDelegate &&
    membership.memberRole === "delegate"
  ) {
    return true;
  }

  if (
    allowCreatorModerator &&
    membership.memberRole ===
      "creator_moderator"
  ) {
    return true;
  }

  return false;
}

async function requireCreatorAccess(
  request,
  env,
  creatorId,
  options = {}
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return {
      allowed: false,
      response: unauthorized()
    };
  }

  const allowed =
    await userCanManageCreator(
      env,
      authentication.user,
      creatorId,
      options
    );

  if (!allowed) {
    return {
      allowed: false,
      response: forbidden(
        "Tu n’as pas accès à ce créateur."
      )
    };
  }

  return {
    allowed: true,
    ...authentication
  };
}

/* ============================================================
 * CONSULTATION DES UTILISATEURS
 * ============================================================
 */

async function findUserById(
  env,
  userId
) {
  return env.DB.prepare(`
    SELECT
      id,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      created_at,
      disabled_at
    FROM users
    WHERE id = ?
    LIMIT 1
  `)
    .bind(userId)
    .first();
}

async function findUserByTwitchId(
  env,
  twitchId
) {
  return env.DB.prepare(`
    SELECT
      id,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      created_at,
      disabled_at
    FROM users
    WHERE twitch_id = ?
    LIMIT 1
  `)
    .bind(twitchId)
    .first();
}

async function findUserByTwitchLogin(
  env,
  twitchLogin
) {
  const normalizedLogin =
    normalizeTwitchLogin(
      twitchLogin
    );

  return env.DB.prepare(`
    SELECT
      id,
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      created_at,
      disabled_at
    FROM users
    WHERE twitch_login = ?
      COLLATE NOCASE
    LIMIT 1
  `)
    .bind(normalizedLogin)
    .first();
}

async function upsertTwitchUser(
  env,
  twitchUser
) {
  const twitchId =
    sanitizePlainText(
      twitchUser.id,
      50
    );

  const twitchLogin =
    normalizeTwitchLogin(
      twitchUser.login
    );

  const displayName =
    sanitizePlainText(
      twitchUser.display_name ||
      twitchUser.login,
      100
    );

  const profileImageUrl =
    sanitizePlainText(
      twitchUser.profile_image_url,
      1000
    );

  if (
    !twitchId ||
    !isValidTwitchLogin(twitchLogin)
  ) {
    throw new Error(
      "Compte Twitch invalide."
    );
  }

  await env.DB.prepare(`
    INSERT INTO users (
      twitch_id,
      twitch_login,
      twitch_display_name,
      twitch_profile_image_url,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

    ON CONFLICT(twitch_id)
    DO UPDATE SET
      twitch_login =
        excluded.twitch_login,

      twitch_display_name =
        excluded.twitch_display_name,

      twitch_profile_image_url =
        excluded.twitch_profile_image_url,

      updated_at =
        CURRENT_TIMESTAMP
  `)
    .bind(
      twitchId,
      twitchLogin,
      displayName,
      profileImageUrl || null
    )
    .run();

  return findUserByTwitchId(
    env,
    twitchId
  );
}

async function listUsers(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url =
    new URL(request.url);

  const {
    page,
    pageSize,
    offset
  } = createPagination(url);

  const search =
    sanitizePlainText(
      url.searchParams.get("search"),
      100
    );

  const searchPattern =
    `%${search}%`;

  let usersResult;
  let countResult;

  if (search) {
    usersResult =
      await env.DB.prepare(`
        SELECT
          users.id,
          users.twitch_id,
          users.twitch_login,
          users.twitch_display_name,
          users.twitch_profile_image_url,
          users.created_at,
          users.disabled_at,

          GROUP_CONCAT(
            DISTINCT user_roles.role_key
          ) AS roles

        FROM users

        LEFT JOIN user_roles
          ON user_roles.user_id = users.id
          AND user_roles.revoked_at IS NULL

        WHERE
          users.twitch_login
            LIKE ? COLLATE NOCASE

          OR users.twitch_display_name
            LIKE ? COLLATE NOCASE

          OR users.twitch_id
            LIKE ?

        GROUP BY users.id

        ORDER BY
          users.twitch_display_name ASC

        LIMIT ?
        OFFSET ?
      `)
        .bind(
          searchPattern,
          searchPattern,
          searchPattern,
          pageSize,
          offset
        )
        .all();

    countResult =
      await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
        WHERE
          twitch_login
            LIKE ? COLLATE NOCASE

          OR twitch_display_name
            LIKE ? COLLATE NOCASE

          OR twitch_id
            LIKE ?
      `)
        .bind(
          searchPattern,
          searchPattern,
          searchPattern
        )
        .first();
  } else {
    usersResult =
      await env.DB.prepare(`
        SELECT
          users.id,
          users.twitch_id,
          users.twitch_login,
          users.twitch_display_name,
          users.twitch_profile_image_url,
          users.created_at,
          users.disabled_at,

          GROUP_CONCAT(
            DISTINCT user_roles.role_key
          ) AS roles

        FROM users

        LEFT JOIN user_roles
          ON user_roles.user_id = users.id
          AND user_roles.revoked_at IS NULL

        GROUP BY users.id

        ORDER BY
          users.twitch_display_name ASC

        LIMIT ?
        OFFSET ?
      `)
        .bind(
          pageSize,
          offset
        )
        .all();

    countResult =
      await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM users
      `)
        .first();
  }

  const items =
    (usersResult.results ?? []).map(
      user => ({
        id:
          Number(user.id),

        twitchId:
          user.twitch_id,

        twitchLogin:
          user.twitch_login,

        twitchDisplayName:
          user.twitch_display_name,

        twitchProfileImageUrl:
          user.twitch_profile_image_url,

        roles:
          user.roles
            ? user.roles.split(",")
            : [],

        disabled:
          Boolean(user.disabled_at),

        createdAt:
          user.created_at
      })
    );

  return json(
    paginationResponse(
      items,
      {
        page,
        pageSize,
        total:
          countResult?.total ?? 0
      }
    )
  );
}

/* ============================================================
 * ATTRIBUTION ET RÉVOCATION DES RÔLES
 * ============================================================
 */

async function countActiveSuperAdmins(env) {
  const result =
    await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) AS total
      FROM user_roles
      WHERE role_key = 'super_admin'
        AND revoked_at IS NULL
    `)
      .first();

  return Number(
    result?.total ?? 0
  );
}

async function userIsActiveSuperAdmin(
  env,
  userId
) {
  const result =
    await env.DB.prepare(`
      SELECT 1 AS allowed
      FROM user_roles
      WHERE user_id = ?
        AND role_key = 'super_admin'
        AND revoked_at IS NULL
      LIMIT 1
    `)
      .bind(userId)
      .first();

  return Boolean(result);
}

async function grantRole(
  request,
  env,
  {
    userId,
    roleKey
  }
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  if (!AVAILABLE_ROLES.has(roleKey)) {
    return validationError(
      "Rôle invalide.",
      {
        roleKey:
          "Ce rôle n’existe pas."
      }
    );
  }

  const targetUser =
    await findUserById(
      env,
      userId
    );

  if (!targetUser) {
    return notFound(
      "Utilisateur introuvable."
    );
  }

  const existingRole =
    await env.DB.prepare(`
      SELECT id, revoked_at
      FROM user_roles
      WHERE user_id = ?
        AND role_key = ?
      LIMIT 1
    `)
      .bind(
        userId,
        roleKey
      )
      .first();

  if (
    existingRole &&
    !existingRole.revoked_at
  ) {
    return json({
      success: true,
      alreadyGranted: true
    });
  }

  if (existingRole) {
    await env.DB.prepare(`
      UPDATE user_roles
      SET
        revoked_at = NULL,
        granted_by_user_id = ?,
        granted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        authorization.user.id,
        existingRole.id
      )
      .run();
  } else {
    await env.DB.prepare(`
      INSERT INTO user_roles (
        user_id,
        role_key,
        granted_by_user_id,
        granted_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(
        userId,
        roleKey,
        authorization.user.id
      )
      .run();
  }

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "user.role.granted",

      entityType:
        "user",

      entityId:
        userId,

      newValue: {
        roleKey
      },

      request
    }
  );

  return json({
    success: true,
    roleKey
  });
}

async function revokeRole(
  request,
  env,
  {
    userId,
    roleKey
  }
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  if (!AVAILABLE_ROLES.has(roleKey)) {
    return validationError(
      "Rôle invalide."
    );
  }

  if (
    roleKey === "super_admin"
  ) {
    const targetIsSuperAdmin =
      await userIsActiveSuperAdmin(
        env,
        userId
      );

    if (targetIsSuperAdmin) {
      const superAdminCount =
        await countActiveSuperAdmins(
          env
        );

      if (superAdminCount <= 1) {
        return json(
          {
            error:
              "Impossible de retirer le dernier super administrateur."
          },
          409
        );
      }
    }
  }

  const result =
    await env.DB.prepare(`
      UPDATE user_roles
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
        AND role_key = ?
        AND revoked_at IS NULL
    `)
      .bind(
        userId,
        roleKey
      )
      .run();

  if (
    Number(
      result.meta?.changes ?? 0
    ) === 0
  ) {
    return notFound(
      "Ce rôle actif n’a pas été trouvé."
    );
  }

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "user.role.revoked",

      entityType:
        "user",

      entityId:
        userId,

      oldValue: {
        roleKey
      },

      request
    }
  );

  return json({
    success: true,
    roleKey
  });
}

/* ============================================================
 * CRÉATEURS ET MEMBRES DES PANELS
 * ============================================================
 */

async function findCreatorById(
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

async function findCreatorBySlug(
  env,
  slug
) {
  return env.DB.prepare(`
    SELECT *
    FROM creators
    WHERE slug = ?
      AND archived = 0
    LIMIT 1
  `)
    .bind(
      normalizeSlug(slug)
    )
    .first();
}

async function getCreatorMembership(
  env,
  {
    creatorId,
    userId
  }
) {
  return env.DB.prepare(`
    SELECT
      id,
      creator_id,
      user_id,
      member_role,
      status,
      reason,
      proposed_by_user_id,
      approved_by_user_id,
      created_at,
      approved_at,
      rejected_at,
      revoked_at
    FROM creator_members
    WHERE creator_id = ?
      AND user_id = ?
    ORDER BY id DESC
    LIMIT 1
  `)
    .bind(
      creatorId,
      userId
    )
    .first();
}

async function proposeCreatorMember(
  request,
  env,
  {
    creatorId,
    targetUserId,
    memberRole,
    reason
  }
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  if (
    !CREATOR_MEMBER_ROLES.has(
      memberRole
    ) ||
    memberRole === "owner"
  ) {
    return validationError(
      "Rôle de membre invalide."
    );
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const canPropose =
    await userCanManageCreator(
      env,
      authentication.user,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (
    !canPropose &&
    !authentication.user.permissions
      .isSuperAdmin
  ) {
    return forbidden(
      "Tu ne peux pas proposer un membre pour ce créateur."
    );
  }

  const targetUser =
    await findUserById(
      env,
      targetUserId
    );

  if (!targetUser) {
    return notFound(
      "Utilisateur à proposer introuvable."
    );
  }

  const normalizedReason =
    sanitizePlainText(
      reason,
      1000
    );

  if (!normalizedReason) {
    return validationError(
      "Un motif est obligatoire.",
      {
        reason:
          "Explique le rôle de cette personne."
      }
    );
  }

  const existing =
    await getCreatorMembership(
      env,
      {
        creatorId,
        userId: targetUserId
      }
    );

  if (
    existing &&
    ["pending", "approved"].includes(
      existing.status
    )
  ) {
    return json(
      {
        error:
          "Cette personne possède déjà une demande ou un accès actif."
      },
      409
    );
  }

  const autoApprove =
    authentication.user.permissions
      .isSuperAdmin;

  const status =
    autoApprove
      ? "approved"
      : "pending";

  const publicId =
    createPublicIdentifier("cma");

  const insertResult =
    await env.DB.prepare(`
      INSERT INTO creator_members (
        public_id,
        creator_id,
        user_id,
        member_role,
        status,
        reason,
        proposed_by_user_id,
        approved_by_user_id,
        created_at,
        approved_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `)
      .bind(
        publicId,
        creatorId,
        targetUserId,
        memberRole,
        status,
        normalizedReason,
        authentication.user.id,

        autoApprove
          ? authentication.user.id
          : null,

        autoApprove
          ? new Date().toISOString()
          : null
      )
      .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authentication.user.id,

      action:
        autoApprove
          ? "creator.member.approved"
          : "creator.member.proposed",

      entityType:
        "creator_member",

      entityId:
        insertResult.meta?.last_row_id,

      newValue: {
        creatorId,
        targetUserId,
        memberRole,
        status,
        reason:
          normalizedReason
      },

      request
    }
  );

  return json(
    {
      success: true,
      publicId,
      status
    },
    201
  );
}

async function listPendingCreatorMembers(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        creator_members.public_id,
        creator_members.creator_id,
        creator_members.user_id,
        creator_members.member_role,
        creator_members.reason,
        creator_members.created_at,

        creators.slug AS creator_slug,
        creators.twitch_display_name
          AS creator_display_name,

        users.twitch_login
          AS target_twitch_login,

        users.twitch_display_name
          AS target_display_name,

        users.twitch_profile_image_url
          AS target_profile_image_url,

        proposer.twitch_display_name
          AS proposer_display_name

      FROM creator_members

      INNER JOIN creators
        ON creators.id =
          creator_members.creator_id

      INNER JOIN users
        ON users.id =
          creator_members.user_id

      LEFT JOIN users AS proposer
        ON proposer.id =
          creator_members.proposed_by_user_id

      WHERE creator_members.status = 'pending'

      ORDER BY creator_members.created_at ASC
    `)
      .all();

  return json({
    requests:
      result.results ?? []
  });
}

async function decideCreatorMemberRequest(
  request,
  env,
  {
    publicId,
    decision,
    moderatorNote = ""
  }
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  if (
    !["approved", "rejected"].includes(
      decision
    )
  ) {
    return validationError(
      "Décision invalide."
    );
  }

  const requestRow =
    await env.DB.prepare(`
      SELECT *
      FROM creator_members
      WHERE public_id = ?
        AND status = 'pending'
      LIMIT 1
    `)
      .bind(publicId)
      .first();

  if (!requestRow) {
    return notFound(
      "Demande en attente introuvable."
    );
  }

  const note =
    sanitizePlainText(
      moderatorNote,
      1000
    );

  await env.DB.prepare(`
    UPDATE creator_members
    SET
      status = ?,
      moderator_note = ?,
      approved_by_user_id = ?,
      approved_at =
        CASE
          WHEN ? = 'approved'
          THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
      rejected_at =
        CASE
          WHEN ? = 'rejected'
          THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(
      decision,
      note || null,
      authorization.user.id,
      decision,
      decision,
      requestRow.id
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        decision === "approved"
          ? "creator.member.approved"
          : "creator.member.rejected",

      entityType:
        "creator_member",

      entityId:
        requestRow.id,

      oldValue: {
        status: "pending"
      },

      newValue: {
        status: decision,
        moderatorNote: note || null
      },

      request
    }
  );

  return json({
    success: true,
    status: decision
  });
}

async function revokeCreatorMember(
  request,
  env,
  {
    publicId
  }
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const membership =
    await env.DB.prepare(`
      SELECT *
      FROM creator_members
      WHERE public_id = ?
        AND status = 'approved'
      LIMIT 1
    `)
      .bind(publicId)
      .first();

  if (!membership) {
    return notFound(
      "Accès créateur actif introuvable."
    );
  }

  if (membership.member_role === "owner") {
    return json(
      {
        error:
          "Le propriétaire principal ne peut pas être retiré depuis cette action."
      },
      409
    );
  }

  await env.DB.prepare(`
    UPDATE creator_members
    SET
      status = 'revoked',
      revoked_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(membership.id)
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.member.revoked",

      entityType:
        "creator_member",

      entityId:
        membership.id,

      oldValue: {
        status:
          membership.status
      },

      newValue: {
        status: "revoked"
      },

      request
    }
  );

  return json({
    success: true
  });
}
/* ============================================================
 * AUTHENTIFICATION OAUTH TWITCH
 * ============================================================
 */

const TWITCH_OAUTH_STATE_COOKIE =
  "jevent_v2_twitch_oauth_state";

const TWITCH_OAUTH_RETURN_COOKIE =
  "jevent_v2_twitch_oauth_return";

const TWITCH_OAUTH_STATE_DURATION_SECONDS =
  10 * 60;

const ALLOWED_AUTH_RETURN_PATHS =
  new Set([
    "/",
    "/compte.html",
    "/createur-panel.html",
    "/moderation.html",
    "/admin.html"
  ]);

function normalizeAuthReturnPath(value) {
  const rawValue =
    String(value ?? "").trim();

  if (
    ALLOWED_AUTH_RETURN_PATHS.has(
      rawValue
    )
  ) {
    return rawValue;
  }

  return "/compte.html";
}

function createOAuthStateCookie(state) {
  return makeCookie(
    TWITCH_OAUTH_STATE_COOKIE,
    state,
    {
      maxAge:
        TWITCH_OAUTH_STATE_DURATION_SECONDS,

      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createExpiredOAuthStateCookie() {
  return makeCookie(
    TWITCH_OAUTH_STATE_COOKIE,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createOAuthReturnCookie(pathname) {
  return makeCookie(
    TWITCH_OAUTH_RETURN_COOKIE,
    normalizeAuthReturnPath(pathname),
    {
      maxAge:
        TWITCH_OAUTH_STATE_DURATION_SECONDS,

      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createExpiredOAuthReturnCookie() {
  return makeCookie(
    TWITCH_OAUTH_RETURN_COOKIE,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createTwitchAuthorizationUrl(
  env,
  {
    state,
    scopes = []
  }
) {
  const parameters =
    new URLSearchParams({
      client_id:
        env.TWITCH_CLIENT_ID,

      redirect_uri:
        env.TWITCH_REDIRECT_URI,

      response_type:
        "code",

      state,

      force_verify:
        "false"
    });

  if (scopes.length > 0) {
    parameters.set(
      "scope",
      scopes.join(" ")
    );
  }

  return (
    "https://id.twitch.tv/oauth2/authorize?" +
    parameters.toString()
  );
}

async function startTwitchAuthentication(
  request,
  env
) {
  if (
    !env.TWITCH_CLIENT_ID ||
    !env.TWITCH_REDIRECT_URI
  ) {
    return internalError();
  }

  const url =
    new URL(request.url);

  const returnPath =
    normalizeAuthReturnPath(
      url.searchParams.get("returnTo")
    );

  const state =
    generateRandomToken(32);

  const authorizationUrl =
    createTwitchAuthorizationUrl(
      env,
      {
        state,

        /*
         * Aucun scope sensible n’est nécessaire
         * pour une connexion d’identité simple.
         *
         * L’autorisation du chatbot EventSub sera
         * gérée dans une route distincte avec les
         * scopes spécifiques du diffuseur.
         */
        scopes: []
      }
    );

  let response =
    redirect(authorizationUrl);

  response =
    withCookie(
      response,
      createOAuthStateCookie(state)
    );

  response =
    withCookie(
      response,
      createOAuthReturnCookie(returnPath)
    );

  return response;
}

async function exchangeTwitchAuthorizationCode(
  env,
  authorizationCode
) {
  const response =
    await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            client_id:
              env.TWITCH_CLIENT_ID,

            client_secret:
              env.TWITCH_CLIENT_SECRET,

            code:
              authorizationCode,

            grant_type:
              "authorization_code",

            redirect_uri:
              env.TWITCH_REDIRECT_URI
          })
      }
    );

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (
    !response.ok ||
    !data?.access_token
  ) {
    console.error(
      "Échec de l’échange OAuth Twitch :",
      data
    );

    return null;
  }

  return {
    accessToken:
      data.access_token,

    refreshToken:
      data.refresh_token ?? null,

    expiresIn:
      Number(data.expires_in ?? 0),

    scopes:
      Array.isArray(data.scope)
        ? data.scope
        : [],

    tokenType:
      data.token_type ?? "bearer"
  };
}

async function getTwitchUserFromToken(
  env,
  accessToken
) {
  const response =
    await fetch(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Client-Id":
            env.TWITCH_CLIENT_ID
        }
      }
    );

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  const twitchUser =
    data?.data?.[0];

  if (
    !response.ok ||
    !twitchUser
  ) {
    console.error(
      "Impossible de récupérer l’utilisateur Twitch :",
      data
    );

    return null;
  }

  return twitchUser;
}

async function ensureViewerRole(
  env,
  userId
) {
  const existingRole =
    await env.DB.prepare(`
      SELECT id
      FROM user_roles
      WHERE user_id = ?
        AND role_key = 'viewer'
        AND revoked_at IS NULL
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (existingRole) {
    return;
  }

  const revokedRole =
    await env.DB.prepare(`
      SELECT id
      FROM user_roles
      WHERE user_id = ?
        AND role_key = 'viewer'
      ORDER BY id DESC
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (revokedRole) {
    await env.DB.prepare(`
      UPDATE user_roles
      SET
        revoked_at = NULL,
        granted_at = CURRENT_TIMESTAMP,
        granted_by_user_id = NULL
      WHERE id = ?
    `)
      .bind(revokedRole.id)
      .run();

    return;
  }

  await env.DB.prepare(`
    INSERT INTO user_roles (
      user_id,
      role_key,
      granted_by_user_id,
      granted_at
    )
    VALUES (?, 'viewer', NULL, CURRENT_TIMESTAMP)
  `)
    .bind(userId)
    .run();
}

async function ensureCreatorRole(
  env,
  userId
) {
  const activeRole =
    await env.DB.prepare(`
      SELECT id
      FROM user_roles
      WHERE user_id = ?
        AND role_key = 'creator'
        AND revoked_at IS NULL
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (activeRole) {
    return;
  }

  const revokedRole =
    await env.DB.prepare(`
      SELECT id
      FROM user_roles
      WHERE user_id = ?
        AND role_key = 'creator'
      ORDER BY id DESC
      LIMIT 1
    `)
      .bind(userId)
      .first();

  if (revokedRole) {
    await env.DB.prepare(`
      UPDATE user_roles
      SET
        revoked_at = NULL,
        granted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(revokedRole.id)
      .run();

    return;
  }

  await env.DB.prepare(`
    INSERT INTO user_roles (
      user_id,
      role_key,
      granted_by_user_id,
      granted_at
    )
    VALUES (?, 'creator', NULL, CURRENT_TIMESTAMP)
  `)
    .bind(userId)
    .run();
}

async function attachPreRegisteredCreator(
  env,
  user
) {
  /*
   * Un super administrateur peut créer le profil
   * avant que le créateur se connecte.
   *
   * La liaison repose sur le Twitch ID, ce qui est
   * plus fiable que le login pouvant être modifié.
   */
  const creator =
    await env.DB.prepare(`
      SELECT
        id,
        twitch_id,
        twitch_login,
        onboarding_completed_at
      FROM creators
      WHERE twitch_id = ?
        AND archived = 0
      LIMIT 1
    `)
      .bind(user.twitch_id)
      .first();

  if (!creator) {
    return null;
  }

  const existingOwner =
    await env.DB.prepare(`
      SELECT id, status
      FROM creator_members
      WHERE creator_id = ?
        AND user_id = ?
        AND member_role = 'owner'
      ORDER BY id DESC
      LIMIT 1
    `)
      .bind(
        creator.id,
        user.id
      )
      .first();

  if (existingOwner) {
    if (
      existingOwner.status !==
      "approved"
    ) {
      await env.DB.prepare(`
        UPDATE creator_members
        SET
          status = 'approved',
          approved_at =
            CURRENT_TIMESTAMP,
          rejected_at = NULL,
          revoked_at = NULL
        WHERE id = ?
      `)
        .bind(existingOwner.id)
        .run();
    }
  } else {
    await env.DB.prepare(`
      INSERT INTO creator_members (
        public_id,
        creator_id,
        user_id,
        member_role,
        status,
        reason,
        proposed_by_user_id,
        approved_by_user_id,
        created_at,
        approved_at
      )
      VALUES (
        ?,
        ?,
        ?,
        'owner',
        'approved',
        'Propriétaire de la chaîne Twitch',
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        createPublicIdentifier("cma"),
        creator.id,
        user.id
      )
      .run();
  }

  await ensureCreatorRole(
    env,
    user.id
  );

  /*
   * Actualise les informations Twitch du créateur.
   */
  await env.DB.prepare(`
    UPDATE creators
    SET
      twitch_login = ?,
      twitch_display_name = ?,
      twitch_profile_image_url = ?,
      claimed_by_user_id = ?,
      claimed_at =
        COALESCE(
          claimed_at,
          CURRENT_TIMESTAMP
        ),
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      user.twitch_login,
      user.twitch_display_name,
      user.twitch_profile_image_url,
      user.id,
      creator.id
    )
    .run();

  return {
    creatorId:
      Number(creator.id),

    requiresOnboarding:
      !creator.onboarding_completed_at
  };
}

async function finishTwitchAuthentication(
  request,
  env
) {
  const url =
    new URL(request.url);

  const twitchError =
    url.searchParams.get("error");

  const twitchErrorDescription =
    url.searchParams.get(
      "error_description"
    );

  if (twitchError) {
    return redirectWithError(
      env,
      twitchErrorDescription ||
      "La connexion Twitch a été annulée."
    );
  }

  const authorizationCode =
    url.searchParams.get("code");

  const returnedState =
    url.searchParams.get("state");

  const expectedState =
    getCookie(
      request,
      TWITCH_OAUTH_STATE_COOKIE
    );

  const returnPath =
    normalizeAuthReturnPath(
      getCookie(
        request,
        TWITCH_OAUTH_RETURN_COOKIE
      )
    );

  if (
    !authorizationCode ||
    !returnedState ||
    !expectedState ||
    !safeEqual(
      returnedState,
      expectedState
    )
  ) {
    return redirectWithError(
      env,
      "La vérification de sécurité Twitch a échoué."
    );
  }

  const token =
    await exchangeTwitchAuthorizationCode(
      env,
      authorizationCode
    );

  if (!token) {
    return redirectWithError(
      env,
      "Twitch a refusé la connexion."
    );
  }

  const twitchUser =
    await getTwitchUserFromToken(
      env,
      token.accessToken
    );

  if (!twitchUser) {
    return redirectWithError(
      env,
      "Impossible de récupérer ton compte Twitch."
    );
  }

  const existingUser =
    await findUserByTwitchId(
      env,
      twitchUser.id
    );

  const isFirstConnection =
    !existingUser;

  const user =
    await upsertTwitchUser(
      env,
      twitchUser
    );

  await ensureViewerRole(
    env,
    user.id
  );

  const creatorAttachment =
    await attachPreRegisteredCreator(
      env,
      user
    );

  const session =
    await createSession(
      env,
      {
        userId: user.id,
        request
      }
    );

  await writeAuditLog(
    env,
    {
      actorUserId:
        user.id,

      action:
        isFirstConnection
          ? "auth.user.first_login"
          : "auth.user.login",

      entityType:
        "user",

      entityId:
        user.id,

      newValue: {
        twitchId:
          user.twitch_id,

        twitchLogin:
          user.twitch_login,

        creatorAttached:
          Boolean(creatorAttachment),

        creatorId:
          creatorAttachment?.creatorId ??
          null
      },

      request
    }
  );

  let destinationPath =
    returnPath;

  /*
   * Lors de la première connexion d’un créateur
   * préinscrit, il est envoyé vers la visite guidée.
   */
  if (
    creatorAttachment
      ?.requiresOnboarding
  ) {
    destinationPath =
      "/createur-panel.html?welcome=1";
  } else if (
    isFirstConnection &&
    destinationPath === "/"
  ) {
    destinationPath =
      "/compte.html?welcome=1";
  }

  const destination =
    new URL(
      destinationPath,
      env.SITE_URL
    );

  let response =
    redirect(
      destination.toString()
    );

  response =
    withCookie(
      response,
      createSessionCookie(session)
    );

  response =
    withCookie(
      response,
      createExpiredOAuthStateCookie()
    );

  response =
    withCookie(
      response,
      createExpiredOAuthReturnCookie()
    );

  return response;
}

async function getCurrentAuthentication(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return json({
      authenticated: false,
      user: null
    });
  }

  return json({
    authenticated: true,

    user:
      authentication.user,

    session: {
      expiresAt:
        authentication.session.expiresAt
    }
  });
}

async function logoutCurrentUser(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (authentication) {
    await deleteSession(
      request,
      env
    );

    await writeAuditLog(
      env,
      {
        actorUserId:
          authentication.user.id,

        action:
          "auth.user.logout",

        entityType:
          "user",

        entityId:
          authentication.user.id,

        request
      }
    );
  }

  return withCookie(
    json({
      success: true
    }),
    createExpiredSessionCookie()
  );
}

/* ============================================================
 * PREMIÈRE CONNEXION ET ONBOARDING
 * ============================================================
 */

async function getCreatorOnboarding(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const ownerMembership =
    authentication.user
      .creatorMemberships
      .find(
        membership =>
          membership.memberRole ===
          "owner"
      );

  if (!ownerMembership) {
    return forbidden(
      "Aucun profil créateur ne t’est associé."
    );
  }

  const creator =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        banner_storage_key,
        public_description_markdown,
        streamlabs_member_id,
        donation_url,
        onboarding_completed_at,
        description_moderation_bypass,
        active,
        archived
      FROM creators
      WHERE id = ?
      LIMIT 1
    `)
      .bind(
        ownerMembership.creatorId
      )
      .first();

  if (!creator) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  return json({
    creator:
      publicCreator(creator),

    onboarding: {
      completed:
        Boolean(
          creator
            .onboarding_completed_at
        ),

      steps: [
        {
          key:
            "welcome",

          title:
            "Bienvenue au JEvent 26",

          description:
            "Découvre le fonctionnement de ton espace créateur."
        },

        {
          key:
            "profile",

          title:
            "Complète ta page",

          description:
            "Ajoute une bannière, une description Markdown et tes réseaux."
        },

        {
          key:
            "donation",

          title:
            "Vérifie ta cagnotte",

          description:
            "Contrôle le lien de don associé à ton identifiant Streamlabs."
        },

        {
          key:
            "schedule",

          title:
            "Prépare ton programme",

          description:
            "Renseigne tes activités du 25 au 27 octobre 2026."
        },

        {
          key:
            "twitch",

          title:
            "Autorise les statistiques Twitch",

          description:
            "Autorise le bot JEvent à suivre les messages et emotes de ta chaîne."
        }
      ]
    }
  });
}

async function completeCreatorOnboarding(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const ownerMembership =
    authentication.user
      .creatorMemberships
      .find(
        membership =>
          membership.memberRole ===
          "owner"
      );

  if (!ownerMembership) {
    return forbidden(
      "Aucun profil créateur propriétaire ne t’est associé."
    );
  }

  const result =
    await env.DB.prepare(`
      UPDATE creators
      SET
        onboarding_completed_at =
          COALESCE(
            onboarding_completed_at,
            CURRENT_TIMESTAMP
          ),

        updated_at =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `)
      .bind(
        ownerMembership.creatorId
      )
      .run();

  if (
    Number(
      result.meta?.changes ?? 0
    ) !== 1
  ) {
    return notFound(
      "Profil créateur introuvable."
    );
  }

  await writeAuditLog(
    env,
    {
      actorUserId:
        authentication.user.id,

      action:
        "creator.onboarding.completed",

      entityType:
        "creator",

      entityId:
        ownerMembership.creatorId,

      request
    }
  );

  return json({
    success: true
  });
}

/* ============================================================
 * AUTORISATION TWITCH DU CHATBOT
 * ============================================================
 */

const TWITCH_BOT_OAUTH_STATE_COOKIE =
  "jevent_v2_bot_oauth_state";

const TWITCH_BOT_CREATOR_COOKIE =
  "jevent_v2_bot_creator";

const TWITCH_BROADCASTER_SCOPES = [
  "channel:bot"
];

function createBotOAuthStateCookie(state) {
  return makeCookie(
    TWITCH_BOT_OAUTH_STATE_COOKIE,
    state,
    {
      maxAge:
        TWITCH_OAUTH_STATE_DURATION_SECONDS,

      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createBotCreatorCookie(
  creatorId
) {
  return makeCookie(
    TWITCH_BOT_CREATOR_COOKIE,
    String(creatorId),
    {
      maxAge:
        TWITCH_OAUTH_STATE_DURATION_SECONDS,

      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createExpiredBotOAuthStateCookie() {
  return makeCookie(
    TWITCH_BOT_OAUTH_STATE_COOKIE,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

function createExpiredBotCreatorCookie() {
  return makeCookie(
    TWITCH_BOT_CREATOR_COOKIE,
    "",
    {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/"
    }
  );
}

async function startCreatorBotAuthorization(
  request,
  env,
  creatorId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  /*
   * La personne autorisant doit être le diffuseur
   * Twitch exact de la chaîne.
   */
  if (
    String(
      access.user.twitchId
    ) !==
    String(
      creator.twitch_id
    )
  ) {
    return forbidden(
      "Seul le compte Twitch exact de la chaîne peut accorder cette autorisation."
    );
  }

  const state =
    generateRandomToken(32);

  const authorizationUrl =
    createTwitchAuthorizationUrl(
      env,
      {
        state,
        scopes:
          TWITCH_BROADCASTER_SCOPES
      }
    );

  let response =
    redirect(
      authorizationUrl
    );

  response =
    withCookie(
      response,
      createBotOAuthStateCookie(state)
    );

  response =
    withCookie(
      response,
      createBotCreatorCookie(
        creatorId
      )
    );

  return response;
}

async function encryptSensitiveValue(
  env,
  value
) {
  /*
   * Cette première version chiffre avec AES-GCM.
   * TWITCH_TOKEN_ENCRYPTION_KEY doit être un secret
   * hexadécimal de 32 octets, donc 64 caractères.
   */
  const rawKey =
    String(
      env.TWITCH_TOKEN_ENCRYPTION_KEY ??
      ""
    );

  if (
    !/^[a-f0-9]{64}$/i.test(rawKey)
  ) {
    throw new Error(
      "TWITCH_TOKEN_ENCRYPTION_KEY est absent ou invalide."
    );
  }

  const keyBytes =
    new Uint8Array(
      rawKey.match(/.{2}/g)
        .map(
          byte =>
            Number.parseInt(
              byte,
              16
            )
        )
    );

  const key =
    await crypto.subtle.importKey(
      "raw",
      keyBytes,
      {
        name: "AES-GCM"
      },
      false,
      ["encrypt"]
    );

  const initializationVector =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encodedValue =
    new TextEncoder().encode(
      value
    );

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv:
          initializationVector
      },
      key,
      encodedValue
    );

  return {
    value:
      bytesToBase64(
        new Uint8Array(encrypted)
      ),

    iv:
      bytesToBase64(
        initializationVector
      )
  };
}

function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function saveCreatorTwitchAuthorization(
  env,
  {
    creatorId,
    twitchUserId,
    accessToken,
    refreshToken,
    scopes,
    expiresIn
  }
) {
  const encryptedAccessToken =
    await encryptSensitiveValue(
      env,
      accessToken
    );

  const encryptedRefreshToken =
    refreshToken
      ? await encryptSensitiveValue(
          env,
          refreshToken
        )
      : null;

  const expiresAt =
    expiresIn > 0
      ? new Date(
          Date.now() +
          expiresIn * 1000
        ).toISOString()
      : null;

  await env.DB.prepare(`
    INSERT INTO twitch_authorizations (
      creator_id,
      twitch_user_id,
      authorization_type,
      access_token_encrypted,
      access_token_iv,
      refresh_token_encrypted,
      refresh_token_iv,
      scopes_json,
      expires_at,
      revoked_at,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      'broadcaster_chat',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      NULL,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      creator_id,
      authorization_type
    )
    DO UPDATE SET
      twitch_user_id =
        excluded.twitch_user_id,

      access_token_encrypted =
        excluded.access_token_encrypted,

      access_token_iv =
        excluded.access_token_iv,

      refresh_token_encrypted =
        excluded.refresh_token_encrypted,

      refresh_token_iv =
        excluded.refresh_token_iv,

      scopes_json =
        excluded.scopes_json,

      expires_at =
        excluded.expires_at,

      revoked_at =
        NULL,

      updated_at =
        CURRENT_TIMESTAMP
  `)
    .bind(
      creatorId,
      twitchUserId,
      encryptedAccessToken.value,
      encryptedAccessToken.iv,

      encryptedRefreshToken?.value ??
      null,

      encryptedRefreshToken?.iv ??
      null,

      JSON.stringify(scopes),
      expiresAt
    )
    .run();
}

async function finishCreatorBotAuthorization(
  request,
  env
) {
  const url =
    new URL(request.url);

  const authorizationCode =
    url.searchParams.get("code");

  const returnedState =
    url.searchParams.get("state");

  const expectedState =
    getCookie(
      request,
      TWITCH_BOT_OAUTH_STATE_COOKIE
    );

  const creatorId =
    normalizeInteger(
      getCookie(
        request,
        TWITCH_BOT_CREATOR_COOKIE
      ),
      {
        minimum: 1,
        fallback: 0
      }
    );

  if (
    !authorizationCode ||
    !returnedState ||
    !expectedState ||
    !creatorId ||
    !safeEqual(
      returnedState,
      expectedState
    )
  ) {
    return redirectWithError(
      env,
      "L’autorisation du chatbot Twitch a échoué.",
      "/createur-panel.html"
    );
  }

  const token =
    await exchangeTwitchAuthorizationCode(
      env,
      authorizationCode
    );

  if (!token) {
    return redirectWithError(
      env,
      "Twitch a refusé l’autorisation du chatbot.",
      "/createur-panel.html"
    );
  }

  const twitchUser =
    await getTwitchUserFromToken(
      env,
      token.accessToken
    );

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (
    !twitchUser ||
    !creator ||
    String(twitchUser.id) !==
      String(creator.twitch_id)
  ) {
    return redirectWithError(
      env,
      "Le compte Twitch autorisé ne correspond pas à la chaîne du créateur.",
      "/createur-panel.html"
    );
  }

  const requiredScopesPresent =
    TWITCH_BROADCASTER_SCOPES
      .every(
        scope =>
          token.scopes.includes(scope)
      );

  if (!requiredScopesPresent) {
    return redirectWithError(
      env,
      "Les permissions Twitch nécessaires n’ont pas été accordées.",
      "/createur-panel.html"
    );
  }

  await saveCreatorTwitchAuthorization(
    env,
    {
      creatorId,
      twitchUserId:
        twitchUser.id,

      accessToken:
        token.accessToken,

      refreshToken:
        token.refreshToken,

      scopes:
        token.scopes,

      expiresIn:
        token.expiresIn
    }
  );

  await writeAuditLog(
    env,
    {
      action:
        "creator.twitch_chat.authorized",

      entityType:
        "creator",

      entityId:
        creatorId,

      newValue: {
        twitchUserId:
          twitchUser.id,

        scopes:
          token.scopes
      },

      request
    }
  );

  const destination =
    new URL(
      "/createur-panel.html",
      env.SITE_URL
    );

  destination.searchParams.set(
    "twitchChat",
    "authorized"
  );

  let response =
    redirect(
      destination.toString()
    );

  response =
    withCookie(
      response,
      createExpiredBotOAuthStateCookie()
    );

  response =
    withCookie(
      response,
      createExpiredBotCreatorCookie()
    );

  return response;
}
/* ============================================================
 * CRÉATEURS PUBLICS ET ADMINISTRATION
 * ============================================================
 */

const CREATOR_SLUG_RESERVED_WORDS =
  new Set([
    "admin",
    "api",
    "assets",
    "auth",
    "compte",
    "createur",
    "createurs",
    "don",
    "interactions",
    "live",
    "lives",
    "moderation",
    "objectifs",
    "programme",
    "statistiques"
  ]);

const MAX_CREATOR_DESCRIPTION_LENGTH =
  20000;

const MAX_CREATOR_SOCIAL_LINKS =
  12;

const ALLOWED_SOCIAL_PLATFORMS =
  new Set([
    "youtube",
    "twitter",
    "tiktok",
    "instagram",
    "discord",
    "bluesky",
    "website"
  ]);

function isReservedCreatorSlug(slug) {
  return CREATOR_SLUG_RESERVED_WORDS.has(
    normalizeSlug(slug)
  );
}

function validateCreatorSlug(rawSlug) {
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    return {
      valid: false,
      slug: "",
      error:
        "Le slug est obligatoire."
    };
  }

  if (slug.length < 2) {
    return {
      valid: false,
      slug,
      error:
        "Le slug doit contenir au moins deux caractères."
    };
  }

  if (!isValidSlug(slug)) {
    return {
      valid: false,
      slug,
      error:
        "Le slug ne peut contenir que des lettres, chiffres et tirets."
    };
  }

  if (isReservedCreatorSlug(slug)) {
    return {
      valid: false,
      slug,
      error:
        "Ce slug est réservé par le site."
    };
  }

  return {
    valid: true,
    slug,
    error: null
  };
}

async function getTwitchAppAccessToken(env) {
  /*
   * Le jeton d'application permet les lectures publiques :
   * recherche d'un compte, statut live, catégorie, etc.
   *
   * Cette première version demande un nouveau jeton à Twitch.
   * Le cache Cloudflare évite normalement de le faire à chaque
   * requête. Un Durable Object ou KV pourra être ajouté ensuite.
   */
  const cacheKey =
    new Request(
      "https://internal.jevent/token/twitch-app",
      {
        method: "GET"
      }
    );

  const cache =
    caches.default;

  const cachedResponse =
    await cache.match(cacheKey);

  if (cachedResponse) {
    const cachedData =
      await cachedResponse.json();

    if (cachedData.accessToken) {
      return cachedData.accessToken;
    }
  }

  const tokenResponse =
    await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            client_id:
              env.TWITCH_CLIENT_ID,

            client_secret:
              env.TWITCH_CLIENT_SECRET,

            grant_type:
              "client_credentials"
          })
      }
    );

  let tokenData;

  try {
    tokenData =
      await tokenResponse.json();
  } catch {
    tokenData = null;
  }

  if (
    !tokenResponse.ok ||
    !tokenData?.access_token
  ) {
    console.error(
      "Impossible d’obtenir le jeton Twitch d’application :",
      tokenData
    );

    return null;
  }

  const expiresIn =
    Math.max(
      60,
      Number(
        tokenData.expires_in ?? 3600
      ) - 300
    );

  const responseToCache =
    json({
      accessToken:
        tokenData.access_token
    });

  responseToCache.headers.set(
    "Cache-Control",
    `public, max-age=${expiresIn}`
  );

  await cache.put(
    cacheKey,
    responseToCache
  );

  return tokenData.access_token;
}

async function twitchApiRequest(
  env,
  pathname,
  searchParameters = {}
) {
  const appAccessToken =
    await getTwitchAppAccessToken(env);

  if (!appAccessToken) {
    return {
      ok: false,
      status: 500,
      data: null
    };
  }

  const destination =
    new URL(
      pathname,
      "https://api.twitch.tv"
    );

  for (
    const [key, rawValue]
    of Object.entries(searchParameters)
  ) {
    if (
      rawValue === undefined ||
      rawValue === null ||
      rawValue === ""
    ) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        destination.searchParams.append(
          key,
          String(value)
        );
      }
    } else {
      destination.searchParams.set(
        key,
        String(rawValue)
      );
    }
  }

  const response =
    await fetch(
      destination.toString(),
      {
        headers: {
          Authorization:
            `Bearer ${appAccessToken}`,

          "Client-Id":
            env.TWITCH_CLIENT_ID
        }
      }
    );

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error(
      `Erreur API Twitch ${response.status} :`,
      data
    );
  }

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
  };
}

async function getTwitchUserByLogin(
  env,
  twitchLogin
) {
  const normalizedLogin =
    normalizeTwitchLogin(
      twitchLogin
    );

  if (
    !isValidTwitchLogin(
      normalizedLogin
    )
  ) {
    return null;
  }

  const result =
    await twitchApiRequest(
      env,
      "/helix/users",
      {
        login:
          normalizedLogin
      }
    );

  if (!result.ok) {
    return null;
  }

  return (
    result.data?.data?.[0] ??
    null
  );
}

async function getTwitchUsersByIds(
  env,
  twitchIds
) {
  const uniqueIds =
    [
      ...new Set(
        twitchIds
          .map(value =>
            String(value ?? "").trim()
          )
          .filter(Boolean)
      )
    ].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result =
    await twitchApiRequest(
      env,
      "/helix/users",
      {
        id:
          uniqueIds
      }
    );

  if (!result.ok) {
    return [];
  }

  return result.data?.data ?? [];
}

async function getTwitchStreamsByUserIds(
  env,
  twitchIds
) {
  const uniqueIds =
    [
      ...new Set(
        twitchIds
          .map(value =>
            String(value ?? "").trim()
          )
          .filter(Boolean)
      )
    ].slice(0, 100);

  if (uniqueIds.length === 0) {
    return [];
  }

  const result =
    await twitchApiRequest(
      env,
      "/helix/streams",
      {
        user_id:
          uniqueIds,

        first:
          100
      }
    );

  if (!result.ok) {
    return [];
  }

  return result.data?.data ?? [];
}

function buildTwitchThumbnailUrl(
  template,
  width = 640,
  height = 360
) {
  if (!template) {
    return null;
  }

  return String(template)
    .replace(
      "{width}",
      String(width)
    )
    .replace(
      "{height}",
      String(height)
    );
}

async function refreshCreatorsTwitchState(
  env,
  creators
) {
  const twitchIds =
    creators
      .map(
        creator =>
          creator.twitch_id
      )
      .filter(Boolean);

  if (twitchIds.length === 0) {
    return creators;
  }

  const [
    twitchUsers,
    streams
  ] = await Promise.all([
    getTwitchUsersByIds(
      env,
      twitchIds
    ),

    getTwitchStreamsByUserIds(
      env,
      twitchIds
    )
  ]);

  const twitchUsersById =
    new Map(
      twitchUsers.map(
        user => [
          String(user.id),
          user
        ]
      )
    );

  const streamsByUserId =
    new Map(
      streams.map(
        stream => [
          String(stream.user_id),
          stream
        ]
      )
    );

  const databaseUpdates = [];

  const updatedCreators =
    creators.map(creator => {
      const twitchUser =
        twitchUsersById.get(
          String(creator.twitch_id)
        );

      const stream =
        streamsByUserId.get(
          String(creator.twitch_id)
        );

      const updatedCreator = {
        ...creator,

        twitch_login:
          twitchUser?.login ??
          creator.twitch_login,

        twitch_display_name:
          twitchUser?.display_name ??
          creator.twitch_display_name,

        twitch_profile_image_url:
          twitchUser?.profile_image_url ??
          creator.twitch_profile_image_url,

        is_live:
          stream ? 1 : 0,

        live_title:
          stream?.title ?? null,

        live_game_name:
          stream?.game_name ?? null,

        live_viewer_count:
          stream?.viewer_count ?? 0,

        live_thumbnail_url:
          stream
            ? buildTwitchThumbnailUrl(
                stream.thumbnail_url,
                640,
                360
              )
            : null,

        live_started_at:
          stream?.started_at ?? null
      };

      databaseUpdates.push(
        env.DB.prepare(`
          UPDATE creators
          SET
            twitch_login = ?,
            twitch_display_name = ?,
            twitch_profile_image_url = ?,
            is_live = ?,
            live_title = ?,
            live_game_name = ?,
            live_viewer_count = ?,
            live_thumbnail_url = ?,
            live_started_at = ?,
            twitch_last_checked_at =
              CURRENT_TIMESTAMP,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .bind(
            updatedCreator
              .twitch_login,

            updatedCreator
              .twitch_display_name,

            updatedCreator
              .twitch_profile_image_url,

            updatedCreator.is_live,

            updatedCreator.live_title,

            updatedCreator
              .live_game_name,

            updatedCreator
              .live_viewer_count,

            updatedCreator
              .live_thumbnail_url,

            updatedCreator
              .live_started_at,

            creator.id
          )
      );

      return updatedCreator;
    });

  if (databaseUpdates.length > 0) {
    try {
      await env.DB.batch(
        databaseUpdates
      );
    } catch (error) {
      console.error(
        "Impossible d’actualiser l’état Twitch des créateurs :",
        error
      );
    }
  }

  return updatedCreators;
}

async function getCreatorSocialLinks(
  env,
  creatorId
) {
  const result =
    await env.DB.prepare(`
      SELECT
        id,
        platform,
        label,
        url,
        display_order
      FROM creator_social_links
      WHERE creator_id = ?
        AND visible = 1
      ORDER BY
        display_order ASC,
        id ASC
    `)
      .bind(creatorId)
      .all();

  return (result.results ?? []).map(
    socialLink => ({
      id:
        Number(socialLink.id),

      platform:
        socialLink.platform,

      label:
        socialLink.label,

      url:
        socialLink.url,

      displayOrder:
        Number(
          socialLink.display_order ?? 0
        )
    })
  );
}

async function getCreatorPublicProfile(
  env,
  creator
) {
  const socialLinks =
    await getCreatorSocialLinks(
      env,
      creator.id
    );

  const donationUrl =
    creator.donation_url ||
    buildDonationUrl(
      env.STREAMLABS_TEAM_SLUG,
      env.STREAMLABS_CAMPAIGN_SLUG,
      creator.streamlabs_member_id
    );

  return {
    ...publicCreator({
      ...creator,
      donation_url:
        donationUrl
    }),

    twitchUrl:
      creator.twitch_login
        ? `https://www.twitch.tv/${encodeURIComponent(
            creator.twitch_login
          )}`
        : null,

    socialLinks
  };
}

async function listPublicCreators(
  request,
  env
) {
  const url =
    new URL(request.url);

  const refreshLive =
    normalizeBoolean(
      url.searchParams.get(
        "refreshLive"
      )
    );

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        banner_storage_key,
        public_description_markdown,
        streamlabs_member_id,
        donation_url,
        display_order,
        active,
        archived,
        is_live,
        live_title,
        live_game_name,
        live_viewer_count,
        live_thumbnail_url,
        live_started_at,
        twitch_last_checked_at

      FROM creators

      WHERE active = 1
        AND archived = 0

      ORDER BY
        is_live DESC,
        display_order ASC,
        twitch_display_name ASC
    `)
      .all();

  let creators =
    result.results ?? [];

  const staleThreshold =
    Date.now() -
    60 * 1000;

  const needsRefresh =
    refreshLive ||
    creators.some(creator => {
      if (
        !creator
          .twitch_last_checked_at
      ) {
        return true;
      }

      const checkedAt =
        new Date(
          creator
            .twitch_last_checked_at
        ).getTime();

      return (
        Number.isNaN(checkedAt) ||
        checkedAt < staleThreshold
      );
    });

  if (needsRefresh) {
    creators =
      await refreshCreatorsTwitchState(
        env,
        creators
      );
  }

  /*
   * Après l’actualisation, les chaînes en direct
   * doivent toujours apparaître en premier.
   */
  creators.sort(
    (first, second) => {
      const liveDifference =
        Number(second.is_live) -
        Number(first.is_live);

      if (liveDifference !== 0) {
        return liveDifference;
      }

      const orderDifference =
        Number(
          first.display_order ?? 0
        ) -
        Number(
          second.display_order ?? 0
        );

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return String(
        first.twitch_display_name
      ).localeCompare(
        String(
          second.twitch_display_name
        ),
        "fr"
      );
    }
  );

  const publicCreators =
    await Promise.all(
      creators.map(
        creator =>
          getCreatorPublicProfile(
            env,
            creator
          )
      )
    );

  return json({
    creators:
      publicCreators,

    total:
      publicCreators.length,

    liveCount:
      publicCreators.filter(
        creator => creator.live
      ).length
  });
}

async function getPublicCreatorBySlug(
  request,
  env,
  rawSlug
) {
  const slug =
    normalizeSlug(rawSlug);

  if (!slug) {
    return notFound(
      "Créateur introuvable."
    );
  }

  let creator =
    await findCreatorBySlug(
      env,
      slug
    );

  if (
    !creator ||
    !creator.active ||
    creator.archived
  ) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const checkedAt =
    creator
      .twitch_last_checked_at
      ? new Date(
          creator
            .twitch_last_checked_at
        ).getTime()
      : 0;

  if (
    !checkedAt ||
    checkedAt <
      Date.now() - 60 * 1000
  ) {
    const [refreshedCreator] =
      await refreshCreatorsTwitchState(
        env,
        [creator]
      );

    creator =
      refreshedCreator ??
      creator;
  }

  const profile =
    await getCreatorPublicProfile(
      env,
      creator
    );

  return json({
    creator:
      profile
  });
}

/* ============================================================
 * RECHERCHE TWITCH POUR LE PANEL SUPER ADMIN
 * ============================================================
 */

async function searchTwitchCreator(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url =
    new URL(request.url);

  const twitchLogin =
    normalizeTwitchLogin(
      url.searchParams.get("login")
    );

  if (
    !isValidTwitchLogin(
      twitchLogin
    )
  ) {
    return validationError(
      "Login Twitch invalide.",
      {
        login:
          "Le login Twitch doit contenir entre 4 et 25 caractères."
      }
    );
  }

  const twitchUser =
    await getTwitchUserByLogin(
      env,
      twitchLogin
    );

  if (!twitchUser) {
    return notFound(
      "Aucun compte Twitch correspondant n’a été trouvé."
    );
  }

  const existingCreator =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        active,
        archived
      FROM creators
      WHERE twitch_id = ?
      LIMIT 1
    `)
      .bind(
        twitchUser.id
      )
      .first();

  return json({
    twitchUser: {
      id:
        twitchUser.id,

      login:
        twitchUser.login,

      displayName:
        twitchUser.display_name,

      profileImageUrl:
        twitchUser.profile_image_url,

      description:
        twitchUser.description,

      broadcasterType:
        twitchUser
          .broadcaster_type,

      accountCreatedAt:
        twitchUser.created_at
    },

    suggestedSlug:
      normalizeSlug(
        twitchUser.login
      ),

    alreadyRegistered:
      Boolean(existingCreator),

    existingCreator:
      existingCreator
        ? {
            id:
              Number(
                existingCreator.id
              ),

            slug:
              existingCreator.slug,

            active:
              Boolean(
                existingCreator.active
              ),

            archived:
              Boolean(
                existingCreator.archived
              )
          }
        : null
  });
}

/* ============================================================
 * CRÉATION D’UN CRÉATEUR
 * ============================================================
 */

async function creatorSlugExists(
  env,
  slug,
  exceptCreatorId = null
) {
  let result;

  if (exceptCreatorId === null) {
    result =
      await env.DB.prepare(`
        SELECT 1 AS found
        FROM creators
        WHERE slug = ?
        LIMIT 1
      `)
        .bind(slug)
        .first();
  } else {
    result =
      await env.DB.prepare(`
        SELECT 1 AS found
        FROM creators
        WHERE slug = ?
          AND id <> ?
        LIMIT 1
      `)
        .bind(
          slug,
          exceptCreatorId
        )
        .first();
  }

  return Boolean(result);
}

async function createCreator(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const twitchLogin =
    normalizeTwitchLogin(
      body.twitchLogin
    );

  if (
    !isValidTwitchLogin(
      twitchLogin
    )
  ) {
    return validationError(
      "Login Twitch invalide.",
      {
        twitchLogin:
          "Saisis un login Twitch valide."
      }
    );
  }

  const twitchUser =
    await getTwitchUserByLogin(
      env,
      twitchLogin
    );

  if (!twitchUser) {
    return notFound(
      "Compte Twitch introuvable."
    );
  }

  const existingCreator =
    await env.DB.prepare(`
      SELECT id, slug, archived
      FROM creators
      WHERE twitch_id = ?
      LIMIT 1
    `)
      .bind(
        twitchUser.id
      )
      .first();

  if (existingCreator) {
    return json(
      {
        error:
          "Ce compte Twitch est déjà enregistré comme créateur.",

        creator: {
          id:
            Number(
              existingCreator.id
            ),

          slug:
            existingCreator.slug,

          archived:
            Boolean(
              existingCreator.archived
            )
        }
      },
      409
    );
  }

  const slugValidation =
    validateCreatorSlug(
      body.slug ||
      twitchUser.login
    );

  if (!slugValidation.valid) {
    return validationError(
      "Slug invalide.",
      {
        slug:
          slugValidation.error
      }
    );
  }

  const slugExists =
    await creatorSlugExists(
      env,
      slugValidation.slug
    );

  if (slugExists) {
    return validationError(
      "Ce slug est déjà utilisé.",
      {
        slug:
          "Choisis un autre slug."
      }
    );
  }

  const streamlabsMemberId =
    sanitizePlainText(
      body.streamlabsMemberId,
      100
    );

  const donationUrl =
    streamlabsMemberId
      ? buildDonationUrl(
          env.STREAMLABS_TEAM_SLUG,
          env.STREAMLABS_CAMPAIGN_SLUG,
          streamlabsMemberId
        )
      : null;

  const displayOrder =
    normalizeInteger(
      body.displayOrder,
      {
        minimum: 0,
        maximum: 1000,
        fallback: 100
      }
    );

  const active =
    body.active === undefined
      ? true
      : normalizeBoolean(
          body.active
        );

  const moderationBypass =
    normalizeBoolean(
      body.descriptionModerationBypass
    );

  const publicId =
    createPublicIdentifier("creator");

  const result =
    await env.DB.prepare(`
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
        description_moderation_bypass,
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
        ?,
        0,
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        publicId,
        slugValidation.slug,
        twitchUser.id,
        twitchUser.login,
        twitchUser.display_name,
        twitchUser
          .profile_image_url ||
          null,

        streamlabsMemberId ||
        null,

        donationUrl,

        displayOrder,

        active ? 1 : 0,

        moderationBypass
          ? 1
          : 0,

        authorization.user.id
      )
      .run();

  const creatorId =
    Number(
      result.meta?.last_row_id
    );

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.created",

      entityType:
        "creator",

      entityId:
        creatorId,

      newValue: {
        publicId,
        slug:
          slugValidation.slug,

        twitchId:
          twitchUser.id,

        twitchLogin:
          twitchUser.login,

        streamlabsMemberId:
          streamlabsMemberId ||
          null,

        donationUrl,

        displayOrder,

        active,

        descriptionModerationBypass:
          moderationBypass
      },

      request
    }
  );

  return json(
    {
      success: true,

      creator: {
        id:
          creatorId,

        publicId,

        slug:
          slugValidation.slug,

        twitchId:
          twitchUser.id,

        twitchLogin:
          twitchUser.login,

        twitchDisplayName:
          twitchUser.display_name,

        twitchProfileImageUrl:
          twitchUser
            .profile_image_url,

        streamlabsMemberId:
          streamlabsMemberId ||
          null,

        donationUrl,

        active,

        claimed:
          false
      }
    },
    201
  );
}

/* ============================================================
 * CONSULTATION ADMINISTRATIVE DES CRÉATEURS
 * ============================================================
 */

async function listAdminCreators(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        creators.*,

        users.twitch_login
          AS claimed_user_login,

        users.twitch_display_name
          AS claimed_user_display_name

      FROM creators

      LEFT JOIN users
        ON users.id =
          creators.claimed_by_user_id

      ORDER BY
        creators.archived ASC,
        creators.display_order ASC,
        creators.twitch_display_name ASC
    `)
      .all();

  return json({
    creators:
      (result.results ?? []).map(
        creator => ({
          ...publicCreator(creator),

          publicId:
            creator.public_id,

          claimed:
            Boolean(
              creator
                .claimed_by_user_id
            ),

          claimedAt:
            creator.claimed_at,

          claimedUser:
            creator
              .claimed_by_user_id
              ? {
                  login:
                    creator
                      .claimed_user_login,

                  displayName:
                    creator
                      .claimed_user_display_name
                }
              : null,

          descriptionModerationBypass:
            Boolean(
              creator
                .description_moderation_bypass
            ),

          onboardingCompleted:
            Boolean(
              creator
                .onboarding_completed_at
            ),

          twitchLastCheckedAt:
            creator
              .twitch_last_checked_at,

          createdAt:
            creator.created_at,

          updatedAt:
            creator.updated_at
        })
      )
  });
}

/* ============================================================
 * MODIFICATION D’UN CRÉATEUR
 * ============================================================
 */

async function updateCreator(
  request,
  env,
  creatorId
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  let slug =
    creator.slug;

  if (body.slug !== undefined) {
    const slugValidation =
      validateCreatorSlug(
        body.slug
      );

    if (!slugValidation.valid) {
      return validationError(
        "Slug invalide.",
        {
          slug:
            slugValidation.error
        }
      );
    }

    const slugExists =
      await creatorSlugExists(
        env,
        slugValidation.slug,
        creator.id
      );

    if (slugExists) {
      return validationError(
        "Ce slug est déjà utilisé.",
        {
          slug:
            "Choisis un autre slug."
        }
      );
    }

    slug =
      slugValidation.slug;
  }

  const streamlabsMemberId =
    body.streamlabsMemberId ===
      undefined
      ? creator
          .streamlabs_member_id

      : sanitizePlainText(
          body.streamlabsMemberId,
          100
        ) || null;

  const donationUrl =
    streamlabsMemberId
      ? buildDonationUrl(
          env.STREAMLABS_TEAM_SLUG,
          env.STREAMLABS_CAMPAIGN_SLUG,
          streamlabsMemberId
        )
      : null;

  const displayOrder =
    body.displayOrder === undefined
      ? Number(
          creator.display_order ?? 100
        )

      : normalizeInteger(
          body.displayOrder,
          {
            minimum: 0,
            maximum: 1000,
            fallback:
              Number(
                creator
                  .display_order ??
                100
              )
          }
        );

  const active =
    body.active === undefined
      ? Boolean(
          creator.active
        )

      : normalizeBoolean(
          body.active
        );

  const moderationBypass =
    body.descriptionModerationBypass ===
      undefined
      ? Boolean(
          creator
            .description_moderation_bypass
        )

      : normalizeBoolean(
          body
            .descriptionModerationBypass
        );

  await env.DB.prepare(`
    UPDATE creators
    SET
      slug = ?,
      streamlabs_member_id = ?,
      donation_url = ?,
      display_order = ?,
      active = ?,
      description_moderation_bypass = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      slug,
      streamlabsMemberId,
      donationUrl,
      displayOrder,
      active ? 1 : 0,
      moderationBypass ? 1 : 0,
      creator.id
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.updated",

      entityType:
        "creator",

      entityId:
        creator.id,

      oldValue: {
        slug:
          creator.slug,

        streamlabsMemberId:
          creator
            .streamlabs_member_id,

        donationUrl:
          creator.donation_url,

        displayOrder:
          Number(
            creator
              .display_order ??
            100
          ),

        active:
          Boolean(
            creator.active
          ),

        descriptionModerationBypass:
          Boolean(
            creator
              .description_moderation_bypass
          )
      },

      newValue: {
        slug,
        streamlabsMemberId,
        donationUrl,
        displayOrder,
        active,
        descriptionModerationBypass:
          moderationBypass
      },

      request
    }
  );

  return json({
    success: true,

    creator: {
      id:
        Number(creator.id),

      slug,

      streamlabsMemberId,

      donationUrl,

      displayOrder,

      active,

      descriptionModerationBypass:
        moderationBypass
    }
  });
}

/* ============================================================
 * ARCHIVAGE ET RESTAURATION
 * ============================================================
 */

async function archiveCreator(
  request,
  env,
  creatorId
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  if (creator.archived) {
    return json({
      success: true,
      alreadyArchived: true
    });
  }

  await env.DB.prepare(`
    UPDATE creators
    SET
      active = 0,
      archived = 1,
      archived_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(creator.id)
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.archived",

      entityType:
        "creator",

      entityId:
        creator.id,

      oldValue: {
        active:
          Boolean(
            creator.active
          ),

        archived:
          Boolean(
            creator.archived
          )
      },

      newValue: {
        active: false,
        archived: true
      },

      request
    }
  );

  return json({
    success: true
  });
}

async function restoreCreator(
  request,
  env,
  creatorId
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  await env.DB.prepare(`
    UPDATE creators
    SET
      active = 1,
      archived = 0,
      archived_at = NULL,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(creator.id)
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.restored",

      entityType:
        "creator",

      entityId:
        creator.id,

      newValue: {
        active: true,
        archived: false
      },

      request
    }
  );

  return json({
    success: true
  });
}

/* ============================================================
 * ORDRE D’AFFICHAGE
 * ============================================================
 */

async function reorderCreators(
  request,
  env
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const body =
    await readJson(request);

  if (
    !body ||
    !Array.isArray(body.creatorIds)
  ) {
    return validationError(
      "La liste des créateurs est invalide."
    );
  }

  const creatorIds =
    [
      ...new Set(
        body.creatorIds
          .map(value =>
            normalizeInteger(
              value,
              {
                minimum: 1,
                fallback: 0
              }
            )
          )
          .filter(Boolean)
      )
    ];

  if (creatorIds.length === 0) {
    return validationError(
      "Aucun créateur à réordonner."
    );
  }

  const statements =
    creatorIds.map(
      (creatorId, index) =>
        env.DB.prepare(`
          UPDATE creators
          SET
            display_order = ?,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .bind(
            (index + 1) * 10,
            creatorId
          )
    );

  await env.DB.batch(statements);

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.reordered",

      entityType:
        "creator_collection",

      newValue: {
        creatorIds
      },

      request
    }
  );

  return json({
    success: true,
    creatorIds
  });
}

/* ============================================================
 * REDIRECTION DYNAMIQUE VERS LES CAGNOTTES
 * ============================================================
 */

async function redirectToCreatorDonation(
  request,
  env,
  rawSlug
) {
  const slug =
    normalizeSlug(rawSlug);

  if (!slug) {
    return redirectWithError(
      env,
      "Créateur introuvable."
    );
  }

  const creator =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_display_name,
        streamlabs_member_id,
        donation_url,
        active,
        archived
      FROM creators
      WHERE slug = ?
      LIMIT 1
    `)
      .bind(slug)
      .first();

  if (
    !creator ||
    !creator.active ||
    creator.archived
  ) {
    return redirectWithError(
      env,
      "Cette cagnotte n’est pas disponible."
    );
  }

  const donationUrl =
    creator.donation_url ||
    buildDonationUrl(
      env.STREAMLABS_TEAM_SLUG,
      env.STREAMLABS_CAMPAIGN_SLUG,
      creator.streamlabs_member_id
    );

  if (!donationUrl) {
    return redirectWithError(
      env,
      "Le lien de cagnotte de ce créateur n’est pas encore configuré."
    );
  }

  /*
   * Les redirections de dons pourront être comptées
   * pour des statistiques sans stocker l’adresse IP.
   */
  try {
    await env.DB.prepare(`
      INSERT INTO donation_link_clicks (
        creator_id,
        referrer,
        user_agent,
        clicked_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
      .bind(
        creator.id,

        sanitizePlainText(
          request.headers.get(
            "Referer"
          ),
          1000
        ) || null,

        getRequestUserAgent(
          request
        )
      )
      .run();
  } catch (error) {
    console.error(
      "Impossible de compter le clic vers la cagnotte :",
      error
    );
  }

  return redirect(
    donationUrl,
    302
  );
}
/* ============================================================
 * DESCRIPTIONS MARKDOWN DES CRÉATEURS
 * ============================================================
 */

const CREATOR_DESCRIPTION_STATUSES =
  new Set([
    "draft",
    "pending",
    "approved",
    "rejected",
    "superseded"
  ]);

const MARKDOWN_LINK_PATTERN =
  /!?

$$
[^
$$

]*]\s*$[^)]*$|!?

$$
[^
$$

]*]\s*

$$
[^
$$

]*]|^\s*

$$
[^
$$

]+]:\s*\S+/gim;

const MARKDOWN_AUTOLINK_PATTERN =
  /<\s*(?:https?:\/\/|mailto:)[^>]+>/gi;

const MARKDOWN_RAW_HTML_PATTERN =
  /<\/?[a-z][^>]*>/gi;

const MARKDOWN_DANGEROUS_PROTOCOL_PATTERN =
  /\b(?:javascript|vbscript|data):/gi;

const MARKDOWN_IFRAME_PATTERN =
  /<\s*\/?\s*iframe\b[^>]*>/gi;

const MARKDOWN_SCRIPT_PATTERN =
  /<\s*\/?\s*script\b[^>]*>/gi;

const MARKDOWN_EVENT_HANDLER_PATTERN =
  /\bon[a-z]+\s*=/gi;

function validateCreatorMarkdown(
  rawMarkdown
) {
  const markdown =
    String(rawMarkdown ?? "")
      .replace(/\u0000/g, "")
      .trim();

  const errors = [];

  if (!markdown) {
    errors.push({
      code: "required",
      message:
        "La description ne peut pas être vide."
    });
  }

  if (
    markdown.length >
    MAX_CREATOR_DESCRIPTION_LENGTH
  ) {
    errors.push({
      code: "too_long",
      message:
        `La description ne peut pas dépasser ` +
        `${MAX_CREATOR_DESCRIPTION_LENGTH} caractères.`
    });
  }

  if (
    MARKDOWN_LINK_PATTERN.test(markdown) ||
    MARKDOWN_AUTOLINK_PATTERN.test(markdown)
  ) {
    errors.push({
      code: "links_forbidden",
      message:
        "Les liens Markdown ne sont pas autorisés pour le moment."
    });
  }

  if (
    MARKDOWN_IFRAME_PATTERN.test(
      markdown
    )
  ) {
    errors.push({
      code: "iframe_forbidden",
      message:
        "Les iframes sont interdites."
    });
  }

  if (
    MARKDOWN_SCRIPT_PATTERN.test(
      markdown
    ) ||
    MARKDOWN_EVENT_HANDLER_PATTERN.test(
      markdown
    ) ||
    MARKDOWN_DANGEROUS_PROTOCOL_PATTERN.test(
      markdown
    )
  ) {
    errors.push({
      code: "script_forbidden",
      message:
        "Le JavaScript et les contenus exécutables sont interdits."
    });
  }

  if (
    MARKDOWN_RAW_HTML_PATTERN.test(
      markdown
    )
  ) {
    errors.push({
      code: "html_forbidden",
      message:
        "Le HTML brut est interdit."
    });
  }

  /*
   * Les expressions régulières possèdent le drapeau global.
   * Il faut réinitialiser lastIndex après les tests.
   */
  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  MARKDOWN_AUTOLINK_PATTERN.lastIndex = 0;
  MARKDOWN_RAW_HTML_PATTERN.lastIndex = 0;
  MARKDOWN_DANGEROUS_PROTOCOL_PATTERN.lastIndex = 0;
  MARKDOWN_IFRAME_PATTERN.lastIndex = 0;
  MARKDOWN_SCRIPT_PATTERN.lastIndex = 0;
  MARKDOWN_EVENT_HANDLER_PATTERN.lastIndex = 0;

  return {
    valid:
      errors.length === 0,

    markdown:
      markdown.slice(
        0,
        MAX_CREATOR_DESCRIPTION_LENGTH
      ),

    errors
  };
}

function stripForbiddenMarkdownContent(
  rawMarkdown
) {
  /*
   * Cette fonction n’est pas utilisée pour accepter
   * silencieusement un contenu invalide. Elle sert à fournir
   * un aperçu nettoyé au modérateur lorsqu’il corrige une
   * proposition.
   */
  let markdown =
    String(rawMarkdown ?? "")
      .replace(/\u0000/g, "");

  markdown =
    markdown.replace(
      MARKDOWN_IFRAME_PATTERN,
      ""
    );

  markdown =
    markdown.replace(
      MARKDOWN_SCRIPT_PATTERN,
      ""
    );

  markdown =
    markdown.replace(
      MARKDOWN_RAW_HTML_PATTERN,
      ""
    );

  markdown =
    markdown.replace(
      MARKDOWN_AUTOLINK_PATTERN,
      ""
    );

  markdown =
    markdown.replace(
      MARKDOWN_DANGEROUS_PROTOCOL_PATTERN,
      ""
    );

  markdown =
    markdown.replace(
      MARKDOWN_EVENT_HANDLER_PATTERN,
      ""
    );

  /*
   * Les images et liens Markdown sont remplacés par leur
   * texte visible, sans destination cliquable.
   */
  markdown =
    markdown.replace(
      /!

$$
([^
$$

]*)]\s*$[^)]*$/g,
      "$1"
    );

  markdown =
    markdown.replace(
      /

$$
([^
$$

]+)]\s*$[^)]*$/g,
      "$1"
    );

  markdown =
    markdown.replace(
      /!

$$
([^
$$

]*)]\s*

$$
[^
$$

]*]/g,
      "$1"
    );

  markdown =
    markdown.replace(
      /

$$
([^
$$

]+)]\s*

$$
[^
$$

]*]/g,
      "$1"
    );

  markdown =
    markdown.replace(
      /^\s*

$$
[^
$$

]+]:\s*\S+.*$/gim,
      ""
    );

  return markdown
    .slice(
      0,
      MAX_CREATOR_DESCRIPTION_LENGTH
    )
    .trim();
}

function mapCreatorDescriptionRevision(
  revision
) {
  if (!revision) {
    return null;
  }

  return {
    id:
      Number(revision.id),

    publicId:
      revision.public_id,

    creatorId:
      Number(revision.creator_id),

    revisionNumber:
      Number(
        revision.revision_number
      ),

    status:
      revision.status,

    markdown:
      revision.markdown_content ?? "",

    submittedByUserId:
      revision.submitted_by_user_id
        ? Number(
            revision.submitted_by_user_id
          )
        : null,

    submittedBy:
      revision
        .submitted_by_display_name
        ? {
            displayName:
              revision
                .submitted_by_display_name,

            twitchLogin:
              revision
                .submitted_by_twitch_login,

            profileImageUrl:
              revision
                .submitted_by_profile_image_url
          }
        : null,

    reviewedByUserId:
      revision.reviewed_by_user_id
        ? Number(
            revision.reviewed_by_user_id
          )
        : null,

    reviewedBy:
      revision
        .reviewed_by_display_name
        ? {
            displayName:
              revision
                .reviewed_by_display_name,

            twitchLogin:
              revision
                .reviewed_by_twitch_login
          }
        : null,

    moderationNote:
      revision.moderation_note,

    createdAt:
      revision.created_at,

    submittedAt:
      revision.submitted_at,

    reviewedAt:
      revision.reviewed_at,

    publishedAt:
      revision.published_at
  };
}

async function getNextDescriptionRevisionNumber(
  env,
  creatorId
) {
  const result =
    await env.DB.prepare(`
      SELECT
        COALESCE(
          MAX(revision_number),
          0
        ) AS maximum_revision
      FROM creator_description_revisions
      WHERE creator_id = ?
    `)
      .bind(creatorId)
      .first();

  return (
    Number(
      result?.maximum_revision ?? 0
    ) + 1
  );
}

async function findDescriptionRevisionByPublicId(
  env,
  publicId
) {
  return env.DB.prepare(`
    SELECT
      revisions.*,

      submitter.twitch_login
        AS submitted_by_twitch_login,

      submitter.twitch_display_name
        AS submitted_by_display_name,

      submitter.twitch_profile_image_url
        AS submitted_by_profile_image_url,

      reviewer.twitch_login
        AS reviewed_by_twitch_login,

      reviewer.twitch_display_name
        AS reviewed_by_display_name

    FROM creator_description_revisions
      AS revisions

    LEFT JOIN users AS submitter
      ON submitter.id =
        revisions.submitted_by_user_id

    LEFT JOIN users AS reviewer
      ON reviewer.id =
        revisions.reviewed_by_user_id

    WHERE revisions.public_id = ?
    LIMIT 1
  `)
    .bind(publicId)
    .first();
}

async function getLatestDescriptionRevision(
  env,
  creatorId,
  statuses = []
) {
  let result;

  if (statuses.length === 0) {
    result =
      await env.DB.prepare(`
        SELECT *
        FROM creator_description_revisions
        WHERE creator_id = ?
        ORDER BY revision_number DESC
        LIMIT 1
      `)
        .bind(creatorId)
        .first();
  } else {
    const validStatuses =
      statuses.filter(
        status =>
          CREATOR_DESCRIPTION_STATUSES.has(
            status
          )
      );

    if (validStatuses.length === 0) {
      return null;
    }

    const placeholders =
      validStatuses
        .map(() => "?")
        .join(", ");

    result =
      await env.DB.prepare(`
        SELECT *
        FROM creator_description_revisions
        WHERE creator_id = ?
          AND status IN (${placeholders})
        ORDER BY revision_number DESC
        LIMIT 1
      `)
        .bind(
          creatorId,
          ...validStatuses
        )
        .first();
  }

  return result ?? null;
}

async function getCreatorDescriptionWorkspace(
  request,
  env,
  creatorId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const [
    draft,
    pending,
    latestRejected
  ] = await Promise.all([
    getLatestDescriptionRevision(
      env,
      creatorId,
      ["draft"]
    ),

    getLatestDescriptionRevision(
      env,
      creatorId,
      ["pending"]
    ),

    getLatestDescriptionRevision(
      env,
      creatorId,
      ["rejected"]
    )
  ]);

  /*
   * Le créateur ne reçoit pas l’historique complet.
   * Il voit uniquement la version publique, son brouillon,
   * la proposition en attente et le dernier refus.
   */
  return json({
    creator: {
      id:
        Number(creator.id),

      slug:
        creator.slug,

      twitchDisplayName:
        creator.twitch_display_name,

      twitchLogin:
        creator.twitch_login,

      publicDescriptionMarkdown:
        creator
          .public_description_markdown ??
        "",

      publicDescriptionUpdatedAt:
        creator
          .public_description_updated_at,

      descriptionModerationBypass:
        Boolean(
          creator
            .description_moderation_bypass
        )
    },

    draft:
      mapCreatorDescriptionRevision(
        draft
      ),

    pending:
      mapCreatorDescriptionRevision(
        pending
      ),

    lastRejected:
      mapCreatorDescriptionRevision(
        latestRejected
      )
  });
}

/* ============================================================
 * CRÉATION ET MODIFICATION D’UN BROUILLON
 * ============================================================
 */

async function saveCreatorDescriptionDraft(
  request,
  env,
  creatorId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const validation =
    validateCreatorMarkdown(
      body.markdown
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "La description Markdown est invalide.",

        validationErrors:
          validation.errors,

        cleanedPreview:
          stripForbiddenMarkdownContent(
            body.markdown
          )
      },
      400
    );
  }

  const existingDraft =
    await getLatestDescriptionRevision(
      env,
      creatorId,
      ["draft"]
    );

  let revision;

  if (
    existingDraft &&
    Number(
      existingDraft
        .submitted_by_user_id
    ) ===
      Number(access.user.id)
  ) {
    await env.DB.prepare(`
      UPDATE creator_description_revisions
      SET
        markdown_content = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'draft'
    `)
      .bind(
        validation.markdown,
        existingDraft.id
      )
      .run();

    revision =
      await findDescriptionRevisionByPublicId(
        env,
        existingDraft.public_id
      );
  } else {
    /*
     * Un seul brouillon actif est conservé par créateur.
     * Un ancien brouillon d’un autre délégataire est marqué
     * comme remplacé avant de créer le nouveau.
     */
    if (existingDraft) {
      await env.DB.prepare(`
        UPDATE creator_description_revisions
        SET
          status = 'superseded',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'draft'
      `)
        .bind(
          existingDraft.id
        )
        .run();
    }

    const revisionNumber =
      await getNextDescriptionRevisionNumber(
        env,
        creatorId
      );

    const publicId =
      createPublicIdentifier(
        "cdr"
      );

    await env.DB.prepare(`
      INSERT INTO creator_description_revisions (
        public_id,
        creator_id,
        revision_number,
        status,
        markdown_content,
        submitted_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        ?,
        ?,
        'draft',
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        publicId,
        creatorId,
        revisionNumber,
        validation.markdown,
        access.user.id
      )
      .run();

    revision =
      await findDescriptionRevisionByPublicId(
        env,
        publicId
      );
  }

  await writeAuditLog(
    env,
    {
      actorUserId:
        access.user.id,

      action:
        "creator.description.draft_saved",

      entityType:
        "creator_description_revision",

      entityId:
        revision?.id,

      newValue: {
        creatorId,
        revisionNumber:
          revision?.revision_number,

        status: "draft"
      },

      request
    }
  );

  return json({
    success: true,

    draft:
      mapCreatorDescriptionRevision(
        revision
      )
  });
}

/* ============================================================
 * SOUMISSION DE LA DESCRIPTION
 * ============================================================
 */

async function submitCreatorDescription(
  request,
  env,
  creatorId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const body =
    await readJson(request);

  const draftPublicId =
    sanitizePlainText(
      body?.draftPublicId,
      100
    );

  let draft;

  if (draftPublicId) {
    draft =
      await findDescriptionRevisionByPublicId(
        env,
        draftPublicId
      );
  } else {
    draft =
      await getLatestDescriptionRevision(
        env,
        creatorId,
        ["draft"]
      );
  }

  if (
    !draft ||
    Number(draft.creator_id) !==
      Number(creatorId) ||
    draft.status !== "draft"
  ) {
    return notFound(
      "Brouillon introuvable."
    );
  }

  const validation =
    validateCreatorMarkdown(
      draft.markdown_content
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "Le brouillon contient du Markdown interdit.",

        validationErrors:
          validation.errors
      },
      400
    );
  }

  const existingPending =
    await getLatestDescriptionRevision(
      env,
      creatorId,
      ["pending"]
    );

  if (existingPending) {
    return json(
      {
        error:
          "Une description est déjà en attente de validation.",

        pending:
          mapCreatorDescriptionRevision(
            existingPending
          )
      },
      409
    );
  }

  const moderationBypass =
    Boolean(
      creator
        .description_moderation_bypass
    );

  if (moderationBypass) {
    /*
     * Avec bypass, la description est publiée immédiatement,
     * mais la révision et le journal d’audit sont conservés.
     */
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE creator_description_revisions
        SET
          status = 'approved',
          submitted_at =
            CURRENT_TIMESTAMP,
          reviewed_at =
            CURRENT_TIMESTAMP,
          published_at =
            CURRENT_TIMESTAMP,
          reviewed_by_user_id =
            NULL,
          moderation_note =
            'Publication automatique : bypass actif',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'draft'
      `)
        .bind(draft.id),

      env.DB.prepare(`
        UPDATE creators
        SET
          public_description_markdown = ?,
          public_description_revision_id = ?,
          public_description_updated_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(
          validation.markdown,
          draft.id,
          creatorId
        )
    ]);

    await writeAuditLog(
      env,
      {
        actorUserId:
          access.user.id,

        action:
          "creator.description.auto_approved",

        entityType:
          "creator_description_revision",

        entityId:
          draft.id,

        oldValue: {
          publicMarkdown:
            creator
              .public_description_markdown ??
            ""
        },

        newValue: {
          creatorId,
          revisionNumber:
            draft.revision_number,

          markdown:
            validation.markdown,

          bypass: true
        },

        request
      }
    );

    const publishedRevision =
      await findDescriptionRevisionByPublicId(
        env,
        draft.public_id
      );

    return json({
      success: true,
      status: "approved",
      automaticallyApproved: true,

      revision:
        mapCreatorDescriptionRevision(
          publishedRevision
        )
    });
  }

  await env.DB.prepare(`
    UPDATE creator_description_revisions
    SET
      status = 'pending',
      submitted_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'draft'
  `)
    .bind(draft.id)
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        access.user.id,

      action:
        "creator.description.submitted",

      entityType:
        "creator_description_revision",

      entityId:
        draft.id,

      newValue: {
        creatorId,
        revisionNumber:
          draft.revision_number,

        status: "pending"
      },

      request
    }
  );

  const submittedRevision =
    await findDescriptionRevisionByPublicId(
      env,
      draft.public_id
    );

  return json({
    success: true,
    status: "pending",
    automaticallyApproved: false,

    revision:
      mapCreatorDescriptionRevision(
        submittedRevision
      )
  });
}

/* ============================================================
 * ANNULATION D’UNE SOUMISSION
 * ============================================================
 */

async function cancelPendingCreatorDescription(
  request,
  env,
  creatorId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const pending =
    await getLatestDescriptionRevision(
      env,
      creatorId,
      ["pending"]
    );

  if (!pending) {
    return notFound(
      "Aucune description en attente."
    );
  }

  /*
   * La soumission revient à l’état de brouillon.
   */
  await env.DB.prepare(`
    UPDATE creator_description_revisions
    SET
      status = 'draft',
      submitted_at = NULL,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(pending.id)
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        access.user.id,

      action:
        "creator.description.submission_cancelled",

      entityType:
        "creator_description_revision",

      entityId:
        pending.id,

      oldValue: {
        status: "pending"
      },

      newValue: {
        status: "draft"
      },

      request
    }
  );

  return json({
    success: true,
    status: "draft"
  });
}

/* ============================================================
 * FILE DE MODÉRATION DES DESCRIPTIONS
 * ============================================================
 */

async function listPendingCreatorDescriptions(
  request,
  env
) {
  /*
   * Seuls les modérateurs JEvent et super administrateurs
   * peuvent approuver les descriptions.
   *
   * Un creator_moderator n’a pas accès à cette file.
   */
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const url =
    new URL(request.url);

  const {
    page,
    pageSize,
    offset
  } = createPagination(url);

  const creatorId =
    normalizeInteger(
      url.searchParams.get(
        "creatorId"
      ),
      {
        minimum: 1,
        fallback: 0
      }
    );

  let result;
  let countResult;

  const selection = `
    SELECT
      revisions.*,

      creators.slug
        AS creator_slug,

      creators.twitch_login
        AS creator_twitch_login,

      creators.twitch_display_name
        AS creator_display_name,

      creators.twitch_profile_image_url
        AS creator_profile_image_url,

      creators.public_description_markdown
        AS current_public_markdown,

      submitter.twitch_login
        AS submitted_by_twitch_login,

      submitter.twitch_display_name
        AS submitted_by_display_name,

      submitter.twitch_profile_image_url
        AS submitted_by_profile_image_url

    FROM creator_description_revisions
      AS revisions

    INNER JOIN creators
      ON creators.id =
        revisions.creator_id

    LEFT JOIN users AS submitter
      ON submitter.id =
        revisions.submitted_by_user_id
  `;

  if (creatorId) {
    result =
      await env.DB.prepare(`
        ${selection}

        WHERE revisions.status = 'pending'
          AND revisions.creator_id = ?

        ORDER BY
          revisions.submitted_at ASC

        LIMIT ?
        OFFSET ?
      `)
        .bind(
          creatorId,
          pageSize,
          offset
        )
        .all();

    countResult =
      await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM creator_description_revisions
        WHERE status = 'pending'
          AND creator_id = ?
      `)
        .bind(creatorId)
        .first();
  } else {
    result =
      await env.DB.prepare(`
        ${selection}

        WHERE revisions.status = 'pending'

        ORDER BY
          revisions.submitted_at ASC

        LIMIT ?
        OFFSET ?
      `)
        .bind(
          pageSize,
          offset
        )
        .all();

    countResult =
      await env.DB.prepare(`
        SELECT COUNT(*) AS total
        FROM creator_description_revisions
        WHERE status = 'pending'
      `)
        .first();
  }

  const items =
    (result.results ?? []).map(
      revision => ({
        revision:
          mapCreatorDescriptionRevision(
            revision
          ),

        creator: {
          id:
            Number(
              revision.creator_id
            ),

          slug:
            revision.creator_slug,

          twitchLogin:
            revision
              .creator_twitch_login,

          twitchDisplayName:
            revision
              .creator_display_name,

          twitchProfileImageUrl:
            revision
              .creator_profile_image_url,

          currentPublicMarkdown:
            revision
              .current_public_markdown ??
            ""
        },

        cleanedPreview:
          stripForbiddenMarkdownContent(
            revision
              .markdown_content
          )
      })
    );

  return json(
    paginationResponse(
      items,
      {
        page,
        pageSize,

        total:
          countResult?.total ??
          0
      }
    )
  );
}

/* ============================================================
 * CORRECTION PAR UN MODÉRATEUR
 * ============================================================
 */

async function editPendingCreatorDescription(
  request,
  env,
  publicId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const revision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  if (!revision) {
    return notFound(
      "Révision introuvable."
    );
  }

  if (revision.status !== "pending") {
    return json(
      {
        error:
          "Seule une description en attente peut être corrigée."
      },
      409
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const validation =
    validateCreatorMarkdown(
      body.markdown
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "Le Markdown corrigé est invalide.",

        validationErrors:
          validation.errors,

        cleanedPreview:
          stripForbiddenMarkdownContent(
            body.markdown
          )
      },
      400
    );
  }

  const oldMarkdown =
    revision.markdown_content;

  await env.DB.prepare(`
    UPDATE creator_description_revisions
    SET
      markdown_content = ?,
      corrected_by_user_id = ?,
      corrected_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(
      validation.markdown,
      authorization.user.id,
      revision.id
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.description.corrected",

      entityType:
        "creator_description_revision",

      entityId:
        revision.id,

      oldValue: {
        markdown:
          oldMarkdown
      },

      newValue: {
        markdown:
          validation.markdown
      },

      request
    }
  );

  const updatedRevision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  return json({
    success: true,

    revision:
      mapCreatorDescriptionRevision(
        updatedRevision
      )
  });
}

/* ============================================================
 * APPROBATION D’UNE DESCRIPTION
 * ============================================================
 */

async function approveCreatorDescription(
  request,
  env,
  publicId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const revision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  if (!revision) {
    return notFound(
      "Révision introuvable."
    );
  }

  if (revision.status !== "pending") {
    return json(
      {
        error:
          "Cette description n’est plus en attente."
      },
      409
    );
  }

  const validation =
    validateCreatorMarkdown(
      revision.markdown_content
    );

  if (!validation.valid) {
    return json(
      {
        error:
          "La description contient du contenu interdit.",

        validationErrors:
          validation.errors
      },
      400
    );
  }

  const body =
    (await readJson(request)) ??
    {};

  const moderationNote =
    sanitizePlainText(
      body.moderationNote,
      1000
    );

  const creator =
    await findCreatorById(
      env,
      revision.creator_id
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  /*
   * L’ancienne révision approuvée reste dans l’historique,
   * mais seule la nouvelle devient la version publique.
   */
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE creator_description_revisions
      SET
        status = 'approved',
        reviewed_by_user_id = ?,
        reviewed_at =
          CURRENT_TIMESTAMP,
        published_at =
          CURRENT_TIMESTAMP,
        moderation_note = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'pending'
    `)
      .bind(
        authorization.user.id,
        moderationNote || null,
        revision.id
      ),

    env.DB.prepare(`
      UPDATE creators
      SET
        public_description_markdown = ?,
        public_description_revision_id = ?,
        public_description_updated_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        validation.markdown,
        revision.id,
        revision.creator_id
      )
  ]);

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.description.approved",

      entityType:
        "creator_description_revision",

      entityId:
        revision.id,

      oldValue: {
        publicMarkdown:
          creator
            .public_description_markdown ??
          ""
      },

      newValue: {
        creatorId:
          Number(
            revision.creator_id
          ),

        revisionNumber:
          Number(
            revision.revision_number
          ),

        markdown:
          validation.markdown,

        moderationNote:
          moderationNote || null
      },

      request
    }
  );

  const approvedRevision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  return json({
    success: true,
    status: "approved",

    revision:
      mapCreatorDescriptionRevision(
        approvedRevision
      )
  });
}

/* ============================================================
 * REFUS D’UNE DESCRIPTION
 * ============================================================
 */

async function rejectCreatorDescription(
  request,
  env,
  publicId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const revision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  if (!revision) {
    return notFound(
      "Révision introuvable."
    );
  }

  if (revision.status !== "pending") {
    return json(
      {
        error:
          "Cette description n’est plus en attente."
      },
      409
    );
  }

  const body =
    await readJson(request);

  const moderationNote =
    sanitizePlainText(
      body?.moderationNote,
      1000
    );

  if (!moderationNote) {
    return validationError(
      "Une note est obligatoire pour refuser une description.",
      {
        moderationNote:
          "Explique au créateur ce qu’il doit modifier."
      }
    );
  }

  await env.DB.prepare(`
    UPDATE creator_description_revisions
    SET
      status = 'rejected',
      reviewed_by_user_id = ?,
      reviewed_at =
        CURRENT_TIMESTAMP,
      moderation_note = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
  `)
    .bind(
      authorization.user.id,
      moderationNote,
      revision.id
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.description.rejected",

      entityType:
        "creator_description_revision",

      entityId:
        revision.id,

      oldValue: {
        status: "pending"
      },

      newValue: {
        status: "rejected",
        moderationNote
      },

      request
    }
  );

  const rejectedRevision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  return json({
    success: true,
    status: "rejected",

    revision:
      mapCreatorDescriptionRevision(
        rejectedRevision
      )
  });
}

/* ============================================================
 * RÉUTILISER UNE DESCRIPTION REFUSÉE COMME BROUILLON
 * ============================================================
 */

async function duplicateRejectedDescriptionAsDraft(
  request,
  env,
  creatorId,
  publicId
) {
  const access =
    await requireCreatorAccess(
      request,
      env,
      creatorId,
      {
        allowCreatorModerator: false,
        allowDelegate: true,
        allowOwner: true
      }
    );

  if (!access.allowed) {
    return access.response;
  }

  const rejectedRevision =
    await findDescriptionRevisionByPublicId(
      env,
      publicId
    );

  if (
    !rejectedRevision ||
    Number(
      rejectedRevision.creator_id
    ) !== Number(creatorId) ||
    rejectedRevision.status !==
      "rejected"
  ) {
    return notFound(
      "Description refusée introuvable."
    );
  }

  const existingDraft =
    await getLatestDescriptionRevision(
      env,
      creatorId,
      ["draft"]
    );

  if (existingDraft) {
    return json(
      {
        error:
          "Un brouillon existe déjà. Supprime-le ou modifie-le avant de continuer."
      },
      409
    );
  }

  const revisionNumber =
    await getNextDescriptionRevisionNumber(
      env,
      creatorId
    );

  const newPublicId =
    createPublicIdentifier("cdr");

  await env.DB.prepare(`
    INSERT INTO creator_description_revisions (
      public_id,
      creator_id,
      revision_number,
      status,
      markdown_content,
      submitted_by_user_id,
      source_revision_id,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      'draft',
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      newPublicId,
      creatorId,
      revisionNumber,
      rejectedRevision
        .markdown_content,

      access.user.id,
      rejectedRevision.id
    )
    .run();

  const draft =
    await findDescriptionRevisionByPublicId(
      env,
      newPublicId
    );

  await writeAuditLog(
    env,
    {
      actorUserId:
        access.user.id,

      action:
        "creator.description.rejected_duplicated",

      entityType:
        "creator_description_revision",

      entityId:
        draft?.id,

      newValue: {
        creatorId,
        sourceRevisionId:
          rejectedRevision.id,

        status: "draft"
      },

      request
    }
  );

  return json(
    {
      success: true,

      draft:
        mapCreatorDescriptionRevision(
          draft
        )
    },
    201
  );
}

/* ============================================================
 * HISTORIQUE RÉSERVÉ À LA MODÉRATION
 * ============================================================
 */

async function listCreatorDescriptionHistory(
  request,
  env,
  creatorId
) {
  const authorization =
    await requireGlobalModerator(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const result =
    await env.DB.prepare(`
      SELECT
        revisions.*,

        submitter.twitch_login
          AS submitted_by_twitch_login,

        submitter.twitch_display_name
          AS submitted_by_display_name,

        submitter.twitch_profile_image_url
          AS submitted_by_profile_image_url,

        reviewer.twitch_login
          AS reviewed_by_twitch_login,

        reviewer.twitch_display_name
          AS reviewed_by_display_name

      FROM creator_description_revisions
        AS revisions

      LEFT JOIN users AS submitter
        ON submitter.id =
          revisions.submitted_by_user_id

      LEFT JOIN users AS reviewer
        ON reviewer.id =
          revisions.reviewed_by_user_id

      WHERE revisions.creator_id = ?

      ORDER BY
        revisions.revision_number DESC
    `)
      .bind(creatorId)
      .all();

  return json({
    creator: {
      id:
        Number(creator.id),

      slug:
        creator.slug,

      twitchDisplayName:
        creator
          .twitch_display_name,

      publicDescriptionRevisionId:
        creator
          .public_description_revision_id
          ? Number(
              creator
                .public_description_revision_id
            )
          : null
    },

    revisions:
      (result.results ?? []).map(
        mapCreatorDescriptionRevision
      )
  });
}

/* ============================================================
 * CONFIGURATION DU BYPASS
 * ============================================================
 */

async function updateCreatorDescriptionBypass(
  request,
  env,
  creatorId
) {
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const creator =
    await findCreatorById(
      env,
      creatorId
    );

  if (!creator) {
    return notFound(
      "Créateur introuvable."
    );
  }

  const body =
    await readJson(request);

  if (
    !body ||
    typeof body.enabled !== "boolean"
  ) {
    return validationError(
      "Le champ enabled doit être un booléen."
    );
  }

  await env.DB.prepare(`
    UPDATE creators
    SET
      description_moderation_bypass = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      body.enabled ? 1 : 0,
      creatorId
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "creator.description.bypass_updated",

      entityType:
        "creator",

      entityId:
        creatorId,

      oldValue: {
        enabled:
          Boolean(
            creator
              .description_moderation_bypass
          )
      },

      newValue: {
        enabled:
          body.enabled
      },

      request
    }
  );

  return json({
    success: true,
    enabled: body.enabled
  });
}
/* ============================================================
 * PROGRAMME DU JEVENT 26
 * ============================================================
 */

const EVENT_TIMEZONE =
  "Europe/Paris";

const EVENT_PROGRAM_START =
  "2026-10-25T16:00:00+01:00";

const EVENT_PROGRAM_END =
  "2026-10-28T04:00:00+01:00";

const PROGRAM_ENTRY_STATUSES =
  new Set([
    "draft",
    "published",
    "cancelled"
  ]);

const PROGRAM_ENTRY_CATEGORIES =
  new Set([
    "gaming",
    "talk",
    "challenge",
    "creative",
    "charity",
    "community",
    "special",
    "other"
  ]);

const MAX_PROGRAM_TITLE_LENGTH = 150;
const MAX_PROGRAM_DESCRIPTION_LENGTH = 10000;
const MAX_PROGRAM_PARTICIPANTS = 10;

function getProgramBounds() {
  return {
    startsAt:
      EVENT_PROGRAM_START,

    endsAt:
      EVENT_PROGRAM_END,

    timezone:
      EVENT_TIMEZONE
  };
}

function isProgramDateWithinEvent(
  startsAt,
  endsAt
) {
  const eventStart =
    new Date(
      EVENT_PROGRAM_START
    ).getTime();

  const eventEnd =
    new Date(
      EVENT_PROGRAM_END
    ).getTime();

  const entryStart =
    new Date(startsAt).getTime();

  const entryEnd =
    new Date(endsAt).getTime();

  if (
    Number.isNaN(entryStart) ||
    Number.isNaN(entryEnd)
  ) {
    return false;
  }

  return (
    entryStart >= eventStart &&
    entryEnd <= eventEnd &&
    entryEnd > entryStart
  );
}

function getProgramEventDay(startsAt) {
  const date =
    new Date(startsAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  /*
   * Les journées du JEvent sont logiques plutôt que
   * strictement calendaires :
   *
   * Jour 1 : 25 octobre
   * Jour 2 : 26 octobre
   * Jour 3 : 27 octobre jusqu'au 28 octobre à 4 h
   */
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          EVENT_TIMEZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    );

  const localDate =
    formatter.format(date);

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

function validateProgramMarkdown(
  rawMarkdown
) {
  /*
   * Le programme n'a pas besoin de validation humaine,
   * mais les mêmes règles de sécurité que les profils
   * restent appliquées.
   */
  const validation =
    validateCreatorMarkdown(
      String(rawMarkdown ?? "")
        .slice(
          0,
          MAX_PROGRAM_DESCRIPTION_LENGTH
        )
    );

  /*
   * Une description vide est autorisée dans le programme.
   */
  if (
    !String(rawMarkdown ?? "").trim()
  ) {
    return {
      valid: true,
      markdown: "",
      errors: []
    };
  }

  return validation;
}

function normalizeProgramCategory(
  value
) {
  const category =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return PROGRAM_ENTRY_CATEGORIES.has(
    category
  )
    ? category
    : "other";
}

function normalizeProgramStatus(
  value,
  fallback = "draft"
) {
  const status =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return PROGRAM_ENTRY_STATUSES.has(
    status
  )
    ? status
    : fallback;
}

function normalizeProgramParticipantIds(
  values
) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(value =>
          normalizeInteger(
            value,
            {
              minimum: 1,
              fallback: 0
            }
          )
        )
        .filter(Boolean)
    )
  ].slice(
    0,
    MAX_PROGRAM_PARTICIPANTS
  );
}

async function getCreatorsByIds(
  env,
  creatorIds
) {
  if (creatorIds.length === 0) {
    return [];
  }

  const placeholders =
    creatorIds
      .map(() => "?")
      .join(", ");

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        slug,
        twitch_id,
        twitch_login,
        twitch_display_name,
        twitch_profile_image_url,
        display_order,
        active,
        archived
      FROM creators
      WHERE id IN (${placeholders})
    `)
      .bind(...creatorIds)
      .all();

  return result.results ?? [];
}

async function validateProgramParticipants(
  env,
  {
    participantIds,
    primaryCreatorId
  }
) {
  const normalizedParticipants =
    normalizeProgramParticipantIds(
      participantIds
    );

  const normalizedPrimaryCreatorId =
    normalizeInteger(
      primaryCreatorId,
      {
        minimum: 1,
        fallback: 0
      }
    );

  if (
    normalizedPrimaryCreatorId &&
    !normalizedParticipants.includes(
      normalizedPrimaryCreatorId
    )
  ) {
    normalizedParticipants.unshift(
      normalizedPrimaryCreatorId
    );
  }

  const limitedParticipants =
    normalizedParticipants.slice(
      0,
      MAX_PROGRAM_PARTICIPANTS
    );

  if (limitedParticipants.length === 0) {
    return {
      valid: false,
      error:
        "Au moins un créateur participant est obligatoire.",
      participants: [],
      primaryCreatorId: null
    };
  }

  const creators =
    await getCreatorsByIds(
      env,
      limitedParticipants
    );

  const activeCreators =
    creators.filter(
      creator =>
        Boolean(creator.active) &&
        !Boolean(creator.archived)
    );

  if (
    activeCreators.length !==
    limitedParticipants.length
  ) {
    return {
      valid: false,
      error:
        "Un ou plusieurs créateurs sont absents, inactifs ou archivés.",
      participants: activeCreators,
      primaryCreatorId: null
    };
  }

  const resolvedPrimaryCreatorId =
    normalizedPrimaryCreatorId ||
    Number(activeCreators[0].id);

  if (
    !activeCreators.some(
      creator =>
        Number(creator.id) ===
        resolvedPrimaryCreatorId
    )
  ) {
    return {
      valid: false,
      error:
        "La chaîne principale doit appartenir à l’un des participants.",
      participants: activeCreators,
      primaryCreatorId: null
    };
  }

  return {
    valid: true,
    error: null,
    participants: activeCreators,
    primaryCreatorId:
      resolvedPrimaryCreatorId
  };
}

async function userCanCreateProgramForParticipants(
  env,
  user,
  participantIds
) {
  if (
    userHasAnyRole(
      user.roles,


$$
"moderator",
        "super_admin"
$$


    )
  ) {
    return true;
  }

  /*
   * Un créateur ou son délégataire peut créer une activité
   * si au moins l'un des profils participants lui appartient.
   */
  for (const creatorId of participantIds) {
    const allowed =
      await userCanManageCreator(
        env,
        user,
        creatorId,
        {
          allowCreatorModerator: false,
          allowDelegate: true,
          allowOwner: true
        }
      );

    if (allowed) {
      return true;
    }
  }

  return false;
}

async function getProgramParticipants(
  env,
  entryId
) {
  const result =
    await env.DB.prepare(`
      SELECT
        creators.id,
        creators.slug,
        creators.twitch_id,
        creators.twitch_login,
        creators.twitch_display_name,
        creators.twitch_profile_image_url,
        creators.display_order,

        program_entry_participants
          .is_primary,

        program_entry_participants
          .display_order
          AS participant_display_order

      FROM program_entry_participants

      INNER JOIN creators
        ON creators.id =
          program_entry_participants
            .creator_id

      WHERE program_entry_participants
        .program_entry_id = ?

      ORDER BY
        program_entry_participants
          .is_primary DESC,

        program_entry_participants
          .display_order ASC,

        creators.display_order ASC
    `)
      .bind(entryId)
      .all();

  return (result.results ?? []).map(
    participant => ({
      id:
        Number(participant.id),

      slug:
        participant.slug,

      twitchId:
        participant.twitch_id,

      twitchLogin:
        participant.twitch_login,

      twitchDisplayName:
        participant.twitch_display_name,

      twitchProfileImageUrl:
        participant
          .twitch_profile_image_url,

      primary:
        Boolean(
          participant.is_primary
        ),

      displayOrder:
        Number(
          participant
            .participant_display_order ??
          participant.display_order ??
          0
        )
    })
  );
}

async function mapProgramEntry(
  env,
  entry
) {
  const participants =
    await getProgramParticipants(
      env,
      entry.id
    );

  const primaryParticipant =
    participants.find(
      participant =>
        participant.primary
    ) ?? participants[0] ?? null;

  return {
    id:
      Number(entry.id),

    publicId:
      entry.public_id,

    title:
      entry.title,

    slug:
      entry.slug,

    descriptionMarkdown:
      entry.description_markdown ?? "",

    category:
      entry.category,

    status:
      entry.status,

    startsAt:
      entry.starts_at,

    endsAt:
      entry.ends_at,

    eventDay:
      Number(entry.event_day),

    timezone:
      entry.timezone ||
      EVENT_TIMEZONE,

    imageUrl:
      entry.image_storage_key
        ? `/api/media/${entry.image_storage_key}`
        : null,

    externalUrl:
      entry.external_url,

    primaryCreator:
      primaryParticipant,

    participants,

    cancelledReason:
      entry.cancelled_reason,

    createdAt:
      entry.created_at,

    updatedAt:
      entry.updated_at,

    publishedAt:
      entry.published_at,

    cancelledAt:
      entry.cancelled_at
  };
}

async function findProgramEntryByPublicId(
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

async function findProgramEntryById(
  env,
  entryId
) {
  return env.DB.prepare(`
    SELECT *
    FROM program_entries
    WHERE id = ?
    LIMIT 1
  `)
    .bind(entryId)
    .first();
}

async function programEntrySlugExists(
  env,
  slug,
  exceptEntryId = null
) {
  let result;

  if (exceptEntryId === null) {
    result =
      await env.DB.prepare(`
        SELECT 1 AS found
        FROM program_entries
        WHERE slug = ?
        LIMIT 1
      `)
        .bind(slug)
        .first();
  } else {
    result =
      await env.DB.prepare(`
        SELECT 1 AS found
        FROM program_entries
        WHERE slug = ?
          AND id <> ?
        LIMIT 1
      `)
        .bind(
          slug,
          exceptEntryId
        )
        .first();
  }

  return Boolean(result);
}

async function generateUniqueProgramSlug(
  env,
  title,
  exceptEntryId = null
) {
  const baseSlug =
    normalizeSlug(title) ||
    "activite";

  let candidate =
    baseSlug;

  let suffix = 2;

  while (
    await programEntrySlugExists(
      env,
      candidate,
      exceptEntryId
    )
  ) {
    candidate =
      `${baseSlug}-${suffix}`;

    suffix++;

    if (suffix > 1000) {
      candidate =
        `${baseSlug}-` +
        generateRandomToken(4);
    }
  }

  return candidate;
}

/* ============================================================
 * DÉTECTION DES CONFLITS D’HORAIRES
 * ============================================================
 */

async function detectProgramConflicts(
  env,
  {
    startsAt,
    endsAt,
    participantIds,
    exceptEntryId = null
  }
) {
  if (participantIds.length === 0) {
    return [];
  }

  const placeholders =
    participantIds
      .map(() => "?")
      .join(", ");

  const exceptCondition =
    exceptEntryId
      ? "AND entries.id <> ?"
      : "";

  const bindings = [
    ...participantIds,
    endsAt,
    startsAt
  ];

  if (exceptEntryId) {
    bindings.push(
      exceptEntryId
    );
  }

  const result =
    await env.DB.prepare(`
      SELECT DISTINCT
        entries.id,
        entries.public_id,
        entries.title,
        entries.starts_at,
        entries.ends_at,
        entries.status,

        creators.id
          AS conflicting_creator_id,

        creators.twitch_display_name
          AS conflicting_creator_name

      FROM program_entries
        AS entries

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

        ${exceptCondition}

      ORDER BY
        entries.starts_at ASC
    `)
      .bind(...bindings)
      .all();

  return (result.results ?? []).map(
    conflict => ({
      entryId:
        Number(conflict.id),

      publicId:
        conflict.public_id,

      title:
        conflict.title,

      startsAt:
        conflict.starts_at,

      endsAt:
        conflict.ends_at,

      status:
        conflict.status,

      creatorId:
        Number(
          conflict
            .conflicting_creator_id
        ),

      creatorName:
        conflict
          .conflicting_creator_name
    })
  );
}

/* ============================================================
 * CONSULTATION PUBLIQUE DU PROGRAMME
 * ============================================================
 */

async function listPublicProgram(
  request,
  env
) {
  const url =
    new URL(request.url);

  const requestedDay =
    normalizeInteger(
      url.searchParams.get("day"),
      {
        minimum: 1,
        maximum: 3,
        fallback: 0
      }
    );

  const creatorSlug =
    normalizeSlug(
      url.searchParams.get(
        "creator"
      )
    );

  let creatorId = 0;

  if (creatorSlug) {
    const creator =
      await findCreatorBySlug(
        env,
        creatorSlug
      );

    if (!creator) {
      return notFound(
        "Créateur introuvable."
      );
    }

    creatorId =
      Number(creator.id);
  }

  const bindings = [];

  let dayCondition = "";

  if (requestedDay) {
    dayCondition =
      "AND entries.event_day = ?";

    bindings.push(
      requestedDay
    );
  }

  let creatorJoin = "";
  let creatorCondition = "";

  if (creatorId) {
    creatorJoin = `
      INNER JOIN program_entry_participants
        AS creator_filter

        ON creator_filter.program_entry_id =
          entries.id
    `;

    creatorCondition = `
      AND creator_filter.creator_id = ?
    `;

    bindings.push(
      creatorId
    );
  }

  const result =
    await env.DB.prepare(`
      SELECT DISTINCT
        entries.*

      FROM program_entries
        AS entries

      ${creatorJoin}

      WHERE entries.status = 'published'

      ${dayCondition}
      ${creatorCondition}

      ORDER BY
        entries.starts_at ASC,
        entries.id ASC
    `)
      .bind(...bindings)
      .all();

  const entries =
    await Promise.all(
      (result.results ?? []).map(
        entry =>
          mapProgramEntry(
            env,
            entry
          )
      )
    );

  return json({
    program: entries,

    filters: {
      day:
        requestedDay || null,

      creator:
        creatorSlug || null
    },

    event: {
      name:
        "JEvent 26",

      startsAt:
        EVENT_PROGRAM_START,

      endsAt:
        EVENT_PROGRAM_END,

      timezone:
        EVENT_TIMEZONE,

      days: [
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
          endsOn:
            "2026-10-28"
        }
      ]
    }
  });
}

async function getPublicProgramEntry(
  request,
  env,
  publicId
) {
  const entry =
    await findProgramEntryByPublicId(
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
    entry:
      await mapProgramEntry(
        env,
        entry
      )
  });
}

/* ============================================================
 * CRÉATION D’UNE ACTIVITÉ
 * ============================================================
 */

async function createProgramEntry(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const title =
    sanitizePlainText(
      body.title,
      MAX_PROGRAM_TITLE_LENGTH
    );

  if (!title) {
    return validationError(
      "Le titre est obligatoire.",
      {
        title:
          "Saisis le titre de l’activité."
      }
    );
  }

  const startsAt =
    normalizeDate(
      body.startsAt
    );

  const endsAt =
    normalizeDate(
      body.endsAt
    );

  if (!startsAt || !endsAt) {
    return validationError(
      "Les horaires sont invalides."
    );
  }

  if (
    !isProgramDateWithinEvent(
      startsAt,
      endsAt
    )
  ) {
    return validationError(
      "L’activité doit avoir lieu pendant le JEvent 26, entre le 25 octobre 2026 à 16 h et le 28 octobre 2026 à 4 h."
    );
  }

  const eventDay =
    getProgramEventDay(
      startsAt
    );

  if (!eventDay) {
    return validationError(
      "Impossible de déterminer la journée de l’activité."
    );
  }

  const participantValidation =
    await validateProgramParticipants(
      env,
      {
        participantIds:
          body.participantIds,

        primaryCreatorId:
          body.primaryCreatorId
      }
    );

  if (!participantValidation.valid) {
    return validationError(
      participantValidation.error
    );
  }

  const participantIds =
    participantValidation.participants
      .map(
        creator =>
          Number(creator.id)
      );

  const canCreate =
    await userCanCreateProgramForParticipants(
      env,
      authentication.user,
      participantIds
    );

  if (!canCreate) {
    return forbidden(
      "Tu ne peux pas créer une activité pour ces créateurs."
    );
  }

  const descriptionValidation =
    validateProgramMarkdown(
      body.descriptionMarkdown
    );

  if (!descriptionValidation.valid) {
    return json(
      {
        error:
          "La description Markdown est invalide.",

        validationErrors:
          descriptionValidation.errors
      },
      400
    );
  }

  const status =
    normalizeProgramStatus(
      body.status,
      "draft"
    );

  const category =
    normalizeProgramCategory(
      body.category
    );

  const conflicts =
    await detectProgramConflicts(
      env,
      {
        startsAt,
        endsAt,
        participantIds
      }
    );

  /*
   * Les conflits n’empêchent pas un modérateur global
   * ou un super administrateur de créer l’activité.
   */
  const mayOverrideConflicts =
    userHasAnyRole(
      authentication.user.roles,


$$
"moderator",
        "super_admin"
$$


    );

  const overrideConflicts =
    normalizeBoolean(
      body.overrideConflicts
    );

  if (
    conflicts.length > 0 &&
    !(
      mayOverrideConflicts &&
      overrideConflicts
    )
  ) {
    return json(
      {
        error:
          "Cette activité entre en conflit avec le programme existant.",

        conflicts,

        canOverride:
          mayOverrideConflicts
      },
      409
    );
  }

  const slug =
    await generateUniqueProgramSlug(
      env,
      body.slug || title
    );

  const publicId =
    createPublicIdentifier(
      "program"
    );

  const externalUrl =
    sanitizePlainText(
      body.externalUrl,
      1000
    ) || null;

  /*
   * Les liens externes sont facultatifs, mais uniquement HTTPS.
   */
  if (externalUrl) {
    try {
      const parsedUrl =
        new URL(externalUrl);

      if (
        parsedUrl.protocol !== "https:"
      ) {
        return validationError(
          "Le lien externe doit utiliser HTTPS."
        );
      }
    } catch {
      return validationError(
        "Le lien externe est invalide."
      );
    }
  }

  const insertResult =
    await env.DB.prepare(`
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
        title,
        descriptionValidation.markdown,
        category,
        status,
        startsAt,
        endsAt,
        eventDay,
        EVENT_TIMEZONE,
        externalUrl,
        authentication.user.id,

        status === "published"
          ? new Date().toISOString()
          : null
      )
      .run();

  const entryId =
    Number(
      insertResult.meta?.last_row_id
    );

  const participantStatements =
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
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
          .bind(
            entryId,
            creatorId,

            creatorId ===
              participantValidation
                .primaryCreatorId
              ? 1
              : 0,

            index * 10,

            authentication.user.id
          )
    );

  await env.DB.batch(
    participantStatements
  );

  await writeAuditLog(
    env,
    {
      actorUserId:
        authentication.user.id,

      action:
        "program.entry.created",

      entityType:
        "program_entry",

      entityId:
        entryId,

      newValue: {
        publicId,
        title,
        status,
        startsAt,
        endsAt,
        eventDay,
        participantIds,

        primaryCreatorId:
          participantValidation
            .primaryCreatorId,

        conflictsOverridden:
          conflicts.length > 0 &&
          overrideConflicts
      },

      request
    }
  );

  const createdEntry =
    await findProgramEntryById(
      env,
      entryId
    );

  return json(
    {
      success: true,

      entry:
        await mapProgramEntry(
          env,
          createdEntry
        ),

      conflictsOverridden:
        conflicts.length > 0 &&
        overrideConflicts,

      conflicts
    },
    201
  );
}

/* ============================================================
 * CONSULTATION DU PROGRAMME DANS LES PANELS
 * ============================================================
 */

async function listManageableProgramEntries(
  request,
  env
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const isGlobalManager =
    userHasAnyRole(
      authentication.user.roles,


$$
"moderator",
        "super_admin"
$$


    );

  let result;

  if (isGlobalManager) {
    result =
      await env.DB.prepare(`
        SELECT DISTINCT entries.*
        FROM program_entries AS entries
        ORDER BY
          entries.starts_at ASC,
          entries.id ASC
      `)
        .all();
  } else {
    const creatorIds =
      authentication.user
        .creatorMemberships
        .filter(
          membership =>
            ["owner", "delegate"]
              .includes(
                membership.memberRole
              )
        )
        .map(
          membership =>
            membership.creatorId
        );

    if (creatorIds.length === 0) {
      return json({
        entries: []
      });
    }

    const placeholders =
      creatorIds
        .map(() => "?")
        .join(", ");

    result =
      await env.DB.prepare(`
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

  const entries =
    await Promise.all(
      (result.results ?? []).map(
        entry =>
          mapProgramEntry(
            env,
            entry
          )
      )
    );

  return json({
    entries
  });
}

/* ============================================================
 * MODIFICATION D’UNE ACTIVITÉ
 * ============================================================
 */

async function updateProgramEntry(
  request,
  env,
  publicId
) {
  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const entry =
    await findProgramEntryByPublicId(
      env,
      publicId
    );

  if (!entry) {
    return notFound(
      "Activité introuvable."
    );
  }

  const currentParticipants =
    await getProgramParticipants(
      env,
      entry.id
    );

  const currentParticipantIds =
    currentParticipants.map(
      participant =>
        participant.id
    );

  const canEdit =
    await userCanCreateProgramForParticipants(
      env,
      authentication.user,
      currentParticipantIds
    );

  if (!canEdit) {
    return forbidden(
      "Tu ne peux pas modifier cette activité."
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return validationError(
      "Corps JSON invalide."
    );
  }

  const title =
    body.title === undefined
      ? entry.title
      : sanitizePlainText(
          body.title,
          MAX_PROGRAM_TITLE_LENGTH
        );

  if (!title) {
    return validationError(
      "Le titre est obligatoire."
    );
  }

  const startsAt =
    body.startsAt === undefined
      ? entry.starts_at
      : normalizeDate(
          body.startsAt
        );

  const endsAt =
    body.endsAt === undefined
      ? entry.ends_at
      : normalizeDate(
          body.endsAt
        );

  if (
    !startsAt ||
    !endsAt ||
    !isProgramDateWithinEvent(
      startsAt,
      endsAt
    )
  ) {
    return validationError(
      "Les horaires doivent être compris entre le 25 octobre 2026 à 16 h et le 28 octobre 2026 à 4 h."
    );
  }

  const eventDay =
    getProgramEventDay(
      startsAt
    );

  const participantIds =
    body.participantIds === undefined
      ? currentParticipantIds
      : body.participantIds;

  const currentPrimaryCreator =
    currentParticipants.find(
      participant =>
        participant.primary
    );

  const participantValidation =
    await validateProgramParticipants(
      env,
      {
        participantIds,

        primaryCreatorId:
          body.primaryCreatorId ===
            undefined
            ? currentPrimaryCreator?.id
            : body.primaryCreatorId
      }
    );

  if (!participantValidation.valid) {
    return validationError(
      participantValidation.error
    );
  }

  const updatedParticipantIds =
    participantValidation.participants
      .map(
        creator =>
          Number(creator.id)
      );

  const mayManageNewParticipants =
    await userCanCreateProgramForParticipants(
      env,
      authentication.user,
      updatedParticipantIds
    );

  if (!mayManageNewParticipants) {
    return forbidden(
      "Tu ne peux pas attribuer cette activité à ces créateurs."
    );
  }

  const descriptionValidation =
    body.descriptionMarkdown ===
      undefined
      ? {
          valid: true,
          markdown:
            entry
              .description_markdown ??
            "",
          errors: []
        }
      : validateProgramMarkdown(
          body.descriptionMarkdown
        );

  if (!descriptionValidation.valid) {
    return json(
      {
        error:
          "La description Markdown est invalide.",

        validationErrors:
          descriptionValidation.errors
      },
      400
    );
  }

  const status =
    body.status === undefined
      ? entry.status
      : normalizeProgramStatus(
          body.status,
          entry.status
        );

  const category =
    body.category === undefined
      ? entry.category
      : normalizeProgramCategory(
          body.category
        );

  const conflicts =
    await detectProgramConflicts(
      env,
      {
        startsAt,
        endsAt,

        participantIds:
          updatedParticipantIds,

        exceptEntryId:
          entry.id
      }
    );

  const mayOverrideConflicts =
    userHasAnyRole(
      authentication.user.roles,


$$
"moderator",
        "super_admin"
$$


    );

  const overrideConflicts =
    normalizeBoolean(
      body.overrideConflicts
    );

  if (
    conflicts.length > 0 &&
    !(
      mayOverrideConflicts &&
      overrideConflicts
    )
  ) {
    return json(
      {
        error:
          "Cette modification crée un conflit d’horaires.",

        conflicts,

        canOverride:
          mayOverrideConflicts
      },
      409
    );
  }

  let slug =
    entry.slug;

  if (
    body.slug !== undefined ||
    title !== entry.title
  ) {
    const requestedSlug =
      body.slug === undefined
        ? title
        : body.slug;

    const normalizedRequestedSlug =
      normalizeSlug(
        requestedSlug
      );

    if (
      normalizedRequestedSlug !==
      entry.slug
    ) {
      slug =
        await generateUniqueProgramSlug(
          env,
          requestedSlug,
          entry.id
        );
    }
  }

  const externalUrl =
    body.externalUrl === undefined
      ? entry.external_url
      : sanitizePlainText(
          body.externalUrl,
          1000
        ) || null;

  if (externalUrl) {
    try {
      const parsedUrl =
        new URL(externalUrl);

      if (
        parsedUrl.protocol !== "https:"
      ) {
        return validationError(
          "Le lien externe doit utiliser HTTPS."
        );
      }
    } catch {
      return validationError(
        "Le lien externe est invalide."
      );
    }
  }

  const publishedAt =
    status === "published"
      ? (
          entry.published_at ||
          new Date().toISOString()
        )
      : entry.published_at;

  const cancelledAt =
    status === "cancelled"
      ? (
          entry.cancelled_at ||
          new Date().toISOString()
        )
      : null;

  const cancelledReason =
    status === "cancelled"
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
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      slug,
      title,
      descriptionValidation.markdown,
      category,
      status,
      startsAt,
      endsAt,
      eventDay,
      EVENT_TIMEZONE,
      externalUrl,
      publishedAt,
      cancelledAt,
      cancelledReason,
      entry.id
    )
    .run();

  /*
   * Remplace entièrement la liste des participants.
   */
  await env.DB.prepare(`
    DELETE FROM program_entry_participants
    WHERE program_entry_id = ?
  `)
    .bind(entry.id)
    .run();

  await env.DB.batch(
    updatedParticipantIds.map(
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
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
          .bind(
            entry.id,
            creatorId,

            creatorId ===
              participantValidation
                .primaryCreatorId
              ? 1
              : 0,

            index * 10,

            authentication.user.id
          )
    )
  );

  await writeAuditLog(
    env,
    {
      actorUserId:
        authentication.user.id,

      action:
        "program.entry.updated",

      entityType:
        "program_entry",

      entityId:
        entry.id,

      oldValue: {
        title:
          entry.title,

        status:
          entry.status,

        startsAt:
          entry.starts_at,

        endsAt:
          entry.ends_at,

        participantIds:
          currentParticipantIds
      },

      newValue: {
        title,
        status,
        startsAt,
        endsAt,
        eventDay,

        participantIds:
          updatedParticipantIds,

        primaryCreatorId:
          participantValidation
            .primaryCreatorId,

        conflictsOverridden:
          conflicts.length > 0 &&
          overrideConflicts
      },

      request
    }
  );

  const updatedEntry =
    await findProgramEntryById(
      env,
      entry.id
    );

  return json({
    success: true,

    entry:
      await mapProgramEntry(
        env,
        updatedEntry
      ),

    conflicts,

    conflictsOverridden:
      conflicts.length > 0 &&
      overrideConflicts
  });
}

/* ============================================================
 * SUPPRESSION ET ANNULATION
 * ============================================================
 */

async function cancelProgramEntry(
  request,
  env,
  publicId
) {
  const entry =
    await findProgramEntryByPublicId(
      env,
      publicId
    );

  if (!entry) {
    return notFound(
      "Activité introuvable."
    );
  }

  const authentication =
    await requireAuthenticatedUser(
      request,
      env
    );

  if (!authentication) {
    return unauthorized();
  }

  const participants =
    await getProgramParticipants(
      env,
      entry.id
    );

  const canEdit =
    await userCanCreateProgramForParticipants(
      env,
      authentication.user,
      participants.map(
        participant =>
          participant.id
      )
    );

  if (!canEdit) {
    return forbidden(
      "Tu ne peux pas annuler cette activité."
    );
  }

  const body =
    (await readJson(request)) ??
    {};

  const reason =
    sanitizePlainText(
      body.reason,
      1000
    );

  await env.DB.prepare(`
    UPDATE program_entries
    SET
      status = 'cancelled',
      cancelled_reason = ?,
      cancelled_at =
        CURRENT_TIMESTAMP,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      reason || null,
      entry.id
    )
    .run();

  await writeAuditLog(
    env,
    {
      actorUserId:
        authentication.user.id,

      action:
        "program.entry.cancelled",

      entityType:
        "program_entry",

      entityId:
        entry.id,

      oldValue: {
        status:
          entry.status
      },

      newValue: {
        status:
          "cancelled",

        reason:
          reason || null
      },

      request
    }
  );

  return json({
    success: true,
    status: "cancelled"
  });
}

async function deleteProgramEntry(
  request,
  env,
  publicId
) {
  /*
   * La suppression définitive est réservée aux super admins.
   * Les créateurs et modérateurs doivent annuler l’activité.
   */
  const authorization =
    await requireSuperAdmin(
      request,
      env
    );

  if (!authorization.allowed) {
    return authorization.response;
  }

  const entry =
    await findProgramEntryByPublicId(
      env,
      publicId
    );

  if (!entry) {
    return notFound(
      "Activité introuvable."
    );
  }

  const participants =
    await getProgramParticipants(
      env,
      entry.id
    );

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM program_entry_participants
      WHERE program_entry_id = ?
    `)
      .bind(entry.id),

    env.DB.prepare(`
      DELETE FROM program_entries
      WHERE id = ?
    `)
      .bind(entry.id)
  ]);

  if (
    entry.image_storage_key &&
    env.MEDIA
  ) {
    try {
      await env.MEDIA.delete(
        entry.image_storage_key
      );
    } catch (error) {
      console.error(
        "Impossible de supprimer l’image du programme :",
        error
      );
    }
  }

  await writeAuditLog(
    env,
    {
      actorUserId:
        authorization.user.id,

      action:
        "program.entry.deleted",

      entityType:
        "program_entry",

      entityId:
        entry.id,

      oldValue: {
        publicId:
          entry.public_id,

        title:
          entry.title,

        startsAt:
          entry.starts_at,

        endsAt:
          entry.ends_at,

        participants:
          participants.map(
            participant =>
              participant.id
          )
      },

      request
    }
  );

  return json({
    success: true
  });
}
}