const COLORS = {
  language: "#111111",
  visible: "#f15a2a",
  2022: "#6b5cff",
  2023: "#55acd0",
  2024: "#89bd5b",
  2025: "#f59a62",
  2026: "#f15a2a",
  contexts: {
    "Explicit tech/AI": "#1d63d6",
    "Selection/assessment/methods": "#f59a62",
    "Org/development/training": "#55acd0",
    "DEI/accessibility": "#6b5cff",
    "Other/special": "#918a7a",
  },
  sides: {
    "I-side selection/assessment": "#f59a62",
    "O-side org/development": "#55acd0",
  },
};

const CONTEXT_ORDER = [
  "Explicit tech/AI",
  "Selection/assessment/methods",
  "Org/development/training",
  "DEI/accessibility",
  "Other/special",
];

const SIDE_ORDER = ["I-side selection/assessment", "O-side org/development"];

const STORY_BEATS = [
  {
    id: "baseline",
    step: "1. Baseline",
    title: "Start before the surge",
    copy: "2022 shows AI as present, but not yet dominant.",
    year: 2022,
    riverMode: "contexts",
    context: "All",
    side: "All",
  },
  {
    id: "rise",
    step: "2. Visibility",
    title: "Watch AI become louder",
    copy: "2024 is the bridge into a bigger signal.",
    year: 2024,
    riverMode: "contexts",
    context: "All",
    side: "All",
  },
  {
    id: "context",
    step: "3. Use-case mix",
    title: "Focus the org-side band",
    copy: "2026 highlights training, leadership, and work context.",
    year: 2026,
    riverMode: "contexts",
    context: "Org/development/training",
    side: "All",
  },
  {
    id: "meaning",
    step: "4. Meaning",
    title: "Compare I-side and O-side",
    copy: "The story becomes about what AI is being used for.",
    year: 2026,
    riverMode: "sides",
    context: "All",
    side: "O-side org/development",
  },
];

let activeMetric = "sessions";
let activeContext = "All";
let activeSide = "All";
let activeNetworkYear = 2026;
let activeFocusYear = 2026;
let riverMode = "contexts";
let selectedLink = null;
let selectedTime = null;
let replayTimer = null;
let replayIndex = 0;
let storyData;
const SESSION_PREVIEW_LIMIT = 8;

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function getYears(data) {
  return data.ai_summary.map((d) => d.year).sort((a, b) => a - b);
}

function yearColor(year) {
  return COLORS[year] || "#6b7280";
}

function shortContext(context) {
  return String(context)
    .replace("Explicit tech/AI", "Explicit tech")
    .replace("Selection/assessment/methods", "Selection")
    .replace("Org/development/training", "Org/development")
    .replace("DEI/accessibility", "DEI/access")
    .replace("Other/special", "Other");
}

function contextMicrocopy(context) {
  const copy = {
    "Explicit tech/AI": "General AI and technology language, often before the use case is more specific.",
    "Selection/assessment/methods": "I-side AI contexts: scoring, selection, assessment, validation, prediction, and methods.",
    "Org/development/training": "O-side AI contexts: training, coaching, leadership, learning, culture, teams, and work design.",
    "DEI/accessibility": "People-context AI questions around access, equity, inclusion, and employee experience.",
    "Other/special": "Special or cross-cutting sessions that do not sit cleanly in the other groups.",
  };
  return copy[context] || "AI-related context signal.";
}

function sideForContext(context) {
  if (context === "Selection/assessment/methods") return "I-side selection/assessment";
  if (context === "Org/development/training" || context === "DEI/accessibility") {
    return "O-side org/development";
  }
  return "Cross-cutting";
}

function sessionMatchesSide(session, side) {
  if (side === "All") return true;
  const groups = session.context_groups || [session.context];
  return groups.some((group) => sideForContext(group) === side);
}

function getSideRowsForYear(data, year) {
  const rows = getContextRowsForYear(data, year);
  return SIDE_ORDER.map((side) => ({
    side,
    sessions: d3.sum(rows.filter((row) => sideForContext(row.context) === side), (row) => row.sessions),
  }));
}

function getSideRows(data) {
  return getYears(data).flatMap((year) => getSideRowsForYear(data, year).map((row) => ({ ...row, year })));
}

function formatDelta(current, previous) {
  const delta = Math.round((current - previous) * 100);
  return `${delta > 0 ? "+" : ""}${delta} pts`;
}

function makeSvg(target, width, height) {
  d3.select(target).selectAll("*").remove();
  return d3
    .select(target)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-hidden", "true");
}

function appendCallout(svg, { x, y, width = 268, title, copy }) {
  const group = svg.append("g").attr("class", "chart-callout").attr("transform", `translate(${x},${y})`);
  group.append("rect").attr("width", width).attr("height", 74).attr("rx", 14);
  group.append("text").attr("x", 16).attr("y", 27).text(title);
  group.append("text").attr("class", "callout-copy").attr("x", 16).attr("y", 50).text(copy);
  return group;
}

function tooltip() {
  return d3.select("#tooltip");
}

function showTooltip(event, title, body) {
  tooltip()
    .classed("visible", true)
    .style("left", `${event.clientX}px`)
    .style("top", `${event.clientY}px`)
    .html(`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`);
}

function moveTooltip(event) {
  tooltip().style("left", `${event.clientX}px`).style("top", `${event.clientY}px`);
}

