(() => {
    "use strict";

    window.createJEventCalendar = function (adapter) {
        const STEP = 15;
        const DAY_MINUTES = 1440;
        const HEIGHT = 1440; // 1 pixel par minute

        let activeCreatorId = "";
        let initializedDate = false;
        let gesture = null;
        let editorOrigin = null;

        const style = document.createElement("style");
        style.textContent = `
      .layout.je-calendar-layout {
        display: block;
      }

      .je-calendar {
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: var(--surface);
      }

      .je-calendar-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 12px;
        padding: 18px;
        border-bottom: 1px solid var(--border);
      }

      .je-calendar-toolbar label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: .85rem;
      }

      .je-calendar-toolbar input,
      .je-calendar-toolbar select {
        min-height: 42px;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: #08110b;
        color: var(--text);
        font: inherit;
      }

      .je-calendar-help {
        padding: 0 18px;
        color: var(--muted);
        line-height: 1.6;
      }

      .je-calendar-scroll {
        max-height: 72vh;
        overflow: auto;
        position: relative;
      }

      .je-calendar-grid {
        display: grid;
      }

      .je-calendar-heading {
        position: sticky;
        top: 0;
        z-index: 5;
        padding: 14px 8px;
        border-bottom: 1px solid var(--border);
        border-right: 1px solid var(--border);
        background: #102217;
        color: var(--text);
        text-align: center;
        font-weight: 800;
      }

      .je-calendar-hours {
        position: relative;
        height: ${HEIGHT}px;
        background: #08110b;
      }

      .je-calendar-hour {
        position: absolute;
        right: 9px;
        color: var(--muted);
        font-size: .75rem;
      }

      .je-calendar-day {
        position: relative;
        height: ${HEIGHT}px;
        border-right: 1px solid var(--border);
        background:
          repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,.05) 0 1px,
            transparent 1px 15px
          ),
          repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,.10) 0 1px,
            transparent 1px 60px
          );
        cursor: crosshair;
        touch-action: pan-x pan-y;
        user-select: none;
      }

      .je-calendar-event,
      .je-calendar-selection {
        position: absolute;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid #38dc69;
        border-radius: 7px;
        background: #164b2b;
        color: #f4fff7;
      }

      .je-calendar-event {
        padding: 3px 7px;
        text-align: left;
        cursor: pointer;
        font-size: .78rem;
        line-height: 1.25;
      }

      .je-calendar-event strong,
      .je-calendar-event span {
        display: block;
      }

      .je-calendar-event[data-status="draft"] {
        border-style: dashed;
        background: #183649;
        border-color: #67a9ff;
      }

      .je-calendar-event[data-status="cancelled"] {
        background: #49232c;
        border-color: #ff687d;
        opacity: .8;
      }

      .je-calendar-selection {
        left: 3px;
        right: 3px;
        z-index: 10;
        padding: 5px;
        background: rgba(0,178,55,.55);
        pointer-events: none;
      }

      .je-calendar-editor {
        width: min(900px, calc(100vw - 24px));
        max-height: 90vh;
        overflow: auto;
        padding: 0;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: #08110b;
        color: var(--text);
      }

      .je-calendar-editor::backdrop {
        background: rgba(0,0,0,.7);
      }

      .je-calendar-editor > .card {
        border: 0;
        box-shadow: none;
      }

      .je-calendar-editor-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 18px;
        border-bottom: 1px solid var(--border);
      }
    `;
        document.head.append(style);

        const layout = document.querySelector(".layout");
        const listCard = document.querySelector(".entry-list-card");
        const form = document.querySelector("#programForm");
        const formCard = form.closest(".card");
        const ownerInput = document.querySelector("#primaryCreatorInput");

        if (!layout || !listCard || !formCard || !ownerInput) {
            throw new Error("Structure de la page programme incompatible.");
        }

        layout.classList.add("je-calendar-layout");
        listCard.hidden = true;

        const root = document.createElement("section");
        root.className = "je-calendar";
        root.innerHTML = `
      <div class="je-calendar-toolbar">
        <label data-owner-label>
          Calendrier du streamer
          <select data-owner></select>
        </label>

        <label>
          Premier jour
          <input data-date type="date">
        </label>

        <label>
          Jours affichés
          <select data-days>
            <option value="3">3 jours</option>
            <option value="5">5 jours</option>
            <option value="7">7 jours</option>
          </select>
        </label>

        <button type="button" class="button secondary" data-prev>
          ← Précédents
        </button>

        <button type="button" class="button secondary" data-next>
          Suivants →
        </button>

        <button type="button" class="button" data-add>
          + Une activité
        </button>
      </div>

      <p class="je-calendar-help">
        Horaires de Paris. Clique-glisse dans une journée pour
        créer un créneau. Clique sur une activité pour la modifier.
        Sur mobile ou au clavier, utilise « Une activité ».
      </p>

      <p class="je-calendar-help" data-feedback role="status"
         aria-live="polite"></p>

      <div class="je-calendar-scroll">
        <div class="je-calendar-grid"></div>
      </div>
    `;
        layout.prepend(root);

        const owner = root.querySelector("[data-owner]");
        const ownerLabel = root.querySelector("[data-owner-label]");
        const dateInput = root.querySelector("[data-date]");
        const daysInput = root.querySelector("[data-days]");
        const feedback = root.querySelector("[data-feedback]");
        const grid = root.querySelector(".je-calendar-grid");
        const scroll = root.querySelector(".je-calendar-scroll");

        const dialog = document.createElement("dialog");
        dialog.className = "je-calendar-editor";
        dialog.setAttribute("aria-label", "Détails de l’activité");

        const dialogBar = document.createElement("div");
        dialogBar.className = "je-calendar-editor-bar";

        const editorNotice = document.createElement("span");
        editorNotice.textContent =
            "Les modifications ne sont conservées qu’après Enregistrer.";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "button secondary";
        closeButton.textContent = "Fermer";

        dialogBar.append(editorNotice, closeButton);
        dialog.append(dialogBar, formCard);
        document.body.append(dialog);

        // Le propriétaire est fixé par le calendrier actif.
        ownerInput.closest(".field").hidden = true;

        function addDays(date, amount) {
            const value = new Date(`${date}T12:00:00Z`);
            value.setUTCDate(value.getUTCDate() + amount);
            return value.toISOString().slice(0, 10);
        }

        function clock(minutes) {
            const hour = Math.floor(minutes / 60);
            const minute = minutes % 60;
            return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        }

        function inputDateTime(date, minutes) {
            if (minutes === DAY_MINUTES) {
                return `${addDays(date, 1)}T00:00`;
            }
            return `${date}T${clock(minutes)}`;
        }

        function minuteOfDay(value) {
            return Number(value.slice(11, 13)) * 60 +
                Number(value.slice(14, 16));
        }

        function setEditorOwner() {
            ownerInput.value = activeCreatorId;
        }

        function snapshot() {
            return JSON.stringify(
                [...form.querySelectorAll("input, select, textarea")]
                    .filter(field =>
                        !["hidden", "submit", "button", "reset"].includes(field.type)
                    )
                    .map(field => ({
                        id: field.id || field.name,
                        value:
                            field.type === "checkbox" || field.type === "radio"
                                ? field.checked
                                : field.value.trim()
                    }))
            );
        }

        function openEditor() {
            if (!dialog.open) {
                dialog.showModal();
            }

            document.querySelector("#titleInput").focus();

            // Référence après ouverture, avec les valeurs préremplies.
            editorOrigin = snapshot();
        }

        function requestClose() {
            const hasChanges =
                editorOrigin !== null &&
                snapshot() !== editorOrigin;

            if (
                hasChanges &&
                !window.confirm(
                    "Tu as des modifications non enregistrées. Fermer sans les conserver ?"
                )
            ) {
                return;
            }

            dialog.close();
        }


        closeButton.addEventListener("click", requestClose);
        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            requestClose();
        });

        function createActivity(date, start = 12 * 60, end = 13 * 60) {
            if (!activeCreatorId) return;

            adapter.reset();
            setEditorOwner();

            document.querySelector("#startInput").value =
                inputDateTime(date, start);
            document.querySelector("#endInput").value =
                inputDateTime(date, end);

            openEditor();
        }

        function syncCreators() {
            const available = adapter.getCreators();
            const previous = activeCreatorId;

            // Pour un propriétaire non administrateur, privilégier son calendrier.
            const user = adapter.getUser();
            const globalAccess = Boolean(
                user?.permissions?.isSuperAdmin ||
                user?.permissions?.isGlobalModerator
            );

            const ownedIds = new Set(
                (user?.creatorMemberships ?? [])
                    .filter(member => member.memberRole === "owner")
                    .map(member => String(member.creatorId))
            );

            const owned = available.filter(
                creator => ownedIds.has(String(creator.id))
            );

            const choices = !globalAccess && owned.length
                ? owned
                : available;

            owner.replaceChildren();

            for (const creator of choices) {
                const option = document.createElement("option");
                option.value = String(creator.id);
                option.textContent = creator.twitchDisplayName;
                owner.append(option);
            }

            activeCreatorId = choices.some(
                creator => String(creator.id) === previous
            )
                ? previous
                : String(choices[0]?.id ?? "");

            owner.value = activeCreatorId;
            ownerLabel.hidden = choices.length <= 1;

            root.querySelector("[data-add]").disabled = !activeCreatorId;
        }

        function visibleEntries() {
            return adapter.getEntries().filter(
                entry => String(entry.primaryCreator?.id) === activeCreatorId
            );
        }

        function render() {
            if (gesture) return;

            syncCreators();

            if (!initializedDate) {
                const first = visibleEntries()
                    .map(entry => adapter.toLocal(entry.startsAt))
                    .filter(Boolean)
                    .sort()[0];

                dateInput.value =
                    first?.slice(0, 10) ||
                    document.querySelector("#startInput").value.slice(0, 10) ||
                    adapter.toLocal(new Date().toISOString()).slice(0, 10);

                initializedDate = true;
            }

            if (!dateInput.value) return;

            const dayCount = Number(daysInput.value);
            grid.style.gridTemplateColumns =
                `64px repeat(${dayCount}, minmax(190px, 1fr))`;
            grid.replaceChildren();

            const corner = document.createElement("div");
            corner.className = "je-calendar-heading";
            corner.textContent = "Paris";
            grid.append(corner);

            const dates = Array.from(
                { length: dayCount },
                (_, index) => addDays(dateInput.value, index)
            );

            for (const date of dates) {
                const heading = document.createElement("div");
                heading.className = "je-calendar-heading";
                heading.textContent = new Intl.DateTimeFormat("fr-FR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC"
                }).format(new Date(`${date}T12:00:00Z`));
                grid.append(heading);
            }

            const hours = document.createElement("div");
            hours.className = "je-calendar-hours";

            for (let hour = 0; hour < 24; hour++) {
                const label = document.createElement("span");
                label.className = "je-calendar-hour";
                label.style.top = `${hour * 60 + 3}px`;
                label.textContent = clock(hour * 60);
                hours.append(label);
            }

            grid.append(hours);

            const activities = visibleEntries();

            for (const date of dates) {
                const column = document.createElement("div");
                column.className = "je-calendar-day";
                column.dataset.date = date;

                const dayStart = `${date}T00:00`;
                const dayEnd = `${addDays(date, 1)}T00:00`;

                const segments = activities.flatMap(entry => {
                    const start = adapter.toLocal(entry.startsAt);
                    const end = adapter.toLocal(entry.endsAt);

                    if (!start || !end || start >= dayEnd || end <= dayStart) {
                        return [];
                    }

                    return [{
                        entry,
                        start: start < dayStart ? 0 : minuteOfDay(start),
                        end: end >= dayEnd ? DAY_MINUTES : minuteOfDay(end)
                    }];
                }).filter(segment => segment.end > segment.start)
                    .sort((a, b) => a.start - b.start || b.end - a.end);

                // Répartir les chevauchements côte à côte.
                const groups = [];
                let group = [];
                let groupEnd = -1;

                for (const segment of segments) {
                    if (group.length && segment.start >= groupEnd) {
                        groups.push(group);
                        group = [];
                        groupEnd = -1;
                    }
                    group.push(segment);
                    groupEnd = Math.max(groupEnd, segment.end);
                }

                if (group.length) groups.push(group);

                for (const overlapGroup of groups) {
                    const laneEnds = [];

                    for (const segment of overlapGroup) {
                        let lane = laneEnds.findIndex(end => end <= segment.start);
                        if (lane < 0) lane = laneEnds.length;
                        laneEnds[lane] = segment.end;
                        segment.lane = lane;
                    }

                    for (const segment of overlapGroup) {
                        const { entry, start, end, lane } = segment;
                        const button = document.createElement("button");

                        button.type = "button";
                        button.className = "je-calendar-event";
                        button.dataset.status = entry.status;
                        button.style.top = `${start}px`;
                        button.style.height = `${Math.max(12, end - start)}px`;
                        button.style.left =
                            `calc(${lane * 100 / laneEnds.length}% + 2px)`;
                        button.style.width =
                            `calc(${100 / laneEnds.length}% - 4px)`;

                        const title = document.createElement("strong");
                        title.textContent = entry.title;

                        const time = document.createElement("span");
                        time.textContent = `${clock(start)} – ${clock(end)}`;

                        button.title = `${entry.title} — ${time.textContent}`;
                        button.setAttribute("aria-label", button.title);
                        button.append(title, time);

                        // Aucun badge d’objectif fictif ou de valeur « aucun ».
                        button.addEventListener("click", () => {
                            adapter.select(entry);
                            openEditor();
                        });

                        column.append(button);
                    }
                }

                column.addEventListener("pointerdown", beginSelection);
                grid.append(column);
            }

            feedback.textContent = activeCreatorId
                ? "Sélection par pas de 15 minutes."
                : "Aucun calendrier modifiable avec ce compte.";
        }

        function snappedMinute(event, column) {
            const rect = column.getBoundingClientRect();
            const minute = Math.round(
                ((event.clientY - rect.top) / rect.height * DAY_MINUTES) / STEP
            ) * STEP;

            return Math.max(0, Math.min(DAY_MINUTES, minute));
        }

        function beginSelection(event) {
            // Le tactile garde son défilement naturel.
            if (
                event.pointerType === "touch" ||
                event.button !== 0 ||
                event.target.closest("button") ||
                !activeCreatorId
            ) {
                return;
            }

            event.preventDefault();

            const column = event.currentTarget;
            const anchor = Math.min(
                DAY_MINUTES - STEP,
                snappedMinute(event, column)
            );

            const preview = document.createElement("div");
            preview.className = "je-calendar-selection";
            column.append(preview);

            gesture = {
                pointerId: event.pointerId,
                column,
                preview,
                anchor,
                start: anchor,
                end: anchor + STEP
            };

            column.setPointerCapture(event.pointerId);

            column.addEventListener("pointermove", moveSelection);
            column.addEventListener("pointerup", finishSelection);
            column.addEventListener("pointercancel", cancelSelection);
            column.addEventListener("lostpointercapture", cancelSelection);

            updatePreview();
        }

        function updatePreview() {
            const { preview, start, end } = gesture;
            preview.style.top = `${start}px`;
            preview.style.height = `${end - start}px`;
            preview.textContent =
                `${clock(start)} → ${clock(end)} · ${end - start} min`;

            feedback.textContent = preview.textContent;
        }

        function moveSelection(event) {
            if (!gesture || event.pointerId !== gesture.pointerId) return;

            const current = snappedMinute(event, gesture.column);
            gesture.start = Math.min(gesture.anchor, current);
            gesture.end = Math.max(gesture.anchor, current);

            if (gesture.end === gesture.start) {
                gesture.end = Math.min(DAY_MINUTES, gesture.start + STEP);
            }

            updatePreview();
        }

        function clearSelection() {
            if (!gesture) return null;

            const previous = gesture;
            gesture = null;

            previous.column.removeEventListener("pointermove", moveSelection);
            previous.column.removeEventListener("pointerup", finishSelection);
            previous.column.removeEventListener("pointercancel", cancelSelection);
            previous.column.removeEventListener(
                "lostpointercapture",
                cancelSelection
            );

            if (previous.column.hasPointerCapture(previous.pointerId)) {
                previous.column.releasePointerCapture(previous.pointerId);
            }

            previous.preview.remove();
            return previous;
        }

        function finishSelection(event) {
            if (!gesture || event.pointerId !== gesture.pointerId) return;

            moveSelection(event);
            const selection = clearSelection();

            createActivity(
                selection.column.dataset.date,
                selection.start,
                selection.end
            );
        }

        function cancelSelection() {
            clearSelection();
            render();
        }

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && gesture) cancelSelection();
        });

        owner.addEventListener("change", () => {
            activeCreatorId = owner.value;
            adapter.reset();
            setEditorOwner();
            render();
        });

        dateInput.addEventListener("change", render);
        daysInput.addEventListener("change", render);

        for (const [selector, direction] of [
            ["[data-prev]", -1],
            ["[data-next]", 1]
        ]) {
            root.querySelector(selector).addEventListener("click", () => {
                if (!dateInput.value) return;
                dateInput.value = addDays(
                    dateInput.value,
                    direction * Number(daysInput.value)
                );
                render();
            });
        }

        root.querySelector("[data-add]").addEventListener("click", () => {
            createActivity(dateInput.value);
        });

        document.querySelector("#newEntryButton")
            .addEventListener("click", () => {
                createActivity(dateInput.value);
            });

        document.querySelector("#resetButton")
            .addEventListener("click", setEditorOwner);

        // Position de départ : midi, plutôt que minuit.
        scroll.scrollTop = 12 * 60;

        return { render };
    };
})();