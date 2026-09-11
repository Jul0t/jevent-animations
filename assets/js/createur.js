(() => {
    "use strict";

    const API_URL =
        "https://api-beta.jevent.julot.fr";

    const elements = {
        loading:
            document.querySelector("#loading"),

        errorState:
            document.querySelector("#errorState"),

        errorMessage:
            document.querySelector("#errorMessage"),

        profile:
            document.querySelector("#profile"),

        profileBanner:
            document.querySelector("#profileBanner"),

        creatorAvatar:
            document.querySelector("#creatorAvatar"),

        creatorName:
            document.querySelector("#creatorName"),

        creatorLogin:
            document.querySelector("#creatorLogin"),

        liveStatus:
            document.querySelector("#liveStatus"),

        twitchButton:
            document.querySelector("#twitchButton"),

        donationButton:
            document.querySelector("#donationButton"),

        description:
            document.querySelector("#description"),

        liveInformation:
            document.querySelector("#liveInformation"),

        goalsList:
            document.querySelector("#goalsList"),

        goalsEmpty:
            document.querySelector("#goalsEmpty"),

        editGoalsButton:
            document.querySelector("#editGoalsButton"),

        addGoalButton:
            document.querySelector("#addGoalButton"),

        goalDialog:
            document.querySelector("#goalDialog"),

        goalForm:
            document.querySelector("#goalForm"),

        goalDialogTitle:
            document.querySelector("#goalDialogTitle"),

        goalPublicId:
            document.querySelector("#goalPublicId"),

        goalTitle:
            document.querySelector("#goalTitle"),

        goalAmount:
            document.querySelector("#goalAmount"),

        goalDescription:
            document.querySelector("#goalDescription"),

        goalStatus:
            document.querySelector("#goalStatus"),

        goalFormMessage:
            document.querySelector("#goalFormMessage"),

        saveGoalButton:
            document.querySelector("#saveGoalButton"),

        deleteGoalButton:
            document.querySelector("#deleteGoalButton"),

        closeGoalDialog:
            document.querySelector("#closeGoalDialog"),

        cancelGoalButton:
            document.querySelector("#cancelGoalButton")
    };

    let creator = null;
    let publicGoals = [];
    let manageableGoals = [];
    let currentUser = null;
    let canManage = false;
    let formOrigin = "";

    function getSlug() {
        return new URL(
            window.location.href
        ).searchParams.get("slug");
    }

    async function apiFetch(
        path,
        options = {}
    ) {
        const response = await fetch(
            API_URL + path,
            {
                credentials: "include",

                headers: {
                    Accept: "application/json",
                    ...(
                        options.body
                            ? {
                                "Content-Type":
                                    "application/json"
                            }
                            : {}
                    ),
                    ...(options.headers ?? {})
                },

                ...options
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!response.ok) {
            const error = new Error(
                data.error ??
                data.message ??
                `Erreur HTTP ${response.status}`
            );

            error.status = response.status;
            throw error;
        }

        return data;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat(
            "fr-FR"
        ).format(Number(value ?? 0));
    }

    function formatMoney(
        cents,
        currency = "EUR"
    ) {
        return new Intl.NumberFormat(
            "fr-FR",
            {
                style: "currency",
                currency,
                maximumFractionDigits:
                    Number(cents) % 100 === 0
                        ? 0
                        : 2
            }
        ).format(Number(cents ?? 0) / 100);
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Paris"
            }
        ).format(date);
    }

    function textElement(
        tag,
        className,
        text
    ) {
        const element =
            document.createElement(tag);

        if (className) {
            element.className = className;
        }

        element.textContent = text;
        return element;
    }

    function renderMarkdown() {
        const source = String(
            creator?.descriptionMarkdown ?? ""
        ).trim();

        elements.description.replaceChildren();

        if (!source) {
            elements.description.append(
                textElement(
                    "p",
                    "markdown-empty",
                    "Ce créateur n’a pas encore publié de description."
                )
            );

            return;
        }

        if (
            typeof window.marked ===
            "undefined" ||
            typeof window.DOMPurify ===
            "undefined"
        ) {
            elements.description.textContent =
                source;

            return;
        }

        const html = window.marked.parse(
            source,
            {
                gfm: true,
                breaks: true
            }
        );

        elements.description.innerHTML =
            window.DOMPurify.sanitize(
                html,
                {
                    ALLOWED_TAGS: [
                        "p",
                        "br",
                        "strong",
                        "em",
                        "del",
                        "h1",
                        "h2",
                        "h3",
                        "h4",
                        "ul",
                        "ol",
                        "li",
                        "blockquote",
                        "pre",
                        "code",
                        "hr"
                    ],

                    ALLOWED_ATTR: [],

                    ALLOW_DATA_ATTR: false,
                    ALLOW_ARIA_ATTR: false,
                    SANITIZE_NAMED_PROPS: true
                }
            );
    }

    function addInformation(
        label,
        value
    ) {
        const row =
            document.createElement("div");

        row.className = "information-row";

        row.append(
            textElement(
                "span",
                "information-label",
                label
            ),

            textElement(
                "span",
                "information-value",
                value
            )
        );

        elements.liveInformation.append(row);
    }

    function renderLive() {
        elements.liveStatus.replaceChildren();
        elements.liveInformation.replaceChildren();

        const isLive =
            Boolean(creator.isLive && creator.live);

        if (!isLive) {
            elements.liveStatus.append(
                textElement(
                    "span",
                    "status-badge offline",
                    "Hors ligne"
                )
            );

            addInformation(
                "Statut",
                "La chaîne est actuellement hors ligne."
            );

            return;
        }

        elements.liveStatus.append(
            textElement(
                "span",
                "status-badge live",
                "En direct"
            ),

            textElement(
                "span",
                "status-detail",
                `${formatNumber(
                    creator.live.viewerCount
                )} spectateur${Number(
                    creator.live.viewerCount
                ) > 1
                    ? "s"
                    : ""
                }`
            ),

            textElement(
                "span",
                "status-detail",
                creator.live.gameName ||
                "Catégorie inconnue"
            )
        );

        addInformation(
            "Titre",
            creator.live.title ||
            "Live du JEvent 26"
        );

        addInformation(
            "Catégorie",
            creator.live.gameName || "—"
        );

        addInformation(
            "Spectateurs",
            formatNumber(
                creator.live.viewerCount
            )
        );

        addInformation(
            "Démarré le",
            formatDate(
                creator.live.startedAt
            )
        );

        if (creator.live.thumbnailUrl) {
            elements.profileBanner.style
                .backgroundImage =
                `url("${creator.live.thumbnailUrl}")`;

            elements.profileBanner.classList.add(
                "has-image"
            );
        }
    }

    function fillProfile() {
        document.title =
            `${creator.twitchDisplayName} — JEvent 26`;

        elements.creatorAvatar.src =
            creator.twitchProfileImageUrl ||
            "/assets/jevent_logo.png";

        elements.creatorAvatar.alt =
            `Avatar de ${creator.twitchDisplayName}`;

        elements.creatorName.textContent =
            creator.twitchDisplayName;

        elements.creatorLogin.textContent =
            `@${creator.twitchLogin}`;

        elements.twitchButton.href =
            creator.twitchUrl ??
            `https://twitch.tv/${creator.twitchLogin}`;

        if (creator.donationUrl) {
            elements.donationButton.href =
                creator.donationUrl;

            elements.donationButton.classList
                .remove("is-disabled");

            elements.donationButton.removeAttribute(
                "aria-disabled"
            );
        } else {
            elements.donationButton.href = "#";

            elements.donationButton.classList
                .add("is-disabled");

            elements.donationButton.setAttribute(
                "aria-disabled",
                "true"
            );
        }

        renderMarkdown();
        renderLive();
    }

    function getGoalCreatorId(goal) {
        return Number(
            goal.creatorId ??
            goal.creator?.id ??
            0
        );
    }

    function getVisibleManagedGoals() {
        if (!creator) {
            return [];
        }

        return manageableGoals.filter(goal => {
            if (goal.scopeType === "global") {
                return true;
            }

            if (
                goal.scopeType === "creator" &&
                getGoalCreatorId(goal) ===
                Number(creator.id)
            ) {
                return true;
            }

            return (
                goal.scopeType === "shared" &&
                Array.isArray(
                    goal.sharedCreatorIds
                ) &&
                goal.sharedCreatorIds.some(
                    creatorId =>
                        Number(creatorId) ===
                        Number(creator.id)
                )
            );
        });
    }

    function renderGoals() {
        elements.goalsList.replaceChildren();

        const goals = canManage
            ? getVisibleManagedGoals()
            : publicGoals;

        const visibleGoals = goals.filter(
            goal =>
                canManage ||
                goal.status !== "draft"
        );

        elements.goalsEmpty.hidden =
            visibleGoals.length !== 0;

        for (const goal of visibleGoals) {
            const reached =
                Boolean(goal.reached) ||
                goal.status === "reached" ||
                goal.status === "completed";

            const item =
                document.createElement("article");

            item.className = "goal-item";

            if (reached) {
                item.classList.add("is-reached");
            }

            const marker =
                document.createElement("div");

            marker.className = "goal-marker";
            if (reached) {
                marker.append(
                    textElement(
                        "span",
                        "goal-marker-check",
                        "✓"
                    )
                );
            }

            marker.append(
                textElement(
                    "span",
                    "goal-marker-amount",
                    formatMoney(
                        goal.thresholdCents,
                        goal.currency
                    )
                )
            );


            const content =
                document.createElement("div");

            const title =
                textElement(
                    "h3",
                    "goal-title",
                    goal.title
                );

            content.append(title);

            if (goal.descriptionMarkdown) {
                content.append(
                    textElement(
                        "p",
                        "goal-description",
                        goal.descriptionMarkdown
                    )
                );
            }

            const statusText =
                reached
                    ? (
                        goal.status === "completed"
                            ? "Objectif réalisé"
                            : "Objectif atteint"
                    )
                    : (
                        goal.status === "draft"
                            ? "Brouillon"
                            : "À débloquer"
                    );

            content.append(
                textElement(
                    "span",
                    "goal-state",
                    statusText
                )
            );

            item.append(marker, content);

            if (
                canManage &&
                goal.scopeType === "creator" &&
                getGoalCreatorId(goal) ===
                Number(creator.id)
            ) {
                const edit =
                    document.createElement("button");

                edit.type = "button";
                edit.className = "goal-edit";
                edit.innerHTML = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 20h4L19 9l-4-4L4 16v4zm2-3.2
         9-9 1.2 1.2-9 9H6v-1.2zM17.5
         6.5l1-1a1.4 1.4 0 0 1 2 2l-1
         1-2-2z"
    />
  </svg>
`;
                edit.title =
                    `Modifier ${goal.title}`;

                edit.addEventListener(
                    "click",
                    () => openGoalDialog(goal)
                );

                item.append(edit);
            }

            elements.goalsList.append(item);
        }
    }

    function formSnapshot() {
        return JSON.stringify({
            publicId:
                elements.goalPublicId.value,

            title:
                elements.goalTitle.value.trim(),

            amount:
                elements.goalAmount.value,

            description:
                elements.goalDescription.value
                    .trim(),
        });
    }

    function resetGoalForm() {
        elements.goalForm.reset();
        elements.goalPublicId.value = "";

        elements.goalFormMessage.textContent =
            "";

        elements.goalFormMessage.className =
            "form-message";

        elements.deleteGoalButton.hidden = true;
    }

    function openGoalDialog(goal = null) {
        resetGoalForm();

        if (goal) {
            elements.goalDialogTitle.textContent =
                "Modifier l’objectif";

            elements.goalPublicId.value =
                goal.publicId;

            elements.goalTitle.value =
                goal.title ?? "";

            elements.goalAmount.value =
                (
                    Number(goal.thresholdCents ?? 0) /
                    100
                ).toFixed(2);

            elements.goalDescription.value =
                goal.descriptionMarkdown ?? "";

            elements.deleteGoalButton.hidden =
                false;
        } else {
            elements.goalDialogTitle.textContent =
                "Ajouter un objectif";
        }

        elements.goalDialog.showModal();
        formOrigin = formSnapshot();

        elements.goalTitle.focus();
    }

    function requestCloseDialog() {
        const changed =
            formSnapshot() !== formOrigin;

        if (
            changed &&
            !window.confirm(
                "Fermer sans enregistrer les modifications ?"
            )
        ) {
            return;
        }

        elements.goalDialog.close();
    }

    function showFormMessage(
        message,
        type = ""
    ) {
        elements.goalFormMessage.textContent =
            message;

        elements.goalFormMessage.className =
            "form-message";

        if (type) {
            elements.goalFormMessage.classList.add(
                `is-${type}`
            );
        }
    }

    async function reloadGoals() {
        const [publicData, manageData] =
            await Promise.all([
                apiFetch(
                    "/api/goals/creator/" +
                    encodeURIComponent(getSlug())
                ),

                canManage
                    ? apiFetch("/api/goals/manage")
                    : Promise.resolve({
                        goals: []
                    })
            ]);

        publicGoals = Array.isArray(
            publicData.goals
        )
            ? publicData.goals
            : [];

        manageableGoals = Array.isArray(
            manageData.goals
        )
            ? manageData.goals
            : [];

        renderGoals();
    }

    async function saveGoal(event) {
        event.preventDefault();

        const title =
            elements.goalTitle.value.trim();

        const amount =
            Number(elements.goalAmount.value);

        if (!title) {
            showFormMessage(
                "Le titre est obligatoire.",
                "error"
            );

            elements.goalTitle.focus();
            return;
        }

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {
            showFormMessage(
                "Le montant doit être supérieur à zéro.",
                "error"
            );

            elements.goalAmount.focus();
            return;
        }

        const publicId =
            elements.goalPublicId.value;

        const payload = {
            creatorId: Number(creator.id),
            title,
            descriptionMarkdown:
                elements.goalDescription.value
                    .trim(),
            targetAmountCents:
                Math.round(amount * 100),

            status: "active"
        };

        elements.saveGoalButton.disabled = true;
        elements.deleteGoalButton.disabled = true;

        try {
            if (publicId) {
                await apiFetch(
                    "/api/goals/manage/" +
                    encodeURIComponent(publicId),
                    {
                        method: "PUT",
                        body: JSON.stringify(payload)
                    }
                );
            } else {
                await apiFetch(
                    "/api/goals/manage",
                    {
                        method: "POST",
                        body: JSON.stringify(payload)
                    }
                );
            }

            await reloadGoals();

            formOrigin = formSnapshot();

            elements.goalDialog.close();
        } catch (error) {
            showFormMessage(
                error.message,
                "error"
            );
        } finally {
            elements.saveGoalButton.disabled =
                false;

            elements.deleteGoalButton.disabled =
                false;
        }
    }

    async function deleteGoal() {
        const publicId =
            elements.goalPublicId.value;

        if (!publicId) {
            return;
        }

        if (
            !window.confirm(
                "Supprimer définitivement cet objectif ?"
            )
        ) {
            return;
        }

        elements.saveGoalButton.disabled = true;
        elements.deleteGoalButton.disabled = true;

        try {
            await apiFetch(
                "/api/goals/manage/" +
                encodeURIComponent(publicId),
                {
                    method: "DELETE"
                }
            );

            await reloadGoals();

            formOrigin = formSnapshot();
            elements.goalDialog.close();
        } catch (error) {
            showFormMessage(
                error.message,
                "error"
            );
        } finally {
            elements.saveGoalButton.disabled =
                false;

            elements.deleteGoalButton.disabled =
                false;
        }
    }

    function canUserManageCreator() {
        if (!currentUser || !creator) {
            return false;
        }

        const permissions =
            currentUser.permissions ?? {};

        if (
            permissions.isSuperAdmin ||
            permissions.isGlobalModerator
        ) {
            return true;
        }

        return (
            currentUser.creatorMemberships ?? []
        ).some(membership =>
            Number(membership.creatorId) ===
            Number(creator.id) &&
            ["owner", "delegate"].includes(
                membership.memberRole
            )
        );
    }

    async function loadCurrentUser() {
        try {
            const data =
                await apiFetch("/api/auth/me");

            currentUser =
                data.user ?? data;
        } catch (error) {
            if (
                error.status !== 401 &&
                error.status !== 403
            ) {
                console.warn(
                    "Impossible de vérifier la session :",
                    error
                );
            }

            currentUser = null;
        }
    }

    function descriptionSnapshot() {
        return elements.descriptionInput.value;
    }

    function showDescriptionMessage(
        message,
        type = ""
    ) {
        elements.descriptionMessage.textContent =
            message;

        elements.descriptionMessage.className =
            "form-message";

        if (type) {
            elements.descriptionMessage.classList.add(
                `is-${type}`
            );
        }
    }

    function renderDescriptionState() {
        elements.descriptionState.className =
            "description-state";

        if (descriptionWorkspace?.pending) {
            elements.descriptionState.classList.add(
                "is-pending"
            );

            elements.descriptionState.textContent =
                "Une version est en attente de validation.";

            elements.submitDescriptionButton.disabled =
                true;

            return;
        }

        if (descriptionWorkspace?.lastRejected) {
            elements.descriptionState.classList.add(
                "is-rejected"
            );

            elements.descriptionState.textContent =
                "La dernière proposition a été refusée : " +
                (
                    descriptionWorkspace
                        .lastRejected
                        .moderationNote ||
                    "aucune explication fournie"
                );

            elements.submitDescriptionButton.disabled =
                false;

            return;
        }

        elements.descriptionState.textContent =
            descriptionWorkspace?.creator
                ?.moderationBypass
                ? "La description sera publiée immédiatement."
                : "La description sera envoyée à la modération.";

        elements.submitDescriptionButton.disabled =
            false;
    }

    async function loadDescriptionWorkspace() {
        /*
         * Ces routes ciblent le créateur grâce au query string
         * utilisé par resolveCreatorAccess().
         */
        descriptionWorkspace = await apiFetch(
            "/api/creators/description/workspace" +
            "?creatorId=" +
            encodeURIComponent(creator.id)
        );

        elements.descriptionInput.value =
            descriptionWorkspace.draft?.markdown ??
            descriptionWorkspace.pending?.markdown ??
            descriptionWorkspace.creator
                ?.publicDescriptionMarkdown ??
            creator.descriptionMarkdown ??
            "";

        renderDescriptionState();

        descriptionOrigin =
            descriptionSnapshot();
    }

    async function openDescriptionDialog() {
        showDescriptionMessage("");

        try {
            await loadDescriptionWorkspace();
            elements.descriptionDialog.showModal();
            elements.descriptionInput.focus();
        } catch (error) {
            window.alert(error.message);
        }
    }

    function requestCloseDescription() {
        if (
            descriptionSnapshot() !==
            descriptionOrigin &&
            !window.confirm(
                "Fermer sans enregistrer le brouillon ?"
            )
        ) {
            return;
        }

        elements.descriptionDialog.close();
    }

    async function saveDescriptionDraft() {
        const markdown =
            elements.descriptionInput.value;

        elements.saveDescriptionButton.disabled =
            true;

        elements.submitDescriptionButton.disabled =
            true;

        try {
            const data = await apiFetch(
                "/api/creators/description/draft" +
                "?creatorId=" +
                encodeURIComponent(creator.id),
                {
                    method: "PUT",
                    body: JSON.stringify({
                        markdown
                    })
                }
            );

            descriptionWorkspace.draft =
                data.draft;

            descriptionOrigin =
                descriptionSnapshot();

            showDescriptionMessage(
                "Brouillon enregistré.",
                "success"
            );

            renderDescriptionState();
        } catch (error) {
            showDescriptionMessage(
                error.message,
                "error"
            );
        } finally {
            elements.saveDescriptionButton.disabled =
                false;

            renderDescriptionState();
        }
    }

    async function submitDescription(event) {
        event.preventDefault();

        elements.saveDescriptionButton.disabled =
            true;

        elements.submitDescriptionButton.disabled =
            true;

        try {
            await apiFetch(
                "/api/creators/description/draft" +
                "?creatorId=" +
                encodeURIComponent(creator.id),
                {
                    method: "PUT",
                    body: JSON.stringify({
                        markdown:
                            elements.descriptionInput.value
                    })
                }
            );

            const result = await apiFetch(
                "/api/creators/description/submit" +
                "?creatorId=" +
                encodeURIComponent(creator.id),
                {
                    method: "POST"
                }
            );

            descriptionOrigin =
                descriptionSnapshot();

            if (result.automaticallyApproved) {
                creator.descriptionMarkdown =
                    elements.descriptionInput.value;

                renderMarkdown();

                showDescriptionMessage(
                    "Description publiée.",
                    "success"
                );
            } else {
                showDescriptionMessage(
                    "Description envoyée à la modération.",
                    "success"
                );
            }

            await loadDescriptionWorkspace();
        } catch (error) {
            showDescriptionMessage(
                error.message,
                "error"
            );
        } finally {
            elements.saveDescriptionButton.disabled =
                false;

            renderDescriptionState();
        }
    }


    async function loadPage() {
  const slug = getSlug();
  if (!slug) {
    throw new Error("Aucun créateur sélectionné.");
  }

  try {
    const creatorData = await apiFetch("/api/creators/" + encodeURIComponent(slug));
    const goalsData = await apiFetch("/api/goals/creator/" + encodeURIComponent(slug));
    await loadCurrentUser();

    creator = creatorData.creator;
    publicGoals = Array.isArray(goalsData?.goals) ? goalsData.goals : [];

    if (!creator) throw new Error("Créateur introuvable.");

    canManage = canUserManageCreator();

    if (canManage) {
      const manageData = await apiFetch("/api/goals/manage");
      manageableGoals = Array.isArray(manageData?.goals) ? manageData.goals : [];
    } else {
      manageableGoals = [];
    }

    fillProfile();
    renderGoals();
  } catch (error) {
    console.error(error);
    elements.errorMessage.textContent = error.message || "Erreur de chargement.";
    elements.profile.hidden = true;
    elements.errorState.hidden = false;
  } finally {
    elements.loading.hidden = true;
  }
}

loadPage();

    elements.editGoalsButton.addEventListener(
        "click",
        () => {
            document.querySelector(
                ".goals-card"
            ).scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    );

    elements.addGoalButton.addEventListener(
        "click",
        () => openGoalDialog()
    );

    elements.goalForm.addEventListener(
        "submit",
        saveGoal
    );

    elements.deleteGoalButton.addEventListener(
        "click",
        deleteGoal
    );

    elements.closeGoalDialog.addEventListener(
        "click",
        requestCloseDialog
    );

    elements.cancelGoalButton.addEventListener(
        "click",
        requestCloseDialog
    );

    elements.goalDialog.addEventListener(
        "cancel",
        event => {
            event.preventDefault();
            requestCloseDialog();
        }
    );

    elements.editDescriptionButton
        .addEventListener(
            "click",
            openDescriptionDialog
        );

    elements.saveDescriptionButton
        .addEventListener(
            "click",
            saveDescriptionDraft
        );

    elements.descriptionForm
        .addEventListener(
            "submit",
            submitDescription
        );

    elements.closeDescriptionDialog
        .addEventListener(
            "click",
            requestCloseDescription
        );

    elements.cancelDescriptionButton
        .addEventListener(
            "click",
            requestCloseDescription
        );

    elements.descriptionDialog
        .addEventListener(
            "cancel",
            event => {
                event.preventDefault();
                requestCloseDescription();
            }
        );


    loadPage().catch(error => {
        elements.loading.hidden = true;
        elements.profile.hidden = true;
        elements.errorState.hidden = false;

        elements.errorMessage.textContent =
            error.message;
    });
})();