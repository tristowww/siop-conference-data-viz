const COLORS = {
  language: "#255c99",
  visible: "#16817a",
  2025: "#5a7f2e",
  2026: "#c75b47",
  contexts: {
    "Explicit tech/AI": "#255c99",
    "Selection/assessment/methods": "#c1841f",
    "Org/development/training": "#16817a",
    "DEI/accessibility": "#7556a8",
    "Other/special": "#6b7280",
  },
};

const CONTEXT_ORDER = [
  "Explicit tech/AI",
  "Selection/assessment/methods",
  "Org/development/training",
  "DEI/accessibility",
  "Other/special",
];

let activeMetric = "sessions";
let activeContext = "All";
let activeNetworkYear = 2026;
let selectedLink = null;
let storyData;

function percent(value) {
  return `${Math.round(value * 100)}%`;
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

function setExplorerLens({ year = null, context = null, query = null, link = undefined } = {}) {
  if (year !== null) document.querySelector("#session-year").value = String(year);
  if (context !== null) document.querySelector("#session-context").value = context;
  if (query !== null) document.querySelector("#session-search").value = query;
  if (link !== undefined) selectedLink = link;
  renderSessionExplorer(storyData);
}

function resetExploration() {
  activeContext = "All";
  selectedLink = null;
  document.querySelector("#session-year").value = "All";
  document.querySelector("#session-context").value = "All";
  document.querySelector("#session-search").value = "";
  renderExamples(storyData);
  drawContextChart(storyData);
  drawContextNetwork(storyData);
  drawTrackChart(storyData);
  updateFilterButtons();
  renderSessionExplorer(storyData);
}

function setHeroStats(data) {
  const [y2025, y2026] = data.ai_summary;
  document.querySelector("#ai-language-stat").textContent =
    `${percent(y2025.ai_share)} -> ${percent(y2026.ai_share)}`;
  document.querySelector("#ai-language-detail").textContent =
    `${y2025.ai_related_sessions} of ${y2025.total_sessions} sessions in 2025; ` +
    `${y2026.ai_related_sessions} of ${y2026.total_sessions} in 2026.`;
  document.querySelector("#visible-ai-stat").textContent =
    `${percent(y2025.visible_ai_share)} -> ${percent(y2026.visible_ai_share)}`;
  document.querySelector("#visible-ai-detail").textContent =
    `Visible title, track, and format signals changed by ` +
    `${formatDelta(y2026.visible_ai_share, y2025.visible_ai_share)}.`;

  const selection2025 = data.context_summary.find(
    (d) => d.conference_year === 2025 && d.ai_context_group === "Selection/assessment/methods",
  );
  const selection2026 = data.context_summary.find(
    (d) => d.conference_year === 2026 && d.ai_context_group === "Selection/assessment/methods",
  );
  document.querySelector("#context-stat").textContent =
    `${percent(selection2025.share)} -> ${percent(selection2026.share)}`;
  document.querySelector("#method-copy").textContent = data.summary.method_note;
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

function drawContextChart(data) {
  const width = 980;
  const height = 520;
  const margin = { top: 30, right: 84, bottom: 54, left: 218 };
  const svg = makeSvg("#context-chart", width, height);
  const rows = CONTEXT_ORDER.flatMap((context) =>
    [2025, 2026].map((year) => {
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
  const y1 = d3.scaleBand().domain([2025, 2026]).range([0, y0.bandwidth()]).padding(0.12);
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
    .attr("fill", (d) => (d.year === 2025 ? COLORS[2025] : COLORS[2026]))
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
      renderExamples(storyData);
      drawContextChart(storyData);
      updateFilterButtons();
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
  [2025, 2026].forEach((year, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 92},0)`);
    item.append("rect").attr("width", 14).attr("height", 14).attr("rx", 3).attr("fill", COLORS[year]);
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
      renderExamples(storyData);
      updateFilterButtons();
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

function drawTrackChart(data) {
  const width = 980;
  const height = 560;
  const margin = { top: 28, right: 54, bottom: 46, left: 270 };
  const svg = makeSvg("#track-chart", width, height);
  const rows = data.track_summary
    .filter((d) => d.conference_year === 2026)
    .slice(0, 8)
    .map((d) => {
      const previous = data.track_summary.find(
        (item) => item.conference_year === 2025 && item.track === d.track,
      );
      return {
        track: d.track,
        sessions2026: d.sessions,
        sessions2025: previous ? previous.sessions : 0,
      };
    });

  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.track))
    .range([margin.top, height - margin.bottom])
    .padding(0.24);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.sessions2026) || 1])
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
    .attr("x1", (d) => x(d.sessions2025))
    .attr("x2", (d) => x(d.sessions2026))
    .attr("y1", (d) => y(d.track) + y.bandwidth() / 2)
    .attr("y2", (d) => y(d.track) + y.bandwidth() / 2)
    .attr("stroke", "#b7c3ce")
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.75);

  [2025, 2026].forEach((year) => {
    svg
      .append("g")
      .selectAll("circle")
      .data(rows)
      .join("circle")
      .attr("cx", (d) => x(year === 2025 ? d.sessions2025 : d.sessions2026))
      .attr("cy", (d) => y(d.track) + y.bandwidth() / 2)
      .attr("r", 7)
      .attr("fill", COLORS[year])
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        const sessions = year === 2025 ? d.sessions2025 : d.sessions2026;
        showTooltip(event, `${year}: ${d.track}`, `${sessions} AI-related sessions. Click to search this track.`);
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (_, d) => {
        setExplorerLens({ year, context: "All", query: d.track, link: null });
      });
  });

  svg
    .append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", (d) => x(d.sessions2026) + 12)
    .attr("y", (d) => y(d.track) + y.bandwidth() / 2 + 4)
    .text((d) => d.sessions2026);

  const legend = svg.append("g").attr("transform", `translate(${margin.left},${height - 14})`);
  [2025, 2026].forEach((year, index) => {
    const item = legend.append("g").attr("transform", `translate(${index * 92},0)`);
    item.append("circle").attr("cx", 7).attr("cy", 7).attr("r", 7).attr("fill", COLORS[year]);
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
  const years = [2025, 2026];
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

function wireNetworkButtons() {
  document.querySelectorAll(".network-year").forEach((button) => {
    button.addEventListener("click", () => {
      activeNetworkYear = Number(button.dataset.year);
      document.querySelectorAll(".network-year").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      drawContextNetwork(storyData);
    });
  });
}

function updateFilterButtons() {
  d3.selectAll("#example-filters button").classed("active", function () {
    return this.dataset.context === activeContext;
  });
}

function populateSessionContextOptions(data) {
  const select = document.querySelector("#session-context");
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
    const haystack = [
      session.title,
      session.tracks,
      session.session_format,
      session.context,
      session.description,
      session.location,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesYear && matchesContext && matchesLink && matchesQuery;
  });
}

function renderActiveLens(sessions) {
  const year = document.querySelector("#session-year").value;
  const context = document.querySelector("#session-context").value;
  const query = document.querySelector("#session-search").value.trim();
  const pieces = [];
  if (year !== "All") pieces.push(year);
  if (context !== "All") pieces.push(context);
  if (selectedLink) pieces.push(`${selectedLink.source} + ${selectedLink.target}`);
  if (query) pieces.push(`"${query}"`);
  document.querySelector("#active-lens-title").textContent =
    pieces.length > 0 ? pieces.join(" / ") : "All AI-related sessions";
  document.querySelector("#active-lens-detail").textContent =
    `${sessions.length} talks visible. Click a chart mark, network node, or reset to change the lens.`;
}

function renderSessionExplorer(data) {
  const query = document.querySelector("#session-search").value;
  const sessions = filteredSessions(data);
  const visible = sessions.slice(0, 24);
  renderActiveLens(sessions);
  document.querySelector("#session-count").textContent =
    `${sessions.length}/${data.session_explorer.length} talks visible`;

  d3.select("#session-list").selectAll(".empty-state").remove();
  const cards = d3.select("#session-list").selectAll(".session-card").data(visible, (d) => `${d.year}-${d.title}`);
  const entered = cards.enter().append("article").attr("class", "session-card");
  entered.append("div").attr("class", "example-meta");
  entered.append("h3");
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
  merged.select(".session-tracks").html((d) => highlightTerm(d.tracks, query));
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
  populateSessionContextOptions(data);
  ["#session-search", "#session-year", "#session-context"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      selectedLink = null;
      renderSessionExplorer(data);
      drawContextNetwork(data);
    });
  });
  renderSessionExplorer(data);
}

function renderFilters(data) {
  const contexts = ["All", ...new Set(data.examples.map((d) => d.ai_context_group))];
  d3.select("#example-filters")
    .selectAll("button")
    .data(contexts)
    .join("button")
    .attr("type", "button")
    .attr("data-context", (d) => d)
    .classed("active", (d) => d === activeContext)
    .text((d) => d)
    .on("click", (_, d) => {
      activeContext = d;
      renderExamples(data);
      drawContextChart(data);
      updateFilterButtons();
    });
}

function renderExamples(data) {
  const examples =
    activeContext === "All"
      ? data.examples
      : data.examples.filter((example) => example.ai_context_group === activeContext);
  const cards = d3.select("#examples").selectAll(".example-card").data(examples, (d) => `${d.year}-${d.title}`);

  const entered = cards.enter().append("article").attr("class", "example-card");
  entered.append("div").attr("class", "example-meta");
  entered.append("h3");
  entered.append("p");

  const merged = entered.merge(cards);
  merged.select(".example-meta").html("");
  merged.each(function (d) {
    const meta = d3.select(this).select(".example-meta");
    [d.year, d.ai_context_group, d.session_format].forEach((value) => {
      meta.append("span").attr("class", "pill").text(value);
    });
  });
  merged.select("h3").text((d) => d.title);
  merged.select("p").text((d) => d.description || d.tracks);
  cards.exit().remove();
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
    drawHeadlineChart(storyData);
    drawContextChart(storyData);
    drawContextNetwork(storyData);
    drawTrackChart(storyData);
    renderFormatSummary(storyData);
    renderFilters(storyData);
    renderExamples(storyData);
    wireMetricButtons();
    wireNetworkButtons();
    wireSessionExplorer(storyData);
    document.querySelector("#reset-exploration").addEventListener("click", resetExploration);
  } catch (error) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="method-note"><strong>Data failed to load.</strong> ${error.message}</div>`,
    );
  }
}

window.addEventListener("DOMContentLoaded", init);