function hideTooltip() {
  tooltip().classed("visible", false);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function highlightTerm(text, query) {
  const safe = escapeHtml(text);
  const trimmed = query.trim();
  if (!trimmed) return safe;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escaped})`, "ig"), "<mark>$1</mark>");
}

function sessionDescriptor(session) {
  const pieces = [];
  if (session.tracks && session.tracks !== "Untracked") {
    pieces.push(session.tracks);
  } else if (session.year < 2025) {
    pieces.push("Archived program text; track label not available");
  } else {
    pieces.push("No track label available");
  }
  const when = [session.date, session.start_time].filter(Boolean).join(" at ");
  if (when) pieces.push(when);
  return pieces.join(" | ");
}

function sessionsForLens(data, { year = "All", context = "All", side = "All" } = {}) {
  return data.session_explorer.filter((session) => {
    const groups = session.context_groups || [session.context];
    const matchesYear = year === "All" || Number(session.year) === Number(year);
    const matchesContext = context === "All" || groups.includes(context);
    const matchesSide = side === "All" || sessionMatchesSide(session, side);
    return matchesYear && matchesContext && matchesSide;
  });
}

function renderSessionDrilldown(targetSelector, lens) {
  const target = document.querySelector(targetSelector);
  if (!target || !storyData) return;
  const sessions = sessionsForLens(storyData, lens);
  const preview = sessions.slice(0, SESSION_PREVIEW_LIMIT);
  const labelParts = [
    lens.year && lens.year !== "All" ? lens.year : "All years",
    lens.context && lens.context !== "All" ? shortContext(lens.context) : null,
    lens.side && lens.side !== "All" ? lens.side : null,
  ].filter(Boolean);
  const label = labelParts.join(" | ");
  const sessionWord = sessions.length === 1 ? "session" : "sessions";
  const cards = preview
    .map((session) => {
      const displayedContext =
        lens.context && lens.context !== "All" ? shortContext(lens.context) : shortContext(session.context);
      return `
        <article class="drilldown-card">
          <div class="example-meta">
            <span class="pill">${escapeHtml(session.year)}</span>
            <span class="pill">${escapeHtml(displayedContext)}</span>
            <span class="pill">${escapeHtml(session.session_format || "Session")}</span>
          </div>
          <h3>${escapeHtml(session.title)}</h3>
          ${
            session.speakers
              ? `<p class="session-authors">${escapeHtml(`Authors: ${session.speakers}`)}</p>`
              : ""
          }
          <p>${escapeHtml(sessionDescriptor(session))}</p>
        </article>
      `;
    })
    .join("");

  target.innerHTML = `
    <div class="drilldown-header">
      <div>
        <span class="stat-label">Sessions behind this point</span>
        <strong>${escapeHtml(label || "Selected slice")}</strong>
        <p>${sessions.length} matching ${sessionWord}. Showing ${Math.min(preview.length, SESSION_PREVIEW_LIMIT)}.</p>
      </div>
      <button class="drilldown-clear" type="button">Clear</button>
    </div>
    <div class="drilldown-list">
      ${
        preview.length
          ? cards
          : '<div class="empty-state">No sessions match this slice.</div>'
      }
    </div>
  `;
  target.querySelector(".drilldown-clear").addEventListener("click", () => {
    resetSessionDrilldown(targetSelector);
  });
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function countBy(items, keyFn) {
  return Array.from(
    d3.rollup(
      items,
      (values) => values.length,
      keyFn,
    ),
    ([label, count]) => ({ label: label || "Unlisted", count }),
  ).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function contextRowFor(data, year, context) {
  return data.context_summary.find(
    (item) => item.conference_year === Number(year) && item.ai_context_group === context,
  );
}

function trajectoryForLens(data, { context = "All", side = "All" } = {}) {
  return getYears(data).map((year) => {
    if (context !== "All") {
      const row = contextRowFor(data, year, context);
      return { year, sessions: row ? row.sessions : 0 };
    }
    if (side !== "All") {
      const row = getSideRowsForYear(data, year).find((item) => item.side === side);
      return { year, sessions: row ? row.sessions : 0 };
    }
    const row = data.ai_summary.find((item) => item.year === year);
    return { year, sessions: row ? row.ai_related_sessions : 0 };
  });
}

function renderDataLens({ year = activeFocusYear, context = "All", side = "All" } = {}) {
  const target = document.querySelector("#meaning-data-lens");
  if (!target || !storyData) return;
  const sessions = sessionsForLens(storyData, { year, context, side });
  const trajectory = trajectoryForLens(storyData, { context, side });
  const first = trajectory[0];
  const last = trajectory.at(-1);
  const selectedCount = sessions.length;
  const contextRow = context !== "All" ? contextRowFor(storyData, year, context) : null;
  const formats = countBy(sessions, (session) => session.session_format).slice(0, 3);
  const tracks = countBy(
    sessions.filter((session) => session.tracks && session.tracks !== "Untracked"),
    (session) => session.tracks,
  ).slice(0, 3);
  const label =
    context !== "All"
      ? shortContext(context)
      : side !== "All"
        ? side
        : "All AI-related sessions";
  const microcopy =
    context !== "All"
      ? contextMicrocopy(context)
      : side !== "All"
        ? "This side lens groups related contexts so the I-side/O-side contrast is easier to inspect."
        : "This lens keeps the full AI-related session set visible for the selected year.";

  target.innerHTML = `
    <div class="data-lens-header">
      <div>
        <span class="stat-label">Data lens</span>
        <strong>${escapeHtml(year)} | ${escapeHtml(label)}</strong>
        <p>${escapeHtml(microcopy)}</p>
      </div>
      <button class="drilldown-clear" type="button">Clear</button>
    </div>
    <div class="data-lens-grid">
      <article>
        <span class="stat-label">Selected year</span>
        <strong>${selectedCount}</strong>
        <p>${contextRow ? `${percent(contextRow.share)} of AI context links in ${year}.` : "Matching AI-related sessions in this slice."}</p>
      </article>
      <article>
        <span class="stat-label">Five-year arc</span>
        <strong>${first.sessions} → ${last.sessions}</strong>
        <p>${last.sessions - first.sessions >= 0 ? "+" : ""}${last.sessions - first.sessions} from ${first.year} to ${last.year}.</p>
      </article>
      <article>
        <span class="stat-label">Top formats</span>
        <strong>${escapeHtml(formats.map((item) => `${item.label} (${item.count})`).join(", ") || "n/a")}</strong>
        <p>Most common session formats in this selected slice.</p>
      </article>
      <article>
        <span class="stat-label">Top tracks</span>
        <strong>${escapeHtml(tracks.map((item) => `${item.label} (${item.count})`).join(", ") || "n/a")}</strong>
        <p>Track labels are less complete before 2025.</p>
      </article>
    </div>
    <div class="data-lens-trajectory" aria-label="Five-year trajectory">
      ${trajectory
        .map(
          (item) => `
            <button class="trajectory-chip${Number(item.year) === Number(year) ? " active" : ""}" type="button" data-year="${item.year}">
              <span>${item.year}</span>
              <strong>${item.sessions}</strong>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
  target.querySelector(".drilldown-clear").addEventListener("click", () => {
    target.innerHTML = `
      <div>
        <span class="stat-label">Data lens</span>
        <strong>Click a compass bubble or I-side/O-side card to inspect the slice.</strong>
      </div>
    `;
    resetSessionDrilldown("#meaning-session-drilldown");
  });
  target.querySelectorAll(".trajectory-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const nextYear = Number(button.dataset.year);
      activeFocusYear = nextYear;
      activeNetworkYear = nextYear;
      syncYearControls();
      drawHeroSignalField(storyData);
      drawSignalRiver(storyData);
      drawUseCaseCompass(storyData);
      renderFocusInsights(storyData);
      renderStoryCaption(storyData);
      renderRiverInsights(storyData);
      renderDynamicTakeaway(storyData);
      renderDataLens({ year: nextYear, context, side });
      renderSessionDrilldown("#meaning-session-drilldown", { year: nextYear, context, side });
    });
  });
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetSessionDrilldown(targetSelector) {
  const target = document.querySelector(targetSelector);
  if (!target) return;
  const copy =
    targetSelector === "#river-session-drilldown"
      ? "Click a band, year marker, or lane dot to inspect the matching sessions."
      : targetSelector === "#meaning-session-drilldown"
        ? "Click a compass bubble or side card to see the matching sessions."
      : "Click a bubble to see the sessions behind that year and context.";
  target.innerHTML = `
    <div>
      <span class="stat-label">Session drilldown</span>
      <strong>${copy}</strong>
    </div>
  `;
}

function setExplorerLens({ year = null, context = null, side = null, query = null, link = undefined } = {}) {
  const yearSelect = document.querySelector("#session-year");
  const contextSelect = document.querySelector("#session-context");
  const searchInput = document.querySelector("#session-search");
  if (year !== null && year !== "All") {
    activeFocusYear = Number(year);
    activeNetworkYear = activeFocusYear;
  }
  if (context !== null) activeContext = context;
  if (yearSelect && year !== null) yearSelect.value = String(year);
  if (contextSelect && context !== null) contextSelect.value = context;
  if (searchInput && query !== null) searchInput.value = query;
  if (side !== null) activeSide = side;
  if (link !== undefined) selectedLink = link;
  renderActiveLens(storyData);
  renderDynamicTakeaway(storyData);
}

function resetExploration() {
  stopReplay();
  activeContext = "All";
  activeSide = "All";
  riverMode = "contexts";
  selectedLink = null;
  selectedTime = null;
  activeFocusYear = getYears(storyData).at(-1);
  activeNetworkYear = activeFocusYear;
  const yearSelect = document.querySelector("#session-year");
  const contextSelect = document.querySelector("#session-context");
  const searchInput = document.querySelector("#session-search");
  if (yearSelect) yearSelect.value = "All";
  if (contextSelect) contextSelect.value = "All";
  if (searchInput) searchInput.value = "";
  syncRiverModeControls();
  syncYearControls();
  drawHeroSignalField(storyData);
  drawSignalRiver(storyData);
  drawUseCaseCompass(storyData);
  renderStoryCaption(storyData);
  renderRiverInsights(storyData);
  renderActiveLens(storyData);
  renderDynamicTakeaway(storyData);
  resetSessionDrilldown("#hero-session-drilldown");
  resetSessionDrilldown("#river-session-drilldown");
  resetSessionDrilldown("#meaning-session-drilldown");
  const dataLens = document.querySelector("#meaning-data-lens");
  if (dataLens) {
    dataLens.innerHTML = `
      <div>
        <span class="stat-label">Data lens</span>
        <strong>Click a compass bubble or I-side/O-side card to inspect the slice.</strong>
      </div>
    `;
  }
}

function focusYear(year, { updateExplorer = false } = {}) {
  activeFocusYear = Number(year);
  activeNetworkYear = Number(year);
  selectedLink = null;
  selectedTime = null;
  syncYearControls();
  drawHeroSignalField(storyData);
  drawSignalRiver(storyData);
  drawUseCaseCompass(storyData);
  renderFocusInsights(storyData);
  renderStoryCaption(storyData);
  renderRiverInsights(storyData);
  renderDynamicTakeaway(storyData);
  if (updateExplorer) {
    setExplorerLens({ year, context: "All", side: activeSide, query: "", link: null });
  }
}

function focusContext(context) {
  activeContext = context;
  activeSide = "All";
  riverMode = "contexts";
  syncRiverModeControls();
  drawUseCaseCompass(storyData);
  drawSignalRiver(storyData);
  renderStoryCaption(storyData);
  renderRiverInsights(storyData);
  renderDynamicTakeaway(storyData);
  setExplorerLens({ year: activeFocusYear, context, query: "", link: null });
}

function focusSide(side) {
  activeSide = side;
  activeContext = "All";
  riverMode = "sides";
  syncRiverModeControls();
  selectedLink = null;
  selectedTime = null;
  drawSignalRiver(storyData);
  drawUseCaseCompass(storyData);
  renderRiverInsights(storyData);
  renderActiveLens(storyData);
  renderDynamicTakeaway(storyData);
}

function syncYearControls() {
  document.querySelectorAll(".focus-year, .network-year, .compare-year").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.year) === activeFocusYear);
  });
  const years = getYears(storyData || { ai_summary: [] });
  const progress = document.querySelector("#replay-progress");
  if (progress && years.length > 1) {
    const index = Math.max(0, years.indexOf(activeFocusYear));
    progress.style.width = `${(index / (years.length - 1)) * 100}%`;
  }
  syncStoryBeatControls();
}

function riverModeCopy(mode) {
  return mode === "sides"
    ? "Two-lane mode simplifies the story into I-side selection/assessment versus O-side people-context AI."
    : "Five-band mode shows where AI language appears in the program. Click a band to focus the story.";
}

function syncRiverModeControls() {
  document.querySelectorAll(".river-mode").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === riverMode);
  });
  const note = document.querySelector("#river-mode-note");
  if (note) note.textContent = riverModeCopy(riverMode);
}

function syncStoryBeatControls() {
  document.querySelectorAll(".story-beat").forEach((button) => {
    const beat = STORY_BEATS.find((item) => item.id === button.dataset.beat);
    const matches =
      beat &&
      beat.year === activeFocusYear &&
      beat.riverMode === riverMode &&
      beat.context === activeContext &&
      beat.side === activeSide;
    button.classList.toggle("active", Boolean(matches));
  });
}

function storyBeatTarget(beat) {
  if (beat.id === "meaning") return "#meaning-step";
  if (beat.id === "baseline") return "#visibility-step";
  return "#shift-step";
}

function applyStoryBeat(beatId) {
  const beat = STORY_BEATS.find((item) => item.id === beatId);
  if (!beat) return;
  stopReplay();
  activeFocusYear = beat.year;
  activeNetworkYear = beat.year;
  activeContext = beat.context;
  activeSide = beat.side;
  riverMode = beat.riverMode;
  selectedLink = null;
  selectedTime = null;
  syncRiverModeControls();
  syncYearControls();
  drawHeroSignalField(storyData);
  drawSignalRiver(storyData);
  drawUseCaseCompass(storyData);
  renderFocusInsights(storyData);
  renderStoryCaption(storyData);
  renderRiverInsights(storyData);
  renderActiveLens(storyData);
  renderDynamicTakeaway(storyData);
  const target = document.querySelector(storyBeatTarget(beat));
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStoryBeatControls() {
  const container = document.querySelector("#story-beat-controls");
  if (!container) return;
  container.innerHTML = "";
  STORY_BEATS.forEach((beat) => {
    const button = document.createElement("button");
    button.className = "story-beat";
    button.type = "button";
    button.dataset.beat = beat.id;
    button.innerHTML = `<span>${escapeHtml(beat.step)}</span><strong>${escapeHtml(beat.title)}</strong><span>${escapeHtml(beat.copy)}</span>`;
    button.addEventListener("click", () => applyStoryBeat(beat.id));
    container.appendChild(button);
  });
  syncStoryBeatControls();
}

function setHeroStats(data) {
  const years = getYears(data);
  activeFocusYear = years[years.length - 1];
  activeNetworkYear = activeFocusYear;
  const first = data.ai_summary.find((d) => d.year === years[0]);
  const last = data.ai_summary.find((d) => d.year === years[years.length - 1]);
  document.querySelector("#ai-language-stat").innerHTML = statShift(first.ai_share, last.ai_share);
  document.querySelector("#ai-language-detail").textContent =
    `${first.ai_related_sessions} of ${first.total_sessions} sessions in ${first.year}; ` +
    `${last.ai_related_sessions} of ${last.total_sessions} in ${last.year}.`;
  document.querySelector("#visible-ai-stat").innerHTML = statShift(first.visible_ai_share, last.visible_ai_share);
  document.querySelector("#visible-ai-detail").textContent =
    `Visible title, track, and format signals changed by ` +
    `${formatDelta(last.visible_ai_share, first.visible_ai_share)}.`;

  const selectionFirst = data.context_summary.find(
    (d) => d.conference_year === first.year && d.ai_context_group === "Selection/assessment/methods",
  );
  const selectionLast = data.context_summary.find(
    (d) => d.conference_year === last.year && d.ai_context_group === "Selection/assessment/methods",
  );
  document.querySelector("#context-stat").innerHTML = statShift(selectionFirst.share, selectionLast.share);
}

function statShift(from, to) {
  return `<span class="stat-shift"><span>${percent(from)}</span><span class="stat-arrow">→</span><span>${percent(to)}</span></span>`;
}

function drawHeroSignalField(data) {
  const width = 1080;
  const height = 360;
  const margin = { top: 42, right: 42, bottom: 48, left: 28 };
  const svg = makeSvg("#hero-signal-field", width, height);
  const years = getYears(data);
  const x = d3.scalePoint().domain(years).range([margin.left + 190, width - margin.right - 80]);
  const y = d3
    .scalePoint()
    .domain(CONTEXT_ORDER)
    .range([margin.top + 18, height - margin.bottom - 34]);
  const rows = data.context_summary.map((d) => ({
    ...d,
    x: x(d.conference_year),
    y: y(d.ai_context_group),
  }));
  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(rows, (d) => d.sessions) || 1])
    .range([6, 28]);

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 24)
    .attr("class", "chart-note")
    .text(`${years[0]} to ${years[years.length - 1]} AI-related session contexts`);

  const line = d3
    .line()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(d3.curveCatmullRom.alpha(0.45));
  const contextLines = CONTEXT_ORDER.map((context) => ({
    context,
    rows: rows.filter((d) => d.ai_context_group === context).sort((a, b) => a.conference_year - b.conference_year),
  })).filter((d) => d.rows.length > 1);

  svg
    .append("g")
    .selectAll("path")
    .data(contextLines)
    .join("path")
    .attr("class", "signal-thread")
    .attr("d", (d) => line(d.rows))
    .attr("fill", "none")
    .attr("stroke", (d) => COLORS.contexts[d.context])
    .attr("stroke-width", (d) => (activeContext === "All" || activeContext === d.context ? 2.6 : 1.4))
    .attr("opacity", (d) => (activeContext === "All" || activeContext === d.context ? 0.42 : 0.14));

  svg
    .append("g")
    .selectAll("text")
    .data(CONTEXT_ORDER)
    .join("text")
    .attr("x", margin.left)
    .attr("y", (d) => y(d) + 4)
    .attr("class", "network-node-label")
    .text((d) => shortContext(d));

  years.forEach((year) => {
    svg
      .append("text")
      .attr("x", x(year))
      .attr("y", height - 18)
      .attr("text-anchor", "middle")
      .attr("class", "chart-note")
      .text(year);
  });

  const groups = svg
    .append("g")
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("class", (d) => `signal-node${d.conference_year === activeFocusYear ? " is-focus" : ""}`)
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .on("mouseenter", (event, d) => {
      showTooltip(event, d.ai_context_group, `${d.sessions} AI-related session-context signals in ${d.conference_year}.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      activeContext = d.ai_context_group;
      selectedLink = null;
      selectedTime = null;
      focusYear(d.conference_year);
      setExplorerLens({ year: d.conference_year, context: d.ai_context_group, query: "", link: null });
      renderSessionDrilldown("#hero-session-drilldown", {
        year: d.conference_year,
        context: d.ai_context_group,
      });
    });

  groups
    .append("circle")
    .attr("r", 0)
    .attr("fill", (d) => COLORS.contexts[d.ai_context_group])
    .attr("opacity", (d) => (d.conference_year === activeFocusYear ? 0.98 : 0.62))
    .attr("stroke", (d) => (d.conference_year === activeFocusYear ? "#17202a" : "#ffffff"))
    .attr("stroke-width", (d) => (d.conference_year === activeFocusYear ? 2.5 : 1.2))
    .transition()
    .duration(700)
    .delay((_, index) => index * 45)
    .attr("r", (d) => radius(d.sessions));

  groups
    .append("text")
    .attr("text-anchor", "middle")
    .attr("class", "network-node-label")
    .attr("y", 4)
    .text((d) => d.sessions);
}

