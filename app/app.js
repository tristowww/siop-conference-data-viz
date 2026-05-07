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
    .attr("fill", (d) => d.color);

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
    .on("click", (_, d) => {
      activeContext = d.context;
      renderExamples(storyData);
      drawContextChart(storyData);
      updateFilterButtons();
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
    .attr("stroke-linecap", "round");

  [2025, 2026].forEach((year) => {
    svg
      .append("g")
      .selectAll("circle")
      .data(rows)
      .join("circle")
      .attr("cx", (d) => x(year === 2025 ? d.sessions2025 : d.sessions2026))
      .attr("cy", (d) => y(d.track) + y.bandwidth() / 2)
      .attr("r", 7)
      .attr("fill", COLORS[year]);
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

function updateFilterButtons() {
  d3.selectAll("#example-filters button").classed("active", function () {
    return this.dataset.context === activeContext;
  });
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
    drawTrackChart(storyData);
    renderFormatSummary(storyData);
    renderFilters(storyData);
    renderExamples(storyData);
    wireMetricButtons();
  } catch (error) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="method-note"><strong>Data failed to load.</strong> ${error.message}</div>`,
    );
  }
}

window.addEventListener("DOMContentLoaded", init);
