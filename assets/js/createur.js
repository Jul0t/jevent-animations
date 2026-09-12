(() => {
  "use strict";

  const API_URL =
    "https://api-beta.jevent.julot.fr";

  const TIMEOUT_MS = 12000;

  // ====== Sélecteurs ======
  const elements = {
    loading: document.querySelector("#loading"),
    errorState: document.querySelector("#errorState"),
    errorMessage: document.querySelector("#errorMessage"),
    profile: document.querySelector("#profile"),

    profileBanner: document.querySelector("#profileBanner"),
    creatorAvatar: document.querySelector("#creatorAvatar"),
    creatorName: document.querySelector("#creatorName"),
    creatorLogin: document.querySelector("#creatorLogin"),
    liveStatus: document.querySelector("#liveStatus"),
    twitchButton: document.querySelector("#twitchButton"),
    donationButton: document.querySelector("#donationButton"),
    description: document.querySelector("#description"),
    liveInformation: document.querySelector("#liveInformation"),

    editGoalsButton: document.querySelector("#editGoalsButton"),
    addGoalButton: document.querySelector("#addGoalButton"),
    goalsList: document.querySelector("#goalsList"),
    goalsEmpty: document.querySelector("#goalsEmpty"),

    // Dialog Goal
    goalDialog: document.querySelector("#goalDialog"),
    goalForm: document.querySelector("#goalForm"),
    goalDialogTitle: document.querySelector("#goalDialogTitle"),
    goalPublicId: document.querySelector("#goalPublicId"),
    goalTitle: document.querySelector("#goalTitle"),
    goalAmount: document.querySelector("#goalAmount"),
    goalDescription: document.querySelector("#goalDescription"),
    goalFormMessage: document.querySelector("#goalFormMessage"),
    saveGoalButton: document.querySelector("#saveGoalButton"),
    deleteGoalButton: document.querySelector("#deleteGoalButton"),
    closeGoalDialog: document.querySelector("#closeGoalDialog"),
    cancelGoalButton: document.querySelector("#cancelGoalButton"),

    // Description (optionnel)
    editDescriptionButton: document.querySelector("#editDescriptionButton"),
    descriptionDialog: document.querySelector("#descriptionDialog"),
    descriptionForm: document.querySelector("#descriptionForm"),
    descriptionInput: document.querySelector("#descriptionInput"),
    descriptionState: document.querySelector("#descriptionState"),
    descriptionMessage: document.querySelector("#descriptionMessage"),
    saveDescriptionButton: document.querySelector("#saveDescriptionButton"),
    submitDescriptionButton: document.querySelector("#submitDescriptionButton"),
    closeDescriptionDialog: document.querySelector("#closeDescriptionDialog"),
    cancelDescriptionButton: document.querySelector("#cancelDescriptionButton")
  };

  // ====== État ======
  let creator = null;
  let publicGoals = [];
  let manageableGoals = [];
  let currentUser = null;
  let canManage = false;

  let goalFormOrigin = "";
  let descriptionFormOrigin = "";

  // ====== Utilitaires ======
  function svgPencilIcon() {
    return `
      <svg class="icon-pencil" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4zm2-3.2 9-9 1.2 1.2-9 9H6v-1.2zM17.5 6.5l1-1a1.4 1.4 0 0 1 2 2l-1 1-2-2z"/>
      </svg>
    `;
  }

  function onSafe(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  function getSlugFromUrl() {
    return new URL(window.location.href).searchParams.get("slug");
  }

  function show(el, visible) {
    if (!el) return;
    el.hidden = !visible;
  }

  function safeJsonElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value || 0));
  }

  function formatMoney(cents, currency = "EUR") {
    const amount = Number(cents || 0) / 100;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Paris"
    }).format(d);
  }

  async function apiFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    const response = await fetch(
      `${API_URL}${path}`,
      {
        credentials: "include",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        ...options
      }
    ).finally(() => clearTimeout(timer));

    let data = {};
    try {
      data = await response.json();
    } catch (_e) {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(
        data.error ||
          data.message ||
          `Erreur HTTP ${response.status}`
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function safeGet(path) {
    try {
      return await apiFetch(path);
    } catch (error) {
      console.error("[safeGet]", path, error);
      return null;
    }
  }

  function toMarkdownHtml(source) {
    const raw = String(source || "").trim();
    if (!elements.description) return;

    elements.description.replaceChildren();

    if (!raw) {
      elements.description.append(
        safeJsonElement(
          "p",
          "markdown-empty",
          "Ce créateur n’a pas encore publié de description."
        )
      );
      return;
    }

    const hasLib = !!window.marked && !!window.DOMPurify;

    if (!hasLib) {
      elements.description.textContent = raw;
      return;
    }

    const html = window.marked.parse(raw, {
      gfm: true,
      breaks: true
    });

    elements.description.innerHTML = window.DOMPurify.sanitize(
      html,
      {
        ALLOWED_TAGS: [
          "p", "br", "strong", "em", "del",
          "h1", "h2", "h3", "h4",
          "ul", "ol", "li",
          "blockquote", "pre", "code", "hr"
        ],
        ALLOWED_ATTR: [],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        SANITIZE_NAMED_PROPS: true
      }
    );
  }

  function addInfo(label, value) {
    if (!elements.liveInformation) return;
    const row = document.createElement("div");
    row.className = "information-row";

    row.append(
      safeJsonElement("span", "information-label", label),
      safeJsonElement("span", "information-value", value)
    );

    elements.liveInformation.append(row);
  }

  function canUserManageCreator() {
    if (!currentUser || !creator) return false;

    const permissions = currentUser.permissions || {};
    if (permissions.isSuperAdmin || permissions.isGlobalModerator) {
      return true;
    }

    const memberships = currentUser.creatorMemberships || [];
    return memberships.some((m) =>
      Number(m.creatorId) === Number(creator.id) &&
      ["owner", "delegate"].includes(m.memberRole)
    );
  }

  function renderLive() {
    if (!elements.liveStatus || !elements.liveInformation) return;

    elements.liveStatus.replaceChildren();
    elements.liveInformation.replaceChildren();

    const isLive = !!creator.isLive && !!creator.live;
    if (!isLive) {
      elements.liveStatus.append(
        safeJsonElement("span", "status-badge offline", "Hors ligne")
      );
      addInfo("Statut", "La chaîne est actuellement hors ligne.");
      return;
    }

    const live = creator.live || {};
    elements.liveStatus.append(
      safeJsonElement("span", "status-badge live", "En direct"),
      safeJsonElement("span", "status-detail", `${formatNumber(live.viewerCount)} spectateur${Number(live.viewerCount) > 1 ? "s" : ""}`),
      safeJsonElement("span", "status-detail", live.gameName || "Catégorie inconnue")
    );

    addInfo("Titre", live.title || "Live du JEvent 26");
    addInfo("Catégorie", live.gameName || "—");
    addInfo("Spectateurs", formatNumber(live.viewerCount));
    addInfo("Démarré le", formatDate(live.startedAt));

    if (live.thumbnailUrl && elements.profileBanner) {
      elements.profileBanner.style.backgroundImage = `url("${live.thumbnailUrl}")`;
      elements.profileBanner.classList.add("has-image");
    }
  }

  function fillProfile() {
    if (!creator) return;

    document.title = `${creator.twitchDisplayName} — JEvent 26`;

    if (elements.creatorAvatar) {
      elements.creatorAvatar.src =
        creator.twitchProfileImageUrl || "/assets/jevent_logo.png";
      elements.creatorAvatar.alt = `Avatar de ${creator.twitchDisplayName}`;
    }

    if (elements.creatorName) elements.creatorName.textContent = creator.twitchDisplayName;
    if (elements.creatorLogin) elements.creatorLogin.textContent = `@${creator.twitchLogin}`;

    if (elements.twitchButton) {
      elements.twitchButton.href =
        creator.twitchUrl || `https://twitch.tv/${creator.twitchLogin}`;
    }

    if (elements.donationButton) {
      if (creator.donationUrl) {
        elements.donationButton.href = creator.donationUrl;
        elements.donationButton.classList.remove("is-disabled");
        elements.donationButton.removeAttribute("aria-disabled");
      } else {
        elements.donationButton.href = "#";
        elements.donationButton.classList.add("is-disabled");
        elements.donationButton.setAttribute("aria-disabled", "true");
      }
    }

    toMarkdownHtml(creator.descriptionMarkdown || "");
    renderLive();

    show(elements.editGoalsButton, canManage);
    show(elements.addGoalButton, canManage);

    if (elements.editDescriptionButton) {
      elements.editDescriptionButton.hidden = !canManage;
      elements.editDescriptionButton.innerHTML = svgPencilIcon();
    }
  }

  function getVisibleGoalForList() {
    const list = canManage ? manageableGoals : publicGoals;
    if (!Array.isArray(list)) return [];
    return canManage
      ? list
      : list.filter((g) => g.status !== "draft");
  }

  function renderGoals() {
    if (!elements.goalsList || !elements.goalsEmpty) return;

    elements.goalsList.replaceChildren();
    const goals = getVisibleGoalForList();

    elements.goalsEmpty.hidden = goals.length > 0;
    if (elements.goalsEmpty.hidden) {
      elements.goalsEmpty.textContent = canManage
        ? "Aucun objectif de dons à gérer."
        : "Aucun objectif de dons n’a encore été publié.";
    }

    for (const goal of goals) {
      const reached = Boolean(goal.reached);

      const item = document.createElement("article");
      item.className = "goal-item";
      if (reached) item.classList.add("is-reached");

      const marker = document.createElement("div");
      marker.className = "goal-marker";

      const amount = safeJsonElement(
        "span",
        "goal-marker-amount",
        formatMoney(goal.thresholdCents, goal.currency || "EUR")
      );

      marker.append(amount);
      if (reached) {
        marker.prepend(safeJsonElement("span", "goal-marker-check", "✓"));
      }

      const content = document.createElement("div");
      const title = safeJsonElement("h3", "goal-title", goal.title || "(Sans titre)");
      content.append(title);

      if (goal.descriptionMarkdown) {
        content.append(
          safeJsonElement("p", "goal-description", goal.descriptionMarkdown)
        );
      }

      const stateText = reached
        ? (goal.status === "completed" ? "Objectif réalisé" : "Objectif atteint")
        : (goal.status === "draft" ? "Brouillon" : "À débloquer");

      content.append(safeJsonElement("span", "goal-state", stateText));

      item.append(marker, content);

      if (canManage) {
        const canEditGoal =
          goal.scopeType === "global" ||
          (goal.scopeType === "creator" && Number(goal.creatorId || goal.creator?.id || 0) === Number(creator.id)) ||
          (goal.scopeType === "shared" &&
            Array.isArray(goal.sharedCreatorIds) &&
            goal.sharedCreatorIds.some((id) => Number(id) === Number(creator.id)));

        if (canEditGoal) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "goal-edit";
          btn.title = `Modifier ${goal.title || "l’objectif"}`;
          btn.innerHTML = svgPencilIcon();
          btn.addEventListener("click", () => openGoalDialog(goal));
          item.append(btn);
        }
      }

      elements.goalsList.append(item);
    }
  }

  // ====== Goals (formulaire modal) ======
  function goalSnapshot() {
    return JSON.stringify({
      publicId: elements.goalPublicId?.value || "",
      title: elements.goalTitle?.value.trim() || "",
      amount: elements.goalAmount?.value || "",
      description: elements.goalDescription?.value.trim() || ""
    });
  }

  function formMessage(msg, type = "") {
    if (!elements.goalFormMessage) return;
    elements.goalFormMessage.textContent = msg;
    elements.goalFormMessage.className = "form-message";
    if (type) elements.goalFormMessage.classList.add(`is-${type}`);
  }

  function resetGoalForm() {
    elements.goalForm?.reset?.();
    if (elements.goalPublicId) elements.goalPublicId.value = "";
    formMessage("");
    if (elements.deleteGoalButton) elements.deleteGoalButton.hidden = true;
  }

  function openGoalDialog(goal = null) {
    if (!elements.goalDialog) return;
    resetGoalForm();

    if (goal && elements.goalDialogTitle) {
      elements.goalDialogTitle.textContent = "Modifier l’objectif";
      if (elements.goalPublicId) elements.goalPublicId.value = goal.publicId || "";
      if (elements.goalTitle) elements.goalTitle.value = goal.title || "";
      if (elements.goalAmount) elements.goalAmount.value = ((Number(goal.thresholdCents || 0) / 100).toFixed(2));
      if (elements.goalDescription) elements.goalDescription.value = goal.descriptionMarkdown || "";
      if (elements.deleteGoalButton) elements.deleteGoalButton.hidden = false;
    } else if (elements.goalDialogTitle) {
      elements.goalDialogTitle.textContent = "Ajouter un objectif";
    }

    goalFormOrigin = goalSnapshot();
    elements.goalDialog.showModal();
    elements.goalTitle?.focus?.();
  }

  function requestCloseGoalDialog() {
    const changed = goalSnapshot() !== goalFormOrigin;
    if (changed && !window.confirm("Fermer sans enregistrer les modifications ?")) return;
    elements.goalDialog?.close();
  }

  async function saveGoal(event) {
    event.preventDefault();

    const title = elements.goalTitle?.value.trim();
    const amount = Number(elements.goalAmount?.value);

    if (!title) {
      formMessage("Le titre est obligatoire.", "error");
      elements.goalTitle?.focus?.();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      formMessage("Le montant doit être supérieur à zéro.", "error");
      elements.goalAmount?.focus?.();
      return;
    }

    const publicId = elements.goalPublicId?.value?.trim() || "";
    const payload = {
      creatorId: Number(creator.id),
      title,
      descriptionMarkdown: elements.goalDescription?.value.trim() || "",
      targetAmountCents: Math.round(amount * 100),
      status: "active"
    };

    try {
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = true;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = true;

      if (publicId) {
        await apiFetch(
          `/api/goals/manage/${encodeURIComponent(publicId)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );
      } else {
        await apiFetch("/api/goals/manage", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }

      await loadGoalsOnly();

      if (elements.goalDialog) elements.goalDialog.close();
      goalFormOrigin = goalSnapshot();
      formMessage("Enregistré.", "success");
      renderGoals();
    } catch (error) {
      formMessage(error.message, "error");
    } finally {
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = false;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = false;
    }
  }

  async function deleteGoal() {
    const publicId = elements.goalPublicId?.value?.trim();
    if (!publicId) return;

    if (!window.confirm("Supprimer définitivement cet objectif ?")) return;

    try {
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = true;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = true;

      await apiFetch(`/api/goals/manage/${encodeURIComponent(publicId)}`, {
        method: "DELETE"
      });

      await loadGoalsOnly();
      renderGoals();

      if (elements.goalDialog) elements.goalDialog.close();
    } catch (error) {
      formMessage(error.message, "error");
    } finally {
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = false;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = false;
    }
  }

  async function loadGoalsOnly() {
    const slug = getSlugFromUrl();
    const creatorGoals = await safeGet(`/api/goals/creator/${encodeURIComponent(slug)}`);
    publicGoals = Array.isArray(creatorGoals?.goals)
      ? creatorGoals.goals
      : [];

    if (canManage) {
      const manageData = await safeGet("/api/goals/manage");
      manageableGoals = Array.isArray(manageData?.goals)
        ? manageData.goals
        : [];
    } else {
      manageableGoals = [];
    }
  }

  // ====== Description (optionnel) ======
  let descriptionWorkspace = null;

  function descriptionSnapshot() {
    return elements.descriptionInput?.value ?? "";
  }

  function showDescriptionMessage(message, type = "") {
    if (!elements.descriptionMessage) return;
    elements.descriptionMessage.textContent = message;
    elements.descriptionMessage.className = "form-message";
    if (type) elements.descriptionMessage.classList.add(`is-${type}`);
  }

  function renderDescriptionState() {
    if (!elements.descriptionState) return;
    elements.descriptionState.className = "description-state";

    if (descriptionWorkspace?.pending) {
      elements.descriptionState.classList.add("is-pending");
      elements.descriptionState.textContent = "Une version est en attente de validation.";
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = true;
      return;
    }

    if (descriptionWorkspace?.lastRejected) {
      elements.descriptionState.classList.add("is-rejected");
      elements.descriptionState.textContent =
        "La dernière proposition a été refusée : " +
        (descriptionWorkspace.lastRejected.moderationNote || "aucune explication fournie");
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
      return;
    }

    elements.descriptionState.textContent = "La description sera envoyée à la modération.";
    if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
  }

  async function loadDescriptionWorkspace() {
    if (!creator) return;
    const qs = `/api/creators/description/workspace?creatorId=${encodeURIComponent(creator.id)}`;
    try {
      descriptionWorkspace = await apiFetch(qs);
      if (elements.descriptionInput) {
        elements.descriptionInput.value =
          descriptionWorkspace?.draft?.markdown ??
          descriptionWorkspace?.pending?.markdown ??
          creator.descriptionMarkdown ??
          "";
      }
      renderDescriptionState();
      descriptionFormOrigin = descriptionSnapshot();
    } catch (_e) {
      // Si ces routes n'existent pas encore côté API, on désactive proprement l'édition description
      showDescriptionMessage("Édition de description indisponible pour le moment.", "error");
      if (elements.descriptionDialog) elements.descriptionDialog.close();
    }
  }

  async function openDescriptionDialog() {
    if (!elements.descriptionDialog) return;
    await loadDescriptionWorkspace();
    elements.descriptionDialog.showModal();
    elements.descriptionInput?.focus?.();
    showDescriptionMessage("");
  }

  function requestCloseDescription() {
    const changed = descriptionSnapshot() !== descriptionFormOrigin;
    if (changed && !window.confirm("Fermer sans enregistrer le brouillon ?")) return;
    elements.descriptionDialog?.close();
  }

  async function saveDescriptionDraft() {
    if (!creator) return;
    try {
      if (elements.saveDescriptionButton) elements.saveDescriptionButton.disabled = true;
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = true;

      const data = await apiFetch(
        `/api/creators/description/draft?creatorId=${encodeURIComponent(creator.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ markdown: elements.descriptionInput?.value || "" })
        }
      );

      descriptionWorkspace = data?.workspace ?? descriptionWorkspace;
      descriptionFormOrigin = descriptionSnapshot();
      showDescriptionMessage("Brouillon enregistré.", "success");
      renderDescriptionState();
    } catch (error) {
      showDescriptionMessage(error.message, "error");
    } finally {
      if (elements.saveDescriptionButton) elements.saveDescriptionButton.disabled = false;
      renderDescriptionState();
    }
  }

  async function submitDescription(event) {
    event.preventDefault();
    if (!creator) return;

    try {
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = true;
      if (elements.saveDescriptionButton) elements.saveDescriptionButton.disabled = true;

      await apiFetch(
        `/api/creators/description/draft?creatorId=${encodeURIComponent(creator.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ markdown: elements.descriptionInput?.value || "" })
        }
      );

      const result = await apiFetch(
        `/api/creators/description/submit?creatorId=${encodeURIComponent(creator.id)}`,
        { method: "POST" }
      );

      descriptionFormOrigin = descriptionSnapshot();

      if (result?.automaticallyApproved) {
        creator.descriptionMarkdown = elements.descriptionInput.value;
        toMarkdownHtml(creator.descriptionMarkdown);
        showDescriptionMessage("Description publiée.", "success");
      } else {
        showDescriptionMessage("Description envoyée à la modération.", "success");
      }

      await loadDescriptionWorkspace();
    } catch (error) {
      showDescriptionMessage(error.message, "error");
    } finally {
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
      if (elements.saveDescriptionButton) elements.saveDescriptionButton.disabled = false;
      renderDescriptionState();
    }
  }

  // ====== Chargement page ======
  async function loadCurrentUser() {
    try {
      const data = await apiFetch("/api/auth/me");
      currentUser = data.user ?? data ?? null;
    } catch (_err) {
      currentUser = null;
    }
  }

  async function loadPage() {
    show(elements.loading, true);
    show(elements.errorState, false);
    show(elements.profile, false);

    const slug = getSlugFromUrl();
    if (!slug) {
      throw new Error("Aucun créateur sélectionné.");
    }

    const creatorData = await apiFetch(`/api/creators/${encodeURIComponent(slug)}`);
    if (!creatorData?.creator) throw new Error("Créateur introuvable.");
    creator = creatorData.creator;

    await loadCurrentUser();
    canManage = canUserManageCreator();

    await loadGoalsOnly();
    fillProfile();

    if (!creator) throw new Error("Profil créateur invalide.");

    renderGoals();

    show(elements.profile, true);
  }

  // ====== Listeners ======
  onSafe(elements.editGoalsButton, "click", () => {
    document.querySelector(".goals-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  onSafe(elements.addGoalButton, "click", () => openGoalDialog());
  onSafe(elements.goalForm, "submit", saveGoal);
  onSafe(elements.deleteGoalButton, "click", deleteGoal);
  onSafe(elements.closeGoalDialog, "click", requestCloseGoalDialog);
  onSafe(elements.cancelGoalButton, "click", requestCloseGoalDialog);
  onSafe(elements.goalDialog, "cancel", (event) => {
    event.preventDefault();
    requestCloseGoalDialog();
  });

  onSafe(elements.editDescriptionButton, "click", openDescriptionDialog);
  onSafe(elements.saveDescriptionButton, "click", saveDescriptionDraft);
  onSafe(elements.descriptionForm, "submit", submitDescription);
  onSafe(elements.closeDescriptionDialog, "click", requestCloseDescription);
  onSafe(elements.cancelDescriptionButton, "click", requestCloseDescription);
  onSafe(elements.descriptionDialog, "cancel", (event) => {
    event.preventDefault();
    requestCloseDescription();
  });

  // ====== Init ======
  (async function init() {
    try {
      await loadPage();
    } catch (error) {
      console.error(error);
      show(elements.loading, false);
      show(elements.profile, false);
      show(elements.errorState, true);

      if (elements.errorMessage) {
        elements.errorMessage.textContent =
          error.message || "Impossible de charger le profil.";
      }
    } finally {
      // sécurité contre chargement infini
      if (elements.loading) elements.loading.hidden = true;
      if (!creator || !elements.profile?.hidden) {
        if (creator && elements.profile) elements.profile.hidden = false;
      }
    }
  })();
})();