function drawHeadlineChart(data) {
  const width = 920;
  const height = 380;
  const margin = { top: 36, right: 28, bottom: 74, left: 64 };
  const svg = makeSvg("#headline-chart", width, height);

  const rows = data.ai_summary.flatMap((d) => [
    {
      year: String(d.year),
      metric: "AI language",
      value: d.ai_share,
      count: d.ai_related_sessions,
      color: COLORS.language,
    },
    {
      year: String(d.year),
      metric: "Visible AI signal",
      value: d.visible_ai_share,
      count: d.visible_ai_sessions,
      color: COLORS.visible,
    },
  ]);

  const years = data.ai_summary.map((d) => String(d.year));
  const metrics = ["AI language", "Visible AI signal"];
  const x0 = d3.scaleBand().domain(years).range([margin.left, width - margin.right]).padding(0.34);
  const x1 = d3.scaleBand().domain(metrics).range([0, x0.bandwidth()]).padding(0.12);
  const y = d3.scaleLinear().domain([0, 0.36]).nice().range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x0).tickSizeOuter(0));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat((d) => `${Math.round(d * 100)}%`))
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", (d) => x0(d.year) + x1(d.metric))
    .attr("y", (d) => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => y(0) - y(d.value))
    .attr("rx", 4)
    .attr("fill", (d) => d.color)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      showTooltip(event, d.metric, `${d.count} sessions in ${d.year}, ${percent(d.value)} of that year's program.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      selectedTime = null;
      setExplorerLens({
        year: d.year,
        context: "All",
        query: d.metric === "Visible AI signal" ? "AI" : "",
        link: null,
      });
    });

  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "bar-label")
    .attr("text-anchor", "middle")
    .attr("x", (d) => x0(d.year) + x1(d.metric) + x1.bandwidth() / 2)
    .attr("y", (d) => y(d.value) - 9)
    .text((d) => `${percent(d.value)} (${d.count})`);

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 34})`);
  metrics.forEach((metric, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 190},0)`);
    item.append("rect").attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", rows[index].color);
    item
      .append("text")
      .attr("x", 22)
      .attr("y", 12)
      .attr("fill", "#17202a")
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .text(metric);
  });
}

function drawSignalRiver(data) {
  if (riverMode === "sides") {
    drawSideLaneChart(data);
    return;
  }
  const width = 1040;
  const height = 520;
  const margin = { top: 42, right: 184, bottom: 68, left: 54 };
  const svg = makeSvg("#signal-river-chart", width, height);
  const years = getYears(data);
  const rows = years.map((year) => {
    const row = { year };
    CONTEXT_ORDER.forEach((context) => {
      const found = data.context_summary.find(
        (item) => item.conference_year === year && item.ai_context_group === context,
      );
      row[context] = found ? found.sessions : 0;
    });
    return row;
  });
  const stack = d3.stack().keys(CONTEXT_ORDER).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut);
  const series = stack(rows);
  const x = d3.scalePoint().domain(years).range([margin.left, width - margin.right]).padding(0.3);
  const yExtent = d3.extent(series.flat(2));
  const y = d3.scaleLinear().domain(yExtent).nice().range([height - margin.bottom, margin.top]);
  const area = d3
    .area()
    .x((d) => x(d.data.year))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(d3.curveCatmullRom.alpha(0.5));

  svg
    .append("g")
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("class", "river-band")
    .attr("d", area)
    .attr("fill", (d) => COLORS.contexts[d.key])
    .attr("opacity", (d) => (activeContext === "All" || activeContext === d.key ? 0.82 : 0.22))
    .on("mouseenter", (event, d) =>
      showTooltip(event, d.key, `${contextMicrocopy(d.key)} Click to focus this use-case context.`),
    )
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      focusContext(d.key);
      renderSessionDrilldown("#river-session-drilldown", {
        year: activeFocusYear,
        context: d.key,
      });
    });

  const focusX = x(activeFocusYear);
  svg
    .append("line")
    .attr("class", "focus-line")
    .attr("x1", focusX)
    .attr("x2", focusX)
    .attr("y1", margin.top - 12)
    .attr("y2", height - margin.bottom + 12);

  const focusedRow = rows.find((row) => row.year === activeFocusYear);
  const orgSignals = focusedRow["Org/development/training"] || 0;
  const selectionSignals = focusedRow["Selection/assessment/methods"] || 0;
  const calloutX = Math.min(Math.max(margin.left + 8, focusX + 18), width - margin.right - 278);
  const calloutY = margin.top + 4;
  svg
    .append("path")
    .attr("class", "story-arrow")
    .attr(
      "d",
      `M${calloutX + 28},${calloutY + 74} C${calloutX + 24},${height - margin.bottom - 18} ${focusX - 18},${height - margin.bottom - 18} ${focusX},${height - margin.bottom + 12}`,
    );
  appendCallout(svg, {
    x: calloutX,
    y: calloutY,
    title: activeContext === "All" ? `${activeFocusYear}: read the mix` : `${shortContext(activeContext)} focused`,
    copy:
      activeContext === "All"
        ? `Org/dev ${orgSignals}; selection ${selectionSignals}.`
        : `${focusedRow[activeContext] || 0} signals in ${activeFocusYear}; compare years below.`,
  });

  svg
    .append("g")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("class", "river-year-hit")
    .attr("cx", (d) => x(d.year))
    .attr("cy", height - margin.bottom + 26)
    .attr("r", (d) => (d.year === activeFocusYear ? 11 : 7))
    .attr("fill", (d) => yearColor(d.year))
    .on("mouseenter", (event, d) => showTooltip(event, d.year, "Click to focus this conference year."))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      focusYear(d.year, { updateExplorer: true });
      renderSessionDrilldown("#river-session-drilldown", {
        year: d.year,
        context: activeContext,
        side: activeSide,
      });
    });

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom + 44})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
    .call((g) => g.select(".domain").remove());

  const latestYear = years[years.length - 1];
  const latestRow = rows.find((row) => row.year === latestYear);
  const legendRows = CONTEXT_ORDER.map((context) => ({ context, value: latestRow[context] }));
  const legend = svg.append("g").attr("transform", `translate(${width - margin.right + 8},${margin.top})`);
  legendRows.forEach((item, index) => {
    const group = legend.append("g").attr("transform", `translate(0,${index * 42})`);
    group.append("rect").attr("width", 13).attr("height", 13).attr("rx", 3).attr("fill", COLORS.contexts[item.context]);
    group
      .append("text")
      .attr("x", 20)
      .attr("y", 12)
      .attr("class", "network-node-label")
      .text(shortContext(item.context));
    group
      .append("text")
      .attr("x", 20)
      .attr("y", 28)
      .attr("class", "network-link-label")
      .text(`${item.value} in ${latestYear}`);
  });
}

function drawSideLaneChart(data) {
  const width = 1040;
  const height = 420;
  const margin = { top: 58, right: 86, bottom: 70, left: 230 };
  const svg = makeSvg("#signal-river-chart", width, height);
  const years = getYears(data);
  const rows = getSideRows(data);
  const x = d3.scalePoint().domain(years).range([margin.left, width - margin.right]).padding(0.24);
  const y = d3.scalePoint().domain(SIDE_ORDER).range([margin.top + 58, height - margin.bottom - 36]);
  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(rows, (d) => d.sessions) || 1])
    .range([10, 32]);
  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.side))
    .curve(d3.curveCatmullRom.alpha(0.35));

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 32)
    .attr("class", "chart-note")
    .text("Two-lane view: selection/assessment vs org-side people-context AI");

  const focusedSideRows = getSideRowsForYear(data, activeFocusYear);
  const focusedI = focusedSideRows.find((row) => row.side === "I-side selection/assessment");
  const focusedO = focusedSideRows.find((row) => row.side === "O-side org/development");
  const balance = focusedO.sessions - focusedI.sessions;
  appendCallout(svg, {
    x: width - margin.right - 304,
    y: 26,
    width: 304,
    title: `${activeFocusYear}: ${balance >= 0 ? "O-side leads" : "I-side leads"}`,
    copy: `Selection ${focusedI.sessions}; org-side ${focusedO.sessions}; balance ${balance >= 0 ? "+" : ""}${balance}.`,
  });

  SIDE_ORDER.forEach((side) => {
    const sideRows = rows.filter((row) => row.side === side).sort((a, b) => a.year - b.year);
    svg
      .append("path")
      .datum(sideRows)
      .attr("class", "side-lane-line")
      .attr("d", line)
      .attr("stroke", COLORS.sides[side])
      .attr("opacity", activeSide === "All" || activeSide === side ? 0.82 : 0.18);

    svg
      .append("text")
      .attr("x", margin.left - 22)
      .attr("y", y(side) + 5)
      .attr("text-anchor", "end")
      .attr("class", "network-node-label")
      .text(side);
  });

  svg
    .append("g")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("class", "side-lane-node")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d.side))
    .attr("r", (d) => radius(d.sessions))
    .attr("fill", (d) => COLORS.sides[d.side])
    .attr("opacity", (d) => (activeSide === "All" || activeSide === d.side ? 0.86 : 0.24))
    .attr("stroke", (d) => (d.year === activeFocusYear ? "#17202a" : "#ffffff"))
    .attr("stroke-width", (d) => (d.year === activeFocusYear ? 3 : 1.5))
    .on("mouseenter", (event, d) => {
      showTooltip(event, d.side, `${d.sessions} context signals in ${d.year}. Click to focus this lane.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      activeFocusYear = d.year;
      activeNetworkYear = d.year;
      focusSide(d.side);
      syncYearControls();
      drawHeroSignalField(storyData);
      renderStoryCaption(storyData);
      renderFocusInsights(storyData);
      renderSessionDrilldown("#river-session-drilldown", {
        year: d.year,
        side: d.side,
      });
    });

  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "bar-label")
    .attr("text-anchor", "middle")
    .attr("x", (d) => x(d.year))
    .attr("y", (d) => y(d.side) + 5)
    .text((d) => d.sessions);

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom + 32})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
    .call((g) => g.select(".domain").remove());
}

