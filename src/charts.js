// Chart.js wrappers. The factory holds the live chart instances so the rest of
// the app can re-render or resize without tracking them, and every renderer
// no-ops when Chart.js or its canvas is unavailable.

import { getPaddedBounds } from "./metrics.js";

export function formatChartTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatSpeedRange(bin) {
  return bin.min === bin.max ? String(Math.round(bin.min)) : `${Math.round(bin.min)}-${Math.round(bin.max)}`;
}

export function createCharts({ elements, getRunLabel, onHistogramHover, getChart }) {
  let progressChart = null;
  let tradeoffChart = null;
  let histogramChart = null;
  let rhythmChart = null;

  const upsert = (existing, canvas, config) => {
    if (existing) {
      existing.data = config.data;
      existing.options = config.options;
      existing.update();
      return existing;
    }
    return new (getChart())(canvas, config);
  };

  return {
    renderRhythm(timeline, summary) {
      if (!getChart() || !elements.rhythmChartCanvas) return;
      const data = {
        datasets: [{
          label: "Inter-key speed", data: timeline, parsing: false, showLine: true, tension: 0.2,
          borderColor: "#0f766e",
          pointBackgroundColor: timeline.map((point) => point.y <= 12000 / summary.pauseThresholdMs ? "#c62828" : "#0f766e"),
          pointRadius: 3,
        }],
      };
      const options = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title(items) { return `${items[0].raw.x}s into the run`; },
          label(item) { return [`${item.raw.y} WPM between keys`, `${item.raw.type === "space" ? "Space" : item.raw.key}`]; },
        } } },
        scales: {
          x: { type: "linear", title: { display: true, text: "Time in run (seconds)" } },
          y: { beginAtZero: true, title: { display: true, text: "Inter-key speed (WPM)" } },
        },
      };
      rhythmChart = upsert(rhythmChart, elements.rhythmChartCanvas, { type: "line", data, options });
    },

    renderProgress(runs, chartScope) {
      if (!getChart() || !elements.progressChartCanvas) return;
      const point = (run, index, value) => ({ x: index + 1, y: value, completedAt: run.completedAt, textTitle: getRunLabel(run) });
      const datasets = [
        { label: "Speed (WPM)", data: runs.map((run, index) => point(run, index, run.wordsPerMinute)), borderColor: "#0f766e", tension: 0.25, parsing: false, hidden: true, yAxisID: "wpm" },
        { label: "Accuracy (%)", data: runs.map((run, index) => point(run, index, run.accuracy)), borderColor: "#15803d", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
        { label: "Consistency (%)", data: runs.map((run, index) => point(run, index, run.consistency)), borderColor: "#c62828", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
        { label: "Typing score", data: runs.map((run, index) => point(run, index, run.typingScore)), borderColor: "#7c3aed", tension: 0.25, parsing: false, yAxisID: "score" },
      ];
      // Normalized speed only makes sense once several texts are in view, and it
      // stays explicitly labelled as approximate.
      if (chartScope === "all") {
        datasets.push({
          label: "Approx. normalized WPM",
          data: runs.filter((run) => Number.isFinite(run.approximateNormalizedWpm)).map((run) => point(run, runs.indexOf(run), run.approximateNormalizedWpm)),
          borderColor: "#b45309", borderDash: [5, 4], tension: 0.25, parsing: false, hidden: true, yAxisID: "wpm",
        });
      }
      const options = {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: { legend: { position: "bottom" }, tooltip: { callbacks: {
          afterTitle(items) { const run = runs[items[0]?.dataIndex]; return run ? `${formatChartTimestamp(run.completedAt)} · ${getRunLabel(run)}` : ""; },
        } } },
        scales: {
          x: { type: "linear", title: { display: true, text: "Date and time" }, ticks: { stepSize: 1, callback(value) { const run = runs[value - 1]; return run ? formatChartTimestamp(run.completedAt) : value; } } },
          wpm: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "WPM" } },
          percent: { type: "linear", position: "left", beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "Percent" } },
          score: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "Score" } },
        },
      };
      progressChart = upsert(progressChart, elements.progressChartCanvas, { type: "line", data: { datasets }, options });
    },

    renderTradeoff(runs, chartScope, activeTextTitle) {
      if (!getChart() || !elements.tradeoffChartCanvas) return;
      const newest = runs.length - 1;
      const speedBounds = getPaddedBounds(runs.map((run) => run.wordsPerMinute));
      const consistencyBounds = getPaddedBounds(runs.map((run) => run.consistency), 0, 100);
      const data = { datasets: [{
        label: chartScope === "all" ? "All texts" : activeTextTitle,
        data: runs.map((run, index) => ({ x: run.wordsPerMinute, y: run.consistency, testNumber: index + 1, completedAt: run.completedAt, accuracy: run.accuracy, typingScore: run.typingScore, textTitle: getRunLabel(run) })),
        borderColor: "rgba(97,112,128,.45)", borderWidth: 2,
        pointBackgroundColor: runs.map((_, index) => index === newest ? "#f3c74f" : "#0f766e"),
        pointRadius: runs.map((_, index) => index === newest ? 8 : 5),
        showLine: true, tension: 0.2,
      }] };
      const options = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title(items) { const raw = items[0]?.raw; return raw ? `Test ${raw.testNumber} · ${raw.textTitle}` : ""; },
          label(item) { return [`Speed: ${item.raw.x} WPM`, `Consistency: ${item.raw.y}%`, `Accuracy: ${item.raw.accuracy}%`, `Score: ${item.raw.typingScore}`]; },
          afterLabel(item) { return formatChartTimestamp(new Date(item.raw.completedAt).getTime()); },
        } } },
        scales: {
          x: { type: "linear", min: speedBounds.min, max: speedBounds.max, title: { display: true, text: "Typing speed (WPM)" } },
          y: { min: consistencyBounds.min, max: consistencyBounds.max, title: { display: true, text: "Consistency (%)" } },
        },
      };
      tradeoffChart = upsert(tradeoffChart, elements.tradeoffChartCanvas, { type: "scatter", data, options });
    },

    renderHistogram(bins) {
      if (!getChart() || !elements.lastRunHistogramCanvas) return;
      const data = { labels: bins.map(formatSpeedRange), datasets: [{ label: "Letters", data: bins.map((bin) => bin.count), backgroundColor: "rgba(15,118,110,.72)", borderColor: "#0f766e", borderWidth: 1 }] };
      const options = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title(items) { return `${formatSpeedRange(bins[items[0].dataIndex])} WPM`; },
          label(item) { return `${item.parsed.y} letters`; },
        } } },
        scales: {
          x: { title: { display: true, text: "Letter speed range (WPM)" } },
          y: { beginAtZero: true, title: { display: true, text: "Letters" } },
        },
        onHover(event, hovered) { onHistogramHover(hovered.length ? hovered[0].index : null); },
      };
      if (histogramChart) {
        histogramChart.data = data;
        histogramChart.update();
        return;
      }
      histogramChart = new (getChart())(elements.lastRunHistogramCanvas, { type: "bar", data, options });
    },

    destroyRhythm() {
      rhythmChart?.destroy?.();
      rhythmChart = null;
    },

    resize(name) {
      const charts = { progress: progressChart, tradeoff: tradeoffChart, rhythm: rhythmChart };
      charts[name]?.resize?.();
    },
  };
}
