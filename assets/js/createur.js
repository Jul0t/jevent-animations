(() => {
  "use strict";

  const API_URL = "https://api-beta.jevent.julot.fr";
  const TIMEOUT_MS = 12000;

  const $ = (selector) => document.querySelector(selector);

  const elements = {
    loading: $("#loading"),
    errorState: $("#errorState"),
    errorMessage: $("#errorMessage"),
    profile: $("#profile"),

    profileBanner: $("#profileBanner"),
    creatorAvatar: $("#creatorAvatar"),
    creatorName: $("#creatorName"),
    creatorLogin: $("#creatorLogin"),
    liveStatus: $("#liveStatus"),
    twitchButton: $("#twitchButton"),
    donationButton: $("#donationButton"),
    description: $("#description"),
    liveInformation: $("#liveInformation"),

    editGoalsButton: $("#editGoalsButton"),
    addGoalButton: $("#addGoalButton"),
    goalsList: $("#goalsList"),
    goalsEmpty: $("#goalsEmpty"),

    // Goal modal
    goalDialog: $("#goalDialog"),
    goalForm: $("#goalForm"),
    goalDialogTitle: $("#goalDialogTitle"),
    goalPublicId: $("#goalPublicId"),
    goalTitle: $("#goalTitle"),
    goalAmount: $("#goalAmount"),
    goalDescription: $("#goalDescription"),
    goalFormMessage: $("#goalFormMessage"),
    saveGoalButton: $("#saveGoalButton"),
    deleteGoalButton: $("#deleteGoalButton"),
    closeGoalDialog: $("#closeGoalDialog"),
    cancelGoalButton: $("#cancelGoalButton"),

    // Description modal
    editDescriptionButton: $("#editDescriptionButton"),
    descriptionDialog: $("#descriptionDialog"),
    descriptionForm: $("#descriptionForm"),
    descriptionInput: $("#descriptionInput"),
    descriptionState: $("#descriptionState"),
    descriptionMessage: $("#descriptionMessage"),
    saveDescriptionButton: $("#saveDescriptionButton"),
    submitDescriptionButton: $("#submitDescriptionButton"),
    closeDescriptionDialog: $("#closeDescriptionDialog"),
    cancelDescriptionButton: $("#cancelDescriptionButton")
  };

  let creator = null;
  let currentUser = null;
  let canManage = false;
  let publicGoals = [];
  let manageableGoals = [];
  let descriptionWorkspace = null;
  let goalFormOrigin = "";
  let descFormOrigin = "";

  const painter = `P${"ath"}`; // garde-fou anti-linter inutile, ignoré

  function onSafe(el, type, fn) {
    if (el) el.addEventListener(type, fn);
  }

  function svgPencil() {
    return `
      <svg class="icon-pencil" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16v4zm2-3.2 9-9 1.2 1.2-9 9H6v-1.2zM17.5 6.5l1-1a1.4 1.4 0 0 1 2 2l-1 1-2-2z"/>
      </svg>
    `;
  }

  function fmtMoney(cents, currency = "EUR") {
    const num = Number(cents || 0) / 100;
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: num % 1 === 0 ? 0 : 2
    }).format(num);
  }

  function fmtNumber(v) {
    return new Intl.NumberFormat("fr-FR").format(Number(v || 0));
  }

  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);
  }

  function setMessage(element, message, type = "") {
    if (!element) return;
    element.textContent = message;
    element.className = "form-message";
    if (type) element.classList.add(`is-${type}`);
  }

  function setVisibility(showLoading, showProfile, showError) {
    if (elements.loading) elements.loading.hidden = !showLoading;
    if (elements.profile) elements.profile.hidden = !showProfile;
    if (elements.errorState) elements.errorState.hidden = !showError;
  }

  async function apiFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(API_URL + path, {
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    clearTimeout(timer);

    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function safeGet(path) {
    try { return await apiFetch(path); } catch (e) { console.warn("[safeGet]", path, e.message); return null; }
  }

  function routeDescriptionId() {
    return new URLSearchParams(location.search).get("slug");
  }

  function toMarkdownHtml(src) {
    if (!elements.description) return;
    elements.description.replaceChildren();

    const content = String(src || "").trim();
    if (!content) {
      const p = document.createElement("p");
      p.className = "markdown-empty";
      p.textContent = "Ce créateur n’a pas encore publié de description.";
      elements.description.append(p);
      return;
    }

    if (!window.marked || !window.DOMPurify) {
      elements.description.textContent = content;
      return;
    }

    const html = window.marked.parse(content, { gfm: true, breaks: true });
    elements.description.innerHTML = window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["p","br","strong","em","del","h1","h2","h3","h4","ul","ol","li","blockquote","pre","code","hr"],
      ALLOWED_ATTR: [],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false
    });
  }

  function renderLive() {
    elements.liveStatus.replaceChildren();
    elements.liveInformation.replaceChildren();

    const isLive = !!creator?.isLive && !!creator?.live;
    if (!isLive) {
      const b = document.createElement("span");
      b.className = "status-badge offline";
      b.textContent = "Hors ligne";
      elements.liveStatus.appendChild(b);
      addInfo("Statut", "La chaîne est hors ligne.");
      return;
    }

    const live = creator.live || {};
    elements.liveStatus.append(
      Object.assign(document.createElement("span"), { className: "status-badge live", textContent: "En direct" }),
      Object.assign(document.createElement("span"), { className: "status-detail", textContent: `${fmtNumber(live.viewerCount)} spectateur${Number(live.viewerCount) > 1 ? "s" : ""}` }),
      Object.assign(document.createElement("span"), { className: "status-detail", textContent: live.gameName || "Catégorie inconnue" })
    );

    addInfo("Titre", live.title || "Live du JEvent 26");
    addInfo("Catégorie", live.gameName || "—");
    addInfo("Spectateurs", fmtNumber(live.viewerCount || 0));
    addInfo("Démarré le", fmtDate(live.startedAt));
    if (live.thumbnailUrl) {
      elements.profileBanner.style.backgroundImage = `url("${live.thumbnailUrl}")`;
      elements.profileBanner.classList.add("has-image");
    }
  }

  function addInfo(label, value) {
    const row = document.createElement("div");
    row.className = "information-row";
    const l = document.createElement("span");
    l.className = "information-label";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "information-value";
    v.textContent = value;
    row.append(l, v);
    elements.liveInformation.append(row);
  }

  function canUserManageCurrentCreator() {
    if (!currentUser || !creator) return false;
    const perms = currentUser.permissions || {};
    if (perms.isSuperAdmin || perms.isGlobalModerator) return true;

    const creatorId = Number(creator.id);
    return (currentUser.creatorMemberships || []).some((m) =>
      Number(m.creatorId) === creatorId &&
      ["owner","delegate"].includes(String(m.memberRole))
    );
  }

  function fillProfile() {
    if (!creator) return;

    document.title = `${creator.twitchDisplayName} — JEvent 26`;
    elements.creatorAvatar.src = creator.twitchProfileImageUrl || "/assets/jevent_logo.png";
    elements.creatorAvatar.alt = `Avatar de ${creator.twitchDisplayName}`;
    elements.creatorName.textContent = creator.twitchDisplayName;
    elements.creatorLogin.textContent = `@${creator.twitchLogin}`;

    elements.twitchButton.href = creator.twitchUrl || `https://twitch.tv/${creator.twitchLogin}`;
    if (creator.donationUrl) {
      elements.donationButton.href = creator.donationUrl;
      elements.donationButton.classList.remove("is-disabled");
      elements.donationButton.removeAttribute("aria-disabled");
    } else {
      elements.donationButton.href = "#";
      elements.donationButton.classList.add("is-disabled");
      elements.donationButton.setAttribute("aria-disabled", "true");
    }

    toMarkdownHtml(creator.descriptionMarkdown || "");

    elements.editGoalsButton.hidden = !canManage;
    elements.addGoalButton.hidden = !canManage;
    elements.editDescriptionButton.hidden = !canManage;
    if (elements.editGoalsButton) elements.editGoalsButton.innerHTML = svgPencil();
    if (elements.editDescriptionButton) elements.editDescriptionButton.innerHTML = svgPencil();

    renderLive();
    renderGoals();
  }

  function renderGoals() {
    elements.goalsList.replaceChildren();

    const goals = canManage ? manageableGoals : publicGoals;
    const visible = canManage ? goals : (goals || []).filter(g => String(g.status || "") !== "draft");
    if (!elements.goalsEmpty) return;

    elements.goalsEmpty.hidden = visible.length > 0;
    if (visible.length === 0) return;

    for (const goal of visible) {
      const reached = !!goal.reached;
      const item = document.createElement("article");
      item.className = "goal-item";
      if (reached) item.classList.add("is-reached");

      const marker = document.createElement("div");
      marker.className = "goal-marker";
      marker.append(Object.assign(document.createElement("span"), {
        className: "goal-marker-amount",
        textContent: fmtMoney(goal.thresholdCents, goal.currency || "EUR")
      }));
      if (reached) {
        marker.prepend(Object.assign(document.createElement("span"), {
          className: "goal-marker-check",
          textContent: "✓"
        }));
      }

      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "goal-title";
      title.textContent = goal.title || "(Sans titre)";
      body.append(title);

      if (goal.descriptionMarkdown) {
        const desc = document.createElement("p");
        desc.className = "goal-description";
        desc.textContent = goal.descriptionMarkdown;
        body.append(desc);
      }

      const state = document.createElement("span");
      state.className = "goal-state";
      state.textContent = reached
        ? ((goal.status === "completed") ? "Objectif réalisé" : "Objectif atteint")
        : ((goal.status === "draft") ? "Brouillon" : "À débloquer");
      body.append(state);

      item.append(marker, body);

      if (canManage) {
        const showEdit =
          goal.scopeType === "global" ||
          (goal.scopeType === "creator" && Number(goal.creatorId ?? goal.creator?.id ?? 0) === Number(creator.id)) ||
          (goal.scopeType === "shared" && Array.isArray(goal.sharedCreatorIds)
            ? goal.sharedCreatorIds.some(id => Number(id) === Number(creator.id))
            : false);

        if (showEdit) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "goal-edit";
          btn.title = `Modifier ${goal.title || "l’objectif"}`;
          btn.innerHTML = svgPencil();
          btn.addEventListener("click", () => openGoalDialog(goal));
          item.append(btn);
        }
      }

      elements.goalsList.append(item);
    }
  }

  function goalSnapshot() {
    return JSON.stringify({
      publicId: elements.goalPublicId?.value || "",
      title: elements.goalTitle?.value.trim() || "",
      amount: elements.goalAmount?.value || "",
      description: elements.goalDescription?.value.trim() || ""
    });
  }

  function openGoalDialog(goal = null) {
    if (!elements.goalDialog) return;
    elements.goalForm?.reset();
    setMessage(elements.goalFormMessage, "");

    if (elements.deleteGoalButton) elements.deleteGoalButton.hidden = true;

    if (!goal) {
      if (elements.goalDialogTitle) elements.goalDialogTitle.textContent = "Ajouter un objectif";
      if (elements.goalPublicId) elements.goalPublicId.value = "";
      goalFormOrigin = goalSnapshot();
      elements.goalDialog.showModal();
      elements.goalTitle?.focus();
      return;
    }

    if (elements.goalDialogTitle) elements.goalDialogTitle.textContent = "Modifier l’objectif";
    elements.goalPublicId.value = goal.publicId || "";
    elements.goalTitle.value = goal.title || "";
    elements.goalAmount.value = ((Number(goal.thresholdCents || 0) / 100).toFixed(2));
    elements.goalDescription.value = goal.descriptionMarkdown || "";
    if (elements.deleteGoalButton) elements.deleteGoalButton.hidden = false;

    goalFormOrigin = goalSnapshot();
    elements.goalDialog.showModal();
    elements.goalTitle.focus();
  }

  function requestCloseGoalDialog() {
    const changed = goalSnapshot() !== goalFormOrigin;
    if (changed && !window.confirm("Fermer sans enregistrer les modifications ?")) return;
    elements.goalDialog?.close();
  }

  async function saveGoal(e) {
    e.preventDefault();

    const title = (elements.goalTitle?.value || "").trim();
    const amount = Number(elements.goalAmount?.value || 0);

    if (!title) {
      setMessage(elements.goalFormMessage, "Le titre est obligatoire.", "error");
      elements.goalTitle?.focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage(elements.goalFormMessage, "Le montant doit être supérieur à 0.", "error");
      elements.goalAmount?.focus();
      return;
    }

    const payload = {
      creatorId: Number(creator.id),
      title,
      descriptionMarkdown: (elements.goalDescription?.value || "").trim(),
      targetAmountCents: Math.round(amount * 100),
      status: "active"
    };

    const publicId = elements.goalPublicId?.value?.trim();
    try {
      elements.saveGoalButton.disabled = true;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = true;

      if (publicId) {
        await apiFetch(`/api/goals/manage/${encodeURIComponent(publicId)}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/goals/manage", { method: "POST", body: JSON.stringify(payload) });
      }

      await reloadGoals();
      renderGoals();
      elements.goalDialog?.close();
      setMessage(elements.goalFormMessage, "Enregistré.", "success");
    } catch (err) {
      setMessage(elements.goalFormMessage, err.message || "Erreur lors de l’enregistrement.", "error");
    } finally {
      elements.saveGoalButton.disabled = false;
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = false;
    }
  }

  async function deleteGoal() {
    const publicId = elements.goalPublicId?.value?.trim();
    if (!publicId) return;
    if (!window.confirm("Supprimer définitivement cet objectif ?")) return;

    try {
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = true;
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = true;

      await apiFetch(`/api/goals/manage/${encodeURIComponent(publicId)}`, { method: "DELETE" });
      await reloadGoals();
      renderGoals();
      elements.goalDialog?.close();
    } catch (err) {
      setMessage(elements.goalFormMessage, err.message || "Suppression impossible.", "error");
    } finally {
      if (elements.deleteGoalButton) elements.deleteGoalButton.disabled = false;
      if (elements.saveGoalButton) elements.saveGoalButton.disabled = false;
    }
  }

  async function loadGoals() {
    const slug = new URLSearchParams(location.search).get("slug");
    const publicData = await apiFetch(`/api/goals/creator/${encodeURIComponent(slug)}`);
    publicGoals = Array.isArray(publicData?.goals) ? publicData.goals : [];

    if (canManage) {
      const manageData = await apiFetch("/api/goals/manage");
      manageableGoals = Array.isArray(manageData?.goals) ? manageData.goals : [];
    } else {
      manageableGoals = [];
    }
  }

  async function reloadGoals() {
    try { await loadGoals(); } catch (err) {
      console.error("Erreur reload goals:", err);
      publicGoals = [];
      manageableGoals = [];
    }
  }

  // Description
  function descSnapshot() {
    return elements.descriptionInput?.value || "";
  }

  function setDescriptionState() {
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
        `La dernière proposition a été refusée : ${descriptionWorkspace.lastRejected.moderationNote || "aucune note"}`;
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
      return;
    }

    elements.descriptionState.textContent = "La description sera envoyée à la modération.";
    if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
  }

  async function loadDescriptionWorkspace() {
    if (!creator) return;

    const route =
      `/api/creators/description/workspace?creatorId=${encodeURIComponent(creator.id)}`;

    try {
      descriptionWorkspace = await apiFetch(route);
      elements.descriptionInput.value =
        descriptionWorkspace?.draft?.markdown ??
        descriptionWorkspace?.pending?.markdown ??
        creator.descriptionMarkdown ??
        "";
      setDescriptionState();
      setMessage(elements.descriptionMessage, "");
      descFormOrigin = descSnapshot();
    } catch (e) {
      // si ce n'est pas encore dispo côté API
      setMessage(elements.descriptionMessage, "Édition indisponible pour le moment.", "error");
      if (elements.descriptionState) elements.descriptionState.textContent = "";
      throw e;
    }
  }

  async function openDescriptionDialog() {
    if (!elements.descriptionDialog) return;
    try {
      await loadDescriptionWorkspace();
    } catch {
      return;
    }
    elements.descriptionDialog.showModal();
    setMessage(elements.descriptionMessage, "");
    elements.descriptionInput?.focus();
  }

  function requestCloseDescriptionDialog() {
    const changed = descSnapshot() !== descFormOrigin;
    if (changed && !window.confirm("Fermer sans enregistrer le brouillon ?")) return;
    elements.descriptionDialog?.close();
  }

  async function saveDescriptionDraft() {
    try {
      elements.saveDescriptionButton.disabled = true;
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = true;

      const data = await apiFetch(
        `/api/creators/description/draft?creatorId=${encodeURIComponent(creator.id)}`,
        { method: "PUT", body: JSON.stringify({ markdown: elements.descriptionInput.value || "" }) }
      );

      if (data?.workspace) descriptionWorkspace = data.workspace;
      descFormOrigin = descSnapshot();
      setMessage(elements.descriptionMessage, "Brouillon enregistré.", "success");
      setDescriptionState();
    } catch (e) {
      setMessage(elements.descriptionMessage, e.message || "Erreur de sauvegarde.", "error");
    } finally {
      elements.saveDescriptionButton.disabled = false;
      if (elements.submitDescriptionButton) elements.submitDescriptionButton.disabled = false;
    }
  }

  async function submitDescription(e) {
    e.preventDefault();

    try {
      elements.submitDescriptionButton.disabled = true;
      elements.saveDescriptionButton.disabled = true;

      await apiFetch(
        `/api/creators/description/draft?creatorId=${encodeURIComponent(creator.id)}`,
        { method: "PUT", body: JSON.stringify({ markdown: elements.descriptionInput.value || "" }) }
      );

      const result = await apiFetch(
        `/api/creators/description/submit?creatorId=${encodeURIComponent(creator.id)}`,
        { method: "POST" }
      );

      if (result?.automaticallyApproved) {
        creator.descriptionMarkdown = elements.descriptionInput.value;
        toMarkdownHtml(creator.descriptionMarkdown);
        setMessage(elements.descriptionMessage, "Description publiée.", "success");
      } else {
        setMessage(elements.descriptionMessage, "Description envoyée à la modération.", "success");
      }

      await loadDescriptionWorkspace();
      descFormOrigin = descSnapshot();
    } catch (e) {
      setMessage(elements.descriptionMessage, e.message || "Erreur de validation.", "error");
    } finally {
      elements.submitDescriptionButton.disabled = false;
      elements.saveDescriptionButton.disabled = false;
      setDescriptionState();
    }
  }

  async function loadCurrentUser() {
    try {
      const data = await apiFetch("/api/auth/me");
      currentUser = data.user || data || null;
    } catch {
      currentUser = null;
    }
  }

  async function loadCreator() {
    const slug = routeDescriptionId();
    if (!slug) throw new Error("Aucun créateur sélectionné.");

    const data = await apiFetch(`/api/creators/${encodeURIComponent(slug)}`);
    if (!data?.creator) throw new Error("Créateur introuvable.");

    creator = data.creator;
    await loadCurrentUser();
    canManage = canUserManageCurrentCreator();

    await loadGoals();
    fillProfile();
  }

  async function init() {
    try {
      setVisibility(true, false, false);
      await loadCreator();
      setVisibility(false, true, false);
    } catch (err) {
      console.error(err);
      setVisibility(false, false, true);
      elements.errorMessage.textContent = err.message || "Erreur de chargement.";
    }
  }

  // Events
  onSafe(elements.editGoalsButton, "click", () => {
    $(".goals-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  onSafe(elements.addGoalButton, "click", () => openGoalDialog());
  onSafe(elements.goalForm, "submit", saveGoal);
  onSafe(elements.deleteGoalButton, "click", deleteGoal);
  onSafe(elements.closeGoalDialog, "click", requestCloseGoalDialog);
  onSafe(elements.cancelGoalButton, "click", requestCloseGoalDialog);
  onSafe(elements.goalDialog, "cancel", (e) => { e.preventDefault(); requestCloseGoalDialog(); });

  onSafe(elements.editDescriptionButton, "click", openDescriptionDialog);
  onSafe(elements.saveDescriptionButton, "click", saveDescriptionDraft);
  onSafe(elements.descriptionForm, "submit", submitDescription);
  onSafe(elements.closeDescriptionDialog, "click", requestCloseDescriptionDialog);
  onSafe(elements.cancelDescriptionButton, "click", requestCloseDescriptionDialog);
  onSafe(elements.descriptionDialog, "cancel", (e) => { e.preventDefault(); requestCloseDescriptionDialog(); });

  init();
})();
