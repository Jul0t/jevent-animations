import {
  json,
  notFound,
  internalError
} from "./shared/responses.js";

import {
  applyCors,
  handleOptions
} from "./shared/cors.js";

import {
  getCurrentUserRoute,
  logoutRoute
} from "./auth/routes.js";

import {
  startTwitchLogin,
  finishTwitchLogin
} from "./auth/twitch.js";

import {
  searchCreatorRoute,
  createCreatorRoute,
  listAdminCreatorsRoute
} from "./creators/routes.js";

import {
  getCreatorPanel,
  completeCreatorOnboarding
} from "./creators/panel.js";

import {
  getDescriptionWorkspace,
  saveDescriptionDraft,
  submitDescription,
  cancelDescriptionSubmission,
  listDescriptionsForModeration,
  approveDescription,
  rejectDescription
} from "./creators/descriptions.js";

import {
  listPublicCreators,
  getPublicCreatorBySlug,
  redirectToCreatorDonation
} from "./creators/public.js";

import {
  listPublicProgram,
  getPublicProgramEntry
} from "./program/public.js";

import {
  listManageableProgram,
  createProgramEntry,
  updateProgramEntry,
  cancelProgramEntry,
  deleteProgramEntry
} from "./program/manage.js";

async function route(request, env) {
  const url = new URL(request.url);

  /* ========================================================
     SANTÉ DE L’API
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/health"
  ) {
    return json({
      success: true,
      application: "JEvent 26 API",
      timestamp: new Date().toISOString()
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/database-health"
  ) {
    const database = await env.DB.prepare(`
      SELECT 1 AS healthy
    `).first();

    return json({
      success: true,
      database:
        Number(database?.healthy) === 1
    });
  }

  /* ========================================================
     AUTHENTIFICATION
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/auth/twitch/start"
  ) {
    return startTwitchLogin(request, env);
  }

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/auth/twitch/callback"
  ) {
    return finishTwitchLogin(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/auth/me"
  ) {
    return getCurrentUserRoute(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/logout"
  ) {
    return logoutRoute(request, env);
  }

  /* ========================================================
     CRÉATEURS PUBLICS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/creators"
  ) {
    return listPublicCreators(
      request,
      env
    );
  }

  const publicCreatorMatch =
    url.pathname.match(
      /^\/api\/creators\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicCreatorMatch
  ) {
    return getPublicCreatorBySlug(
      request,
      env,
      decodeURIComponent(
        publicCreatorMatch[1]
      )
    );
  }

  /* ========================================================
     REDIRECTION DES DONS
     ======================================================== */

  const creatorDonationMatch =
    url.pathname.match(
      /^\/don\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    creatorDonationMatch
  ) {
    return redirectToCreatorDonation(
      request,
      env,
      decodeURIComponent(
        creatorDonationMatch[1]
      )
    );
  }

  /* ========================================================
     ADMINISTRATION DES CRÉATEURS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/admin/twitch/search"
  ) {
    return searchCreatorRoute(
      request,
      env
    );
  }

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/admin/creators"
  ) {
    return listAdminCreatorsRoute(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
      "/api/admin/creators"
  ) {
    return createCreatorRoute(
      request,
      env
    );
  }

  /* ========================================================
     PANEL CRÉATEUR
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/creator-panel"
  ) {
    return getCreatorPanel(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
      "/api/creator-panel/onboarding/complete"
  ) {
    return completeCreatorOnboarding(
      request,
      env
    );
  }

  /* ========================================================
     DESCRIPTIONS DES CRÉATEURS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/creator-panel/description"
  ) {
    return getDescriptionWorkspace(
      request,
      env
    );
  }

  if (
    request.method === "PUT" &&
    url.pathname ===
      "/api/creator-panel/description/draft"
  ) {
    return saveDescriptionDraft(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
      "/api/creator-panel/description/submit"
  ) {
    return submitDescription(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname ===
      "/api/creator-panel/description/cancel"
  ) {
    return cancelDescriptionSubmission(
      request,
      env
    );
  }

  /* ========================================================
     MODÉRATION DES DESCRIPTIONS
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname ===
      "/api/moderation/descriptions"
  ) {
    return listDescriptionsForModeration(
      request,
      env
    );
  }

  const approveDescriptionMatch =
    url.pathname.match(
      /^\/api\/moderation\/descriptions\/([^/]+)\/approve$/
    );

  if (
    request.method === "POST" &&
    approveDescriptionMatch
  ) {
    return approveDescription(
      request,
      env,
      decodeURIComponent(
        approveDescriptionMatch[1]
      )
    );
  }

  const rejectDescriptionMatch =
    url.pathname.match(
      /^\/api\/moderation\/descriptions\/([^/]+)\/reject$/
    );

  if (
    request.method === "POST" &&
    rejectDescriptionMatch
  ) {
    return rejectDescription(
      request,
      env,
      decodeURIComponent(
        rejectDescriptionMatch[1]
      )
    );
  }

  /* ========================================================
     GESTION DU PROGRAMME

     Ces routes doivent obligatoirement être placées avant
     la route dynamique publique /api/program/:publicId.
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/program/manage"
  ) {
    return listManageableProgram(
      request,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/program/manage"
  ) {
    return createProgramEntry(
      request,
      env
    );
  }

  const cancelProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/manage\/([^/]+)\/cancel$/
    );

  if (
    request.method === "POST" &&
    cancelProgramEntryMatch
  ) {
    return cancelProgramEntry(
      request,
      env,
      decodeURIComponent(
        cancelProgramEntryMatch[1]
      )
    );
  }

  const managedProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/manage\/([^/]+)$/
    );

  if (
    request.method === "PUT" &&
    managedProgramEntryMatch
  ) {
    return updateProgramEntry(
      request,
      env,
      decodeURIComponent(
        managedProgramEntryMatch[1]
      )
    );
  }

  if (
    request.method === "DELETE" &&
    managedProgramEntryMatch
  ) {
    return deleteProgramEntry(
      request,
      env,
      decodeURIComponent(
        managedProgramEntryMatch[1]
      )
    );
  }

  /* ========================================================
     PROGRAMME PUBLIC
     ======================================================== */

  if (
    request.method === "GET" &&
    url.pathname === "/api/program"
  ) {
    return listPublicProgram(
      request,
      env
    );
  }

  const publicProgramEntryMatch =
    url.pathname.match(
      /^\/api\/program\/([^/]+)$/
    );

  if (
    request.method === "GET" &&
    publicProgramEntryMatch
  ) {
    return getPublicProgramEntry(
      request,
      env,
      decodeURIComponent(
        publicProgramEntryMatch[1]
      )
    );
  }

  return notFound();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    try {
      const response = await route(
        request,
        env
      );

      return applyCors(
        request,
        env,
        response
      );
    } catch (error) {
      const requestId =
        crypto.randomUUID();

      console.error(
        `[${requestId}] Erreur Worker :`,
        error
      );

      return applyCors(
        request,
        env,
        internalError(requestId)
      );
    }
  }
};