function drawRhythmChart(data) {
  const width = 980;
  const margin = { top: 48, right: 36, bottom: 58, left: 132 };
  const rows = data.rhythm_summary;
  const dates = [...new Set(rows.map((d) => `${d.year}|${d.date_label}|${d.date}`))].sort((a, b) => {
    const [, , dateA] = a.split("|");
    const [, , dateB] = b.split("|");
    return dateA.localeCompare(dateB);
  });
  const height = Math.max(500, dates.length * 34 + margin.top + margin.bottom);
  const svg = makeSvg("#rhythm-chart", width, height);
  const hours = d3.range(d3.min(rows, (d) => d.hour) || 7, (d3.max(rows, (d) => d.hour) || 18) + 1);
  const y = d3.scaleBand().domain(dates).range([margin.top, height - margin.bottom]).padding(0.16);
  const x = d3.scaleBand().domain(hours).range([margin.left, width - margin.right]).padding(0.12);
  const color = d3.scaleSequential().domain([0, d3.max(rows, (d) => d.sessions) || 1]).interpolator(d3.interpolatePuBuGn);
  const rowMap = new Map(rows.map((d) => [`${d.year}|${d.date_label}|${d.date}|${d.hour}`, d]));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat((d) => `${d}:00`).tickSizeOuter(0));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3.axisLeft(y).tickFormat((d) => {
        const [year, label] = d.split("|");
        return `${year} ${label.replace("Thursday, ", "Thu ").replace("Friday, ", "Fri ").replace("Saturday, ", "Sat ").replace("Wednesday, ", "Wed ")}`;
      }),
    )
    .call((g) => g.select(".domain").remove());

  const cells = dates.flatMap((dateKey) =>
    hours.map((hour) => {
      const row = rowMap.get(`${dateKey}|${hour}`);
      const [year, dateLabel, date] = dateKey.split("|");
      return {
        year: Number(year),
        dateLabel,
        date,
        hour,
        sessions: row ? row.sessions : 0,
      };
    }),
  );

  svg
    .append("g")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("class", "rhythm-cell")
    .attr("x", (d) => x(d.hour))
    .attr("y", (d) => y(`${d.year}|${d.dateLabel}|${d.date}`))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 5)
    .attr("fill", (d) => (d.sessions ? color(d.sessions) : "#eef3f6"))
    .attr("opacity", (d) => (d.sessions ? 0.95 : 0.55))
    .on("mouseenter", (event, d) => {
      showTooltip(event, `${d.year} ${d.dateLabel}, ${d.hour}:00`, `${d.sessions} AI-related sessions.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      selectedTime = { year: d.year, date: d.date, dateLabel: d.dateLabel, hour: d.hour };
      selectedLink = null;
      setExplorerLens({ year: d.year, context: "All", query: "", link: null });
    });

  svg
    .append("g")
    .selectAll("text")
    .data(cells.filter((d) => d.sessions > 0))
    .join("text")
    .attr("class", "bar-label")
    .attr("text-anchor", "middle")
    .attr("x", (d) => x(d.hour) + x.bandwidth() / 2)
    .attr("y", (d) => y(`${d.year}|${d.dateLabel}|${d.date}`) + y.bandwidth() / 2 + 4)
    .text((d) => d.sessions);
}

function compassCoordinates(context) {
  const coordinates = {
    "Explicit tech/AI": { x: 0.35, y: 0.42, label: "tools and methods" },
    "Selection/assessment/methods": { x: 0.2, y: 0.24, label: "selection and assessment" },
    "Org/development/training": { x: 0.78, y: 0.78, label: "training and org development" },
    "DEI/accessibility": { x: 0.66, y: 0.58, label: "access and equity" },
    "Other/special": { x: 0.58, y: 0.36, label: "special and cross-cutting" },
  };
  return coordinates[context] || { x: 0.5, y: 0.5, label: shortContext(context) };
}

function drawUseCaseCompass(data) {
  const width = 980;
  const height = 560;
  const margin = { top: 76, right: 62, bottom: 76, left: 76 };
  const svg = makeSvg("#use-case-compass", width, height);
  const rows = CONTEXT_ORDER.map((context) => {
    const found = data.context_summary.find(
      (item) => item.conference_year === activeFocusYear && item.ai_context_group === context,
    );
    return {
      conference_year: activeFocusYear,
      ai_context_group: context,
      sessions: found ? found.sessions : 0,
      share: found ? found.share : 0,
      ...compassCoordinates(context),
    };
  });
  const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
  const size = d3
    .scaleSqrt()
    .domain([0, d3.max(rows, (d) => d.sessions) || 1])
    .range([14, 56]);

  const quadrants = [
    { x0: 0, x1: 0.5, y0: 0.5, y1: 1, color: "rgba(220, 236, 255, 0.72)" },
    { x0: 0.5, x1: 1, y0: 0.5, y1: 1, color: "rgba(255, 240, 196, 0.62)" },
    { x0: 0, x1: 0.5, y0: 0, y1: 0.5, color: "rgba(255, 231, 247, 0.62)" },
    { x0: 0.5, x1: 1, y0: 0, y1: 0.5, color: "rgba(236, 229, 255, 0.76)" },
  ];

  svg
    .append("g")
    .selectAll("rect")
    .data(quadrants)
    .join("rect")
    .attr("class", "compass-quadrant")
    .attr("x", (d) => x(d.x0))
    .attr("y", (d) => y(d.y1))
    .attr("width", (d) => x(d.x1) - x(d.x0))
    .attr("height", (d) => y(d.y0) - y(d.y1))
    .attr("fill", (d) => d.color);

  svg
    .append("rect")
    .attr("x", margin.left)
    .attr("y", margin.top)
    .attr("width", width - margin.left - margin.right)
    .attr("height", height - margin.top - margin.bottom)
    .attr("rx", 8)
    .attr("fill", "transparent")
    .attr("stroke", "#dce3ea");

  svg
    .append("line")
    .attr("class", "compass-axis-line")
    .attr("x1", x(0.5))
    .attr("x2", x(0.5))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);
  svg
    .append("line")
    .attr("class", "compass-axis-line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", y(0.5))
    .attr("y2", y(0.5));

  const quadrantLabels = [
    { text: "Individual + deterministic", x: 0.03, y: 0.08, anchor: "start" },
    { text: "Org + deterministic", x: 0.97, y: 0.08, anchor: "end" },
    { text: "Individual + judgment-rich", x: 0.03, y: 0.94, anchor: "start" },
    { text: "Org + judgment-rich", x: 0.97, y: 0.94, anchor: "end" },
  ];

  svg
    .append("g")
    .selectAll("text")
    .data(quadrantLabels)
    .join("text")
    .attr("class", "compass-quadrant-label")
    .attr("x", (d) => x(d.x))
    .attr("y", (d) => y(d.y))
    .attr("text-anchor", (d) => d.anchor)
    .text((d) => d.text);

  svg
    .append("text")
    .attr("class", "chart-note")
    .attr("x", width / 2)
    .attr("y", height - 22)
    .attr("text-anchor", "middle")
    .text("Individual-focused use cases → organization-focused use cases");

  svg
    .append("text")
    .attr("class", "chart-note")
    .attr("x", 24)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90,24,${height / 2})`)
    .text("Deterministic → judgment-rich");

  const nodes = svg
    .append("g")
    .selectAll("g")
    .data(rows)
    .join("g")
    .attr("class", "compass-node")
    .attr("transform", (d) => `translate(${x(d.x)},${y(d.y)})`)
    .on("mouseenter", (event, d) => {
      showTooltip(event, d.ai_context_group, `${d.sessions} AI-related context signals in ${activeFocusYear}.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      focusContext(d.ai_context_group);
      renderDataLens({ year: activeFocusYear, context: d.ai_context_group });
      renderSessionDrilldown("#meaning-session-drilldown", {
        year: activeFocusYear,
        context: d.ai_context_group,
      });
    });

  nodes
    .append("circle")
    .attr("r", 0)
    .attr("fill", (d) => COLORS.contexts[d.ai_context_group])
    .attr("opacity", (d) => (activeContext === "All" || activeContext === d.ai_context_group ? 0.88 : 0.22))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 2)
    .transition()
    .duration(650)
    .attr("r", (d) => size(d.sessions));

  nodes
    .append("text")
    .attr("class", "network-node-label")
    .attr("text-anchor", "middle")
    .attr("y", 4)
    .text((d) => d.sessions);

  nodes
    .append("text")
    .attr("class", "compass-node-label")
    .attr("text-anchor", "middle")
    .attr("y", (d) => (d.y < 0.32 ? -size(d.sessions) - 12 : size(d.sessions) + 18))
    .text((d) => shortContext(d.ai_context_group));

  svg
    .append("text")
    .attr("class", "chart-note")
    .attr("x", margin.left)
    .attr("y", 34)
    .text(`${activeFocusYear} AI use-case compass`);

  const topCompassContext = [...rows].sort((a, b) => b.sessions - a.sessions)[0];
  appendCallout(svg, {
    x: width - margin.right - 292,
    y: 24,
    width: 292,
    title: `${shortContext(topCompassContext.ai_context_group)} is largest`,
    copy: `Bubble size shows ${topCompassContext.sessions} context signals.`,
  });
}

function drawContextChart(data) {
  const width = 980;
  const height = 520;
  const margin = { top: 30, right: 84, bottom: 54, left: 218 };
  const svg = makeSvg("#context-chart", width, height);
  const years = getYears(data);
  const rows = CONTEXT_ORDER.flatMap((context) =>
    years.map((year) => {
      const found = data.context_summary.find(
        (d) => d.conference_year === year && d.ai_context_group === context,
      );
      return {
        context,
        year,
        value: found ? found[activeMetric] : 0,
        sessions: found ? found.sessions : 0,
        share: found ? found.share : 0,
      };
    }),
  );

  const y0 = d3.scaleBand().domain(CONTEXT_ORDER).range([margin.top, height - margin.bottom]).padding(0.24);
  const y1 = d3.scaleBand().domain(years).range([0, y0.bandwidth()]).padding(0.12);
  const maxValue = d3.max(rows, (d) => d.value) || 1;
  const x = d3
    .scaleLinear()
    .domain([0, activeMetric === "share" ? Math.max(0.42, maxValue) : maxValue])
    .nice()
    .range([margin.left, width - margin.right]);

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(5)
        .tickSize(-(height - margin.top - margin.bottom))
        .tickFormat(""),
    )
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(5)
        .tickFormat((d) => (activeMetric === "share" ? `${Math.round(d * 100)}%` : d)),
    );

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y0).tickSizeOuter(0))
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", x(0))
    .attr("y", (d) => y0(d.context) + y1(d.year))
    .attr("width", (d) => Math.max(0, x(d.value) - x(0)))
    .attr("height", y1.bandwidth())
    .attr("rx", 4)
    .attr("fill", (d) => yearColor(d.year))
    .attr("opacity", (d) => (activeContext === "All" || activeContext === d.context ? 1 : 0.34))
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      showTooltip(
        event,
        `${d.year}: ${d.context}`,
        activeMetric === "share" ? `${percent(d.share)} of AI-related context links.` : `${d.sessions} sessions.`,
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      activeContext = d.context;
      selectedLink = null;
      drawContextChart(storyData);
      setExplorerLens({ year: d.year, context: d.context, query: "", link: null });
    });

  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", (d) => x(d.value) + 8)
    .attr("y", (d) => y0(d.context) + y1(d.year) + y1.bandwidth() / 2 + 4)
    .text((d) => (activeMetric === "share" ? percent(d.share) : d.sessions));

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 18})`);
  years.forEach((year, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 92},0)`);
    item.append("rect").attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", yearColor(year));
    item
      .append("text")
      .attr("x", 22)
      .attr("y", 12)
      .attr("fill", "#17202a")
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .text(year);
  });
}

function drawContextNetwork(data) {
  const width = 980;
  const height = 520;
  const center = { x: width / 2, y: height / 2 + 12 };
  const radius = 164;
  const svg = makeSvg("#context-network", width, height);
  const nodes = data.context_network.nodes.filter((d) => d.year === activeNetworkYear);
  const links = data.context_network.links.filter((d) => d.year === activeNetworkYear);
  const nodeById = new Map(nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(1, nodes.length)) * Math.PI * 2;
    return [
      node.id,
      {
        ...node,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      },
    ];
  }));
  const maxSessions = d3.max(nodes, (d) => d.sessions) || 1;
  const size = d3.scaleSqrt().domain([0, maxSessions]).range([18, 54]);
  const linkWidth = d3
    .scaleLinear()
    .domain([0, d3.max(links, (d) => d.sessions) || 1])
    .range([1.4, 8]);

  svg
    .append("text")
    .attr("x", 26)
    .attr("y", 34)
    .attr("class", "chart-note")
    .text(`${activeNetworkYear} AI context adjacency`);

  svg
    .append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("x1", (d) => nodeById.get(d.source).x)
    .attr("y1", (d) => nodeById.get(d.source).y)
    .attr("x2", (d) => nodeById.get(d.target).x)
    .attr("y2", (d) => nodeById.get(d.target).y)
    .attr("stroke", "#aebbc7")
    .attr("stroke-width", (d) => linkWidth(d.sessions))
    .attr("stroke-linecap", "round")
    .attr("opacity", (d) => (selectedLink && selectedLink.source === d.source && selectedLink.target === d.target ? 1 : 0.72))
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      showTooltip(event, `${d.source} + ${d.target}`, `${d.sessions} sessions connect these contexts.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      selectedLink = { source: d.source, target: d.target };
      setExplorerLens({ year: activeNetworkYear, context: "All", query: "", link: selectedLink });
      drawContextNetwork(storyData);
    });

  svg
    .append("g")
    .selectAll("text")
    .data(links.filter((d) => d.sessions >= 2))
    .join("text")
    .attr("class", "network-link-label")
    .attr("text-anchor", "middle")
    .attr("x", (d) => (nodeById.get(d.source).x + nodeById.get(d.target).x) / 2)
    .attr("y", (d) => (nodeById.get(d.source).y + nodeById.get(d.target).y) / 2 - 6)
    .text((d) => d.sessions);

  const nodeGroup = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", (d) => {
      const node = nodeById.get(d.id);
      return `translate(${node.x},${node.y})`;
    });

  nodeGroup
    .append("circle")
    .attr("r", (d) => size(d.sessions))
    .attr("fill", (d) => COLORS.contexts[d.id])
    .attr("opacity", (d) => (activeContext === "All" || activeContext === d.id ? 0.94 : 0.44))
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      showTooltip(event, d.id, `${d.sessions} AI-related sessions in ${activeNetworkYear}. Click to filter talks.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      activeContext = d.id;
      selectedLink = null;
      setExplorerLens({ year: activeNetworkYear, context: d.id, query: "", link: null });
      drawContextChart(storyData);
      drawContextNetwork(storyData);
    });

  nodeGroup
    .append("text")
    .attr("class", "network-node-label")
    .attr("text-anchor", "middle")
    .attr("y", 4)
    .text((d) => d.sessions);

  nodeGroup
    .append("text")
    .attr("class", "network-node-label")
    .attr("text-anchor", "middle")
    .attr("y", (d) => size(d.sessions) + 18)
    .text((d) => d.id.replace("/methods", "").replace("/training", ""));

  renderNetworkInsights(data, nodes, links);
}

function renderNetworkInsights(data, nodes, links) {
  const strongest = [...links].sort((a, b) => b.sessions - a.sessions)[0];
  const biggest = [...nodes].sort((a, b) => b.sessions - a.sessions)[0];
  const bridgeCount = links.reduce((total, link) => total + link.sessions, 0);
  const insights = [
    {
      title: "Largest node",
      copy: biggest ? `${biggest.id} carries ${biggest.sessions} AI-related sessions in this map.` : "No nodes loaded.",
    },
    {
      title: "Strongest adjacency",
      copy: strongest
        ? `${strongest.source} and ${strongest.target} co-occur in ${strongest.sessions} sessions.`
        : "No cross-context links for this year.",
    },
    {
      title: "Cross-context sessions",
      copy: `${bridgeCount} session-context links show where AI topics sit across more than one program neighborhood.`,
    },
  ];

  const cards = d3.select("#network-insights").selectAll("article").data(insights);
  const entered = cards.enter().append("article");
  entered.append("h3");
  entered.append("p");
  entered.merge(cards).select("h3").text((d) => d.title);
  entered.merge(cards).select("p").text((d) => d.copy);
  cards.exit().remove();
}

function renderFocusInsights(data) {
  const yearSummary = data.ai_summary.find((item) => item.year === activeFocusYear);
  const contextRows = data.context_summary.filter((item) => item.conference_year === activeFocusYear);
  const topContext = [...contextRows].sort((a, b) => b.sessions - a.sessions)[0];
  const networkLinks = data.context_network.links.filter((item) => item.year === activeFocusYear);
  const strongestLink = [...networkLinks].sort((a, b) => b.sessions - a.sessions)[0];
  const cards = [
    {
      label: "Focused year",
      value: activeFocusYear,
      copy: yearSummary
        ? `${yearSummary.ai_related_sessions} AI-related sessions, ${percent(yearSummary.ai_share)} of the parsed program.`
        : "No summary available.",
    },
    {
      label: "Dominant context",
      value: topContext ? shortContext(topContext.ai_context_group) : "n/a",
      copy: topContext ? `${topContext.sessions} AI-related context signals in this year.` : "No context signals found.",
    },
    {
      label: "Strongest bridge",
      value: strongestLink ? `${strongestLink.source.split("/")[0]} + ${strongestLink.target.split("/")[0]}` : "n/a",
      copy: strongestLink ? `${strongestLink.sessions} sessions connect those use-case neighborhoods.` : "No bridges found.",
    },
  ];

  const articles = d3.select("#focus-insights").selectAll("article").data(cards);
  const entered = articles.enter().append("article");
  entered.append("span").attr("class", "stat-label");
  entered.append("strong");
  entered.append("p");
  entered.merge(articles).select(".stat-label").text((d) => d.label);
  entered.merge(articles).select("strong").text((d) => d.value);
  entered.merge(articles).select("p").text((d) => d.copy);
  articles.exit().remove();
}

function getContextRowsForYear(data, year) {
  return CONTEXT_ORDER.map((context) => {
    const found = data.context_summary.find(
      (item) => item.conference_year === year && item.ai_context_group === context,
    );
    return {
      context,
      sessions: found ? found.sessions : 0,
      share: found ? found.share : 0,
    };
  });
}

function renderStoryCaption(data) {
  const years = getYears(data);
  const current = data.ai_summary.find((item) => item.year === activeFocusYear);
  const previousYear = years[years.indexOf(activeFocusYear) - 1];
  const previous = data.ai_summary.find((item) => item.year === previousYear);
  const contextRows = getContextRowsForYear(data, activeFocusYear);
  const topContext = [...contextRows].sort((a, b) => b.sessions - a.sessions)[0];
  const delta = previous ? current.ai_related_sessions - previous.ai_related_sessions : null;
  const deltaText =
    delta === null
      ? "This is the baseline year for the story."
      : `${delta >= 0 ? "+" : ""}${delta} AI-related sessions versus ${previousYear}.`;
  document.querySelector("#story-caption").textContent =
    `${activeFocusYear}: ${current.ai_related_sessions} AI-related sessions. ` +
    `${deltaText} ${shortContext(topContext.context)} is the strongest context signal.`;
}

function renderRiverInsights(data) {
  const years = getYears(data);
  const first = data.ai_summary.find((item) => item.year === years[0]);
  const current = data.ai_summary.find((item) => item.year === activeFocusYear);
  const currentContexts = getContextRowsForYear(data, activeFocusYear);
  const topContext = [...currentContexts].sort((a, b) => b.sessions - a.sessions)[0];
  const sideRows = getSideRowsForYear(data, activeFocusYear);
  const iSide = sideRows.find((item) => item.side === "I-side selection/assessment");
  const oSide = sideRows.find((item) => item.side === "O-side org/development");
  const balance = oSide.sessions - iSide.sessions;
  const cards = [
    {
      label: "Volume arc",
      value: `${percent(first.ai_share)} → ${percent(current.ai_share)}`,
      copy: `AI-related sessions are ${percent(current.ai_share)} of the ${activeFocusYear} parsed program.`,
    },
    {
      label: riverMode === "sides" ? "Two-lane comparison" : "Strongest band",
      value: riverMode === "sides" ? `${iSide.sessions} vs ${oSide.sessions}` : shortContext(topContext.context),
      copy:
        riverMode === "sides"
          ? `I-side selection/assessment has ${iSide.sessions} signals; O-side org/development plus DEI/accessibility has ${oSide.sessions}.`
          : `${topContext.sessions} AI-related context signals sit in this band for ${activeFocusYear}.`,
    },
    {
      label: "O-side balance",
      value: balance >= 0 ? `+${balance}` : String(balance),
      copy:
        balance >= 0
          ? "O-side people-context signals exceed selection signals in the focused year."
          : "Selection signals still exceed O-side people-context signals in the focused year.",
    },
  ];

  const articles = d3.select("#river-insights").selectAll("article").data(cards);
  const entered = articles.enter().append("article");
  entered.append("span").attr("class", "stat-label");
  entered.append("strong");
  entered.append("p");
  entered.merge(articles).select(".stat-label").text((d) => d.label);
  entered.merge(articles).select("strong").text((d) => d.value);
  entered.merge(articles).select("p").text((d) => d.copy);
  articles.exit().remove();
}

function renderDynamicTakeaway(data) {
  const target = document.querySelector("#dynamic-takeaway");
  if (!target || !data) return;
  const years = getYears(data);
  const first = data.ai_summary.find((item) => item.year === years[0]);
  const current = data.ai_summary.find((item) => item.year === activeFocusYear);
  const sideRows = getSideRowsForYear(data, activeFocusYear);
  const iSide = sideRows.find((item) => item.side === "I-side selection/assessment");
  const oSide = sideRows.find((item) => item.side === "O-side org/development");
  const sidePhrase =
    oSide.sessions >= iSide.sessions
      ? `O-side people-context signals are ${oSide.sessions - iSide.sessions} higher than selection/assessment.`
      : `Selection/assessment signals are ${iSide.sessions - oSide.sessions} higher than O-side people-context signals.`;
  if (activeContext !== "All") {
    const context = getContextRowsForYear(data, activeFocusYear).find((item) => item.context === activeContext);
    target.textContent = `${activeFocusYear}: ${shortContext(activeContext)} contributes ${context ? context.sessions : 0} AI-related context signals. ${contextMicrocopy(activeContext)}`;
    return;
  }
  if (activeSide !== "All") {
    const side = sideRows.find((item) => item.side === activeSide);
    target.textContent = `${activeFocusYear}: ${activeSide} accounts for ${side ? side.sessions : 0} AI-related context signals.`;
    return;
  }
  target.textContent =
    `${activeFocusYear}: AI-related sessions are ${percent(current.ai_share)} of the parsed program, ` +
    `up from ${percent(first.ai_share)} in ${first.year}. ${sidePhrase}`;
}

function drawTrackChart(data) {
  const width = 980;
  const height = 560;
  const margin = { top: 28, right: 54, bottom: 46, left: 270 };
  const svg = makeSvg("#track-chart", width, height);
  const years = getYears(data);
  const latestYear = years[years.length - 1];
  const rows = data.track_summary
    .filter((d) => d.conference_year === latestYear)
    .slice(0, 8)
    .map((d) => {
      return {
        track: d.track,
        latestSessions: d.sessions,
        values: years.map((year) => {
          const found = data.track_summary.find((item) => item.conference_year === year && item.track === d.track);
          return { year, sessions: found ? found.sessions : 0 };
        }),
      };
    });

  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.track))
    .range([margin.top, height - margin.bottom])
    .padding(0.24);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows.flatMap((d) => d.values), (d) => d.sessions) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  svg
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5));

  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSizeOuter(0))
    .call((g) => g.select(".domain").remove());

  svg
    .append("g")
    .selectAll("line")
    .data(rows)
    .join("line")
    .attr("x1", (d) => x(d3.min(d.values, (item) => item.sessions) || 0))
    .attr("x2", (d) => x(d3.max(d.values, (item) => item.sessions) || 0))
    .attr("y1", (d) => y(d.track) + y.bandwidth() / 2)
    .attr("y2", (d) => y(d.track) + y.bandwidth() / 2)
    .attr("stroke", "#b7c3ce")
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.75);

  const trackPoints = rows.flatMap((row) => row.values.map((value) => ({ ...value, track: row.track })));
  svg
    .append("g")
    .selectAll("circle")
    .data(trackPoints)
    .join("circle")
    .attr("cx", (d) => x(d.sessions))
    .attr("cy", (d) => y(d.track) + y.bandwidth() / 2)
    .attr("r", 6.5)
    .attr("fill", (d) => yearColor(d.year))
    .attr("stroke", "#fbfaf6")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("mouseenter", (event, d) => {
      showTooltip(event, `${d.year}: ${d.track}`, `${d.sessions} AI-related sessions. Click to search this track.`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("click", (_, d) => {
      setExplorerLens({ year: d.year, context: "All", query: d.track, link: null });
    });

  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", (d) => x(d.latestSessions) + 12)
    .attr("y", (d) => y(d.track) + y.bandwidth() / 2 + 4)
    .text((d) => d.latestSessions);

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 14})`);
  years.forEach((year, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 92},0)`);
    item.append("circle").attr("cx", 7).attr("cy", 7).attr("r", 7).attr("fill", yearColor(year));
    item
      .append("text")
      .attr("x", 22)
      .attr("y", 12)
      .attr("fill", "#17202a")
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .text(year);
  });
}

function renderFormatSummary(data) {
  const years = getYears(data);
  const articles = d3.select("#format-summary").selectAll("article").data(years);
  const entered = articles.enter().append("article");
  entered.append("h3");
  entered.append("div").attr("class", "format-list");

  const merged = entered.merge(articles);
  merged.select("h3").text((year) => `${year} top AI-related formats`);
  merged.each(function (year) {
    const rows = data.format_summary.filter((d) => d.conference_year === year).slice(0, 5);
    const list = d3.select(this).select(".format-list");
    const items = list.selectAll(".format-row").data(rows, (d) => d.session_format);
    const itemEnter = items.enter().append("div").attr("class", "format-row");
    itemEnter.append("span");
    itemEnter.append("strong");
    itemEnter.merge(items).select("span").text((d) => d.session_format);
    itemEnter.merge(items).select("strong").text((d) => d.sessions);
    items.exit().remove();
  });
}

function wireYearScrubber(data) {
  const scrubber = document.querySelector("#year-scrubber");
  scrubber.innerHTML = "";
  [...getYears(data)].reverse().forEach((year) => {
    const button = document.createElement("button");
    button.className = "focus-year";
    button.type = "button";
    button.dataset.year = String(year);
    button.textContent = year;
    button.addEventListener("click", () => focusYear(year, { updateExplorer: true }));
    scrubber.appendChild(button);
  });
  syncYearControls();
}

function wireBaselineControls(data) {
  const container = document.querySelector("#baseline-current");
  if (!container) return;
  const years = getYears(data);
  const buttons = [
    { label: `${years[0]} baseline`, year: years[0] },
    { label: `${years[years.length - 1]} current`, year: years[years.length - 1] },
  ];
  container.innerHTML = "";
  buttons.forEach((item) => {
    const button = document.createElement("button");
    button.className = "compare-year";
    button.type = "button";
    button.dataset.year = String(item.year);
    button.textContent = item.label;
    button.addEventListener("click", () => {
      stopReplay();
      focusYear(item.year, { updateExplorer: true });
    });
    container.appendChild(button);
  });
  syncYearControls();
}

function wireRiverModeToggle(data) {
  document.querySelectorAll(".river-mode").forEach((button) => {
    button.addEventListener("click", () => {
      riverMode = button.dataset.mode;
      activeSide = "All";
      activeContext = "All";
      syncRiverModeControls();
      drawSignalRiver(data);
      renderRiverInsights(data);
      renderActiveLens(data);
      renderDynamicTakeaway(data);
      syncStoryBeatControls();
    });
  });
  syncRiverModeControls();
}

function stopReplay() {
  if (replayTimer) {
    window.clearInterval(replayTimer);
    replayTimer = null;
  }
  const button = document.querySelector("#replay-years");
  if (button) {
    button.classList.remove("active");
    button.textContent = "Play year replay";
  }
}

function startReplay(data) {
  const years = getYears(data);
  replayIndex = 0;
  const button = document.querySelector("#replay-years");
  button.classList.add("active");
  button.textContent = "Pause replay";

  const advance = () => {
    const year = years[replayIndex % years.length];
    focusYear(year, { updateExplorer: true });
    replayIndex += 1;
    if (replayIndex >= years.length) {
      stopReplay();
    }
  };

  advance();
  replayTimer = window.setInterval(advance, 1400);
}

function wireReplayControls(data) {
  const button = document.querySelector("#replay-years");
  button.addEventListener("click", () => {
    if (replayTimer) {
      stopReplay();
    } else {
      startReplay(data);
    }
  });
}

function wireNetworkButtons() {
  document.querySelectorAll(".network-year").forEach((button) => {
    button.addEventListener("click", () => {
      focusYear(button.dataset.year, { updateExplorer: true });
    });
  });
}

function populateSessionContextOptions(data) {
  const select = document.querySelector("#session-context");
  select.innerHTML = '<option value="All">All contexts</option>';
  const contexts = [...new Set(data.session_explorer.map((d) => d.context))].sort(
    (a, b) => CONTEXT_ORDER.indexOf(a) - CONTEXT_ORDER.indexOf(b),
  );
  contexts.forEach((context) => {
    const option = document.createElement("option");
    option.value = context;
    option.textContent = context;
    select.appendChild(option);
  });
}

function populateSessionYearOptions(data) {
  const select = document.querySelector("#session-year");
  select.innerHTML = '<option value="All">All years</option>';
  [...getYears(data)].reverse().forEach((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = year;
    select.appendChild(option);
  });
}

function filteredSessions(data) {
  const query = document.querySelector("#session-search").value.toLowerCase().trim();
  const year = document.querySelector("#session-year").value;
  const context = document.querySelector("#session-context").value;
  return data.session_explorer.filter((session) => {
    const matchesYear = year === "All" || String(session.year) === year;
    const groups = session.context_groups || [session.context];
    const matchesContext = context === "All" || groups.includes(context);
    const matchesLink =
      !selectedLink || (groups.includes(selectedLink.source) && groups.includes(selectedLink.target));
    const matchesTime =
      !selectedTime ||
      (session.year === selectedTime.year &&
        session.date === selectedTime.date &&
        Number(String(session.start_time || "").slice(0, 2)) === selectedTime.hour);
    const haystack = [
      session.title,
      session.tracks,
      session.session_format,
      session.context,
      session.description,
      session.location,
      session.date,
      session.start_time,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesYear && matchesContext && matchesLink && matchesTime && matchesQuery;
  });
}

function renderActiveLens(data = storyData) {
  if (!data) return;
  const current = data.ai_summary.find((item) => item.year === activeFocusYear);
  const title =
    activeContext !== "All"
      ? `${activeFocusYear}: ${shortContext(activeContext)} emphasis`
      : activeSide !== "All"
        ? `${activeFocusYear}: ${activeSide}`
        : `${activeFocusYear} program emphasis`;
  const detail =
    activeContext !== "All"
      ? contextMicrocopy(activeContext)
      : activeSide !== "All"
        ? "This lens simplifies the story into the I-side/O-side distinction."
        : `${current.ai_related_sessions} AI-related sessions, ${percent(current.ai_share)} of the parsed program. Use the controls to compare years and use-case emphasis.`;
  document.querySelector("#active-lens-title").textContent = title;
  document.querySelector("#active-lens-detail").textContent = detail;
}

function renderSessionExplorer(data) {
  const query = document.querySelector("#session-search").value;
  const sessions = filteredSessions(data);
  const visible = sessions.slice(0, 24);
  renderActiveLens(data);
  const authorCount = sessions.filter((session) => session.speakers).length;
  document.querySelector("#session-count").textContent =
    `${sessions.length}/${data.session_explorer.length} talks visible`;
  document.querySelector("#author-coverage").textContent =
    sessions.length > 0
      ? `Author names were parsed for ${authorCount} of these ${sessions.length} visible sessions.`
      : "";

  d3.select("#session-list").selectAll(".empty-state").remove();
  const cards = d3.select("#session-list").selectAll(".session-card").data(visible, (d) => `${d.year}-${d.title}`);
  const entered = cards.enter().append("article").attr("class", "session-card");
  entered.append("div").attr("class", "example-meta");
  entered.append("h3");
  entered.append("p").attr("class", "session-authors");
  entered.append("p").attr("class", "session-tracks");
  entered.append("p").attr("class", "session-description");

  const merged = entered.merge(cards);
  merged.select(".example-meta").html("");
  merged.each(function (d) {
    const meta = d3.select(this).select(".example-meta");
    [d.year, d.context, d.session_format, d.visible_ai_signal ? "visible AI signal" : "abstract signal"].forEach(
      (value) => meta.append("span").attr("class", "pill").text(value),
    );
  });
  merged.select("h3").html((d) => highlightTerm(d.title, query));
  merged
    .select(".session-authors")
    .classed("is-hidden", (d) => !d.speakers)
    .html((d) => (d.speakers ? highlightTerm(`Authors: ${d.speakers}`, query) : ""));
  merged.select(".session-tracks").html((d) => highlightTerm(sessionDescriptor(d), query));
  merged.select(".session-description").html((d) => highlightTerm(d.description || d.location, query));
  cards.exit().remove();

  if (visible.length === 0) {
    d3.select("#session-list")
      .append("div")
      .attr("class", "empty-state")
      .text("No sessions match this lens yet. Try clearing search or resetting exploration.");
  }
}

function wireSessionExplorer(data) {
  if (!document.querySelector("#session-list")) {
    renderActiveLens(data);
    return;
  }
  populateSessionYearOptions(data);
  populateSessionContextOptions(data);
  ["#session-search", "#session-year", "#session-context"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      selectedLink = null;
      selectedTime = null;
      if (selector === "#session-year" && document.querySelector("#session-year").value !== "All") {
        activeFocusYear = Number(document.querySelector("#session-year").value);
        activeNetworkYear = activeFocusYear;
        syncYearControls();
        drawHeroSignalField(data);
        drawSignalRiver(data);
        renderFocusInsights(data);
        renderStoryCaption(data);
        renderRiverInsights(data);
        drawUseCaseCompass(data);
      }
      renderSessionExplorer(data);
    });
  });
  renderSessionExplorer(data);
}

function applyContextDrill({ year, context = "All", targetSelector = "#river-session-drilldown" }) {
  activeFocusYear = Number(year);
  activeNetworkYear = activeFocusYear;
  activeSide = "All";
  activeContext = context;
  riverMode = "contexts";
  selectedLink = null;
  selectedTime = null;
  syncRiverModeControls();
  syncYearControls();
  drawHeroSignalField(storyData);
  drawSignalRiver(storyData);
  drawUseCaseCompass(storyData);
  renderFocusInsights(storyData);
  renderStoryCaption(storyData);
  renderRiverInsights(storyData);
  renderActiveLens(storyData);
  renderDynamicTakeaway(storyData);
  renderSessionDrilldown(targetSelector, { year: activeFocusYear, context });
}

function wireDataStoryCards(data) {
  document.querySelectorAll(".data-story-card").forEach((card) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    const activate = () => {
      const year = Number(card.dataset.drillYear || getYears(data).at(-1));
      const context = card.dataset.drillContext || "All";
      applyContextDrill({ year, context, targetSelector: "#river-session-drilldown" });
      const target = document.querySelector("#shift-step");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function wireSideDrillCards() {
  document.querySelectorAll(".side-drill-card").forEach((card) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    const activate = () => {
      const side = card.dataset.side;
      if (!side) return;
      activeSide = side;
      activeContext = "All";
      riverMode = "sides";
      selectedLink = null;
      selectedTime = null;
      syncRiverModeControls();
      drawSignalRiver(storyData);
      drawUseCaseCompass(storyData);
      renderRiverInsights(storyData);
      renderActiveLens(storyData);
      renderDynamicTakeaway(storyData);
      renderDataLens({ year: activeFocusYear, side });
      renderSessionDrilldown("#meaning-session-drilldown", { year: activeFocusYear, side });
    };
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function wireMetricButtons() {
  document.querySelectorAll(".metric-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      activeMetric = button.dataset.metric;
      document.querySelectorAll(".metric-toggle").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      drawContextChart(storyData);
    });
  });
}

async function init() {
  try {
    const response = await fetch("data/siop_ai_story.json");
    storyData = await response.json();
    setHeroStats(storyData);
    drawHeroSignalField(storyData);
    drawSignalRiver(storyData);
    drawUseCaseCompass(storyData);
    renderFocusInsights(storyData);
    renderStoryCaption(storyData);
    renderRiverInsights(storyData);
    renderDynamicTakeaway(storyData);
    wireMetricButtons();
    renderStoryBeatControls();
    wireYearScrubber(storyData);
    wireBaselineControls(storyData);
    wireRiverModeToggle(storyData);
    wireReplayControls(storyData);
    wireNetworkButtons();
    wireSessionExplorer(storyData);
    wireDataStoryCards(storyData);
    wireSideDrillCards();
    document.querySelector("#reset-exploration").addEventListener("click", resetExploration);
  } catch (error) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="error-banner"><strong>Data failed to load.</strong> ${error.message}</div>`,
    );
  }
}

window.addEventListener("DOMContentLoaded", init);
