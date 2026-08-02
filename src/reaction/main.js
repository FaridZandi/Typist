// Reaction-test wiring. Owns the element lookups, run state, and event
// handlers; the weighting, statistics, and rendering live in modules that take
// their inputs explicitly.

import { reactionRunLengthSeconds, warmupStartKey } from "./config.js";
import { formatKeyboardKeyLabel, getDvorakKeyboardKeys, renderDvorakKeyboard } from "../shared/keyboard-layout.js";
import { createReactionStorage } from "./storage.js";
import { createEmptyKeyStats, recordKeyAttempt } from "./key-stats.js";
import { getNextTarget, getTargetDistribution, normalizeKey } from "./targeting.js";
import { getAverageReactionTime, getBestReactionTime, getPercentile, getReactionAccuracy } from "./metrics.js";
import { createMetronome } from "./metronome.js";
import { createReactionChart } from "./charts.js";
import { renderAccuracyKeyboard, renderReactionTimeKeyboard } from "./view/keyboards.js";

const elementIds = [
  "startButton", "focusExponent", "focusExponentValue", "includeNonLetters",
  "metronomeInterval", "metronomeIntervalValue", "metronomeDuration", "metronomeDurationValue",
  "hitValue", "averageReactionValue", "reactionAccuracyValue", "errorValue",
  "reactionProgressFill", "targetLetter", "typedKeyDisplay", "reactionStatus",
  "reactionResultPanel", "finalHits", "finalErrors", "finalAverageReaction",
  "bestReactionValue", "medianReactionValue", "p90ReactionValue",
  "clearReactionHistoryButton", "reactionHistoryChart",
  "reactionAccuracyKeyboard", "reactionTimeKeyboard",
];

export function initReactionApp({ document = globalThis.document, window = globalThis.window } = {}) {
  const elements = Object.fromEntries(elementIds.map((id) => [id, document.querySelector(`#${id}`)]));
  elements.reactionProgress = document.querySelector(".timer-progress");
  const heatmapMetricModeInputs = [...document.querySelectorAll('input[name="heatmapMetricMode"]')];

  const targetLetters = getDvorakKeyboardKeys();
  const storage = createReactionStorage(targetLetters, window.localStorage);

  let running = false;
  let finished = false;
  let awaitingStartKey = false;
  let timerId = null;
  let secondsLeft = reactionRunLengthSeconds;
  let currentTarget = "";
  let targetShownAt = 0;
  let hits = 0;
  let errors = 0;
  let reactionTimes = [];
  let history = storage.loadHistory();
  let keyStats = storage.loadKeyStats();
  let accuracyKeyElements = [];
  let reactionTimeKeyElements = [];

  const getMetronomePulseDuration = () => Number(elements.metronomeDuration.value);
  const getMetricMode = () => document.querySelector('input[name="heatmapMetricMode"]:checked')?.value ?? "ema";

  const metronome = createMetronome({
    window,
    element: elements.targetLetter,
    getIntervalMs: () => Number(elements.metronomeInterval.value),
    getPulseDurationMs: getMetronomePulseDuration,
  });

  const chart = createReactionChart({
    canvas: elements.reactionHistoryChart,
    getChart: () => window.Chart,
  });

  let targetDistribution = [];

  function buildDistribution() {
    return getTargetDistribution({
      targetLetters,
      keyStats,
      includeNonLetters: elements.includeNonLetters.checked,
      focusExponent: Number(elements.focusExponent.value),
    });
  }

  function loadSettings() {
    const settings = storage.loadSettings();
    if (!settings) return;

    const applyNumber = (input, value, onApply) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < Number(input.min) || parsed > Number(input.max)) return;
      input.value = String(parsed);
      onApply?.();
    };

    applyNumber(elements.focusExponent, settings.focusExponent, () => {
      elements.focusExponentValue.value = elements.focusExponent.value;
    });
    if (typeof settings.includeNonLetters === "boolean") elements.includeNonLetters.checked = settings.includeNonLetters;
    applyNumber(elements.metronomeInterval, settings.metronomeInterval, updateMetronomeIntervalLabel);
    applyNumber(elements.metronomeDuration, settings.metronomeDuration, updateMetronomeDurationLabel);
    if (settings.heatmapMetricMode === "lifetime") {
      document.querySelector('input[name="heatmapMetricMode"][value="lifetime"]').checked = true;
    }
  }

  function saveSettings() {
    storage.saveSettings({
      focusExponent: Number(elements.focusExponent.value),
      includeNonLetters: elements.includeNonLetters.checked,
      metronomeInterval: Number(elements.metronomeInterval.value),
      metronomeDuration: getMetronomePulseDuration(),
      heatmapMetricMode: getMetricMode(),
    });
  }

  function updateMetronomeIntervalLabel() {
    const interval = Number(elements.metronomeInterval.value);
    elements.metronomeIntervalValue.value = interval === 0 ? "Off" : `${interval} ms`;
  }

  function updateMetronomeDurationLabel() {
    elements.metronomeDurationValue.value = `${getMetronomePulseDuration()} ms`;
  }

  function paintKeyboards() {
    const metricMode = getMetricMode();
    renderAccuracyKeyboard({ keyElements: accuracyKeyElements, keyStats, targetLetters, metricMode });
    renderReactionTimeKeyboard({ keyElements: reactionTimeKeyElements, keyStats, targetLetters, metricMode });
  }

  function updateStats() {
    elements.hitValue.textContent = hits;
    elements.errorValue.textContent = errors;
    elements.averageReactionValue.textContent = getAverageReactionTime(reactionTimes);
    elements.reactionAccuracyValue.textContent = getReactionAccuracy(hits, errors);
  }

  function updateProgress() {
    const elapsedSeconds = reactionRunLengthSeconds - secondsLeft;
    const elapsedPercent = Math.max(0, Math.min(100, (elapsedSeconds / reactionRunLengthSeconds) * 100));
    elements.reactionProgressFill.style.setProperty("--progress-width", `${elapsedPercent}%`);
    elements.reactionProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
  }

  function resetRun() {
    running = false;
    finished = false;
    awaitingStartKey = false;
    window.clearInterval(timerId);
    timerId = null;
    secondsLeft = reactionRunLengthSeconds;
    currentTarget = "";
    targetShownAt = 0;
    hits = 0;
    errors = 0;
    reactionTimes = [];
    metronome.resetStreak();
    elements.targetLetter.textContent = "-";
    elements.targetLetter.classList.remove("target-error", "target-correct");
    elements.typedKeyDisplay.textContent = "-";
    elements.typedKeyDisplay.classList.remove("typed-key-error", "typed-key-correct");
    elements.reactionResultPanel.hidden = true;
    updateStats();
    updateProgress();
  }

  // The run opens with a fixed warm-up key so the timer starts from a press
  // rather than from the moment the button was clicked.
  function startRun() {
    resetRun();
    running = true;
    awaitingStartKey = true;
    targetDistribution = buildDistribution();
    elements.focusExponent.disabled = true;
    elements.includeNonLetters.disabled = true;
    elements.startButton.blur();
    elements.startButton.textContent = "Restart";
    currentTarget = warmupStartKey;
    elements.targetLetter.textContent = formatKeyboardKeyLabel(warmupStartKey);
    elements.reactionStatus.textContent = `Press ${formatKeyboardKeyLabel(warmupStartKey)} to start the test.`;
  }

  function beginTimedRun() {
    awaitingStartKey = false;
    elements.reactionStatus.textContent = "Type the displayed letter.";
    showNextTarget();
    timerId = window.setInterval(() => {
      secondsLeft -= 1;
      updateProgress();
      if (secondsLeft <= 0) finishRun();
    }, 1000);
  }

  function showNextTarget() {
    currentTarget = getNextTarget({ distribution: targetDistribution, targetLetters, currentTarget });
    elements.targetLetter.textContent = formatKeyboardKeyLabel(currentTarget);
    elements.targetLetter.classList.remove("target-error", "target-correct");
    elements.typedKeyDisplay.textContent = "-";
    elements.typedKeyDisplay.classList.remove("typed-key-error", "typed-key-correct");
    targetShownAt = performance.now();
  }

  function applyKeyAttempt(attempt) {
    recordKeyAttempt(keyStats, attempt);
    storage.saveKeyStats(keyStats);
    paintKeyboards();
  }

  function clearFeedbackAfterMiss(guard) {
    window.setTimeout(() => {
      if (guard()) return;
      elements.typedKeyDisplay.textContent = "-";
      elements.typedKeyDisplay.classList.remove("typed-key-error");
      elements.targetLetter.classList.remove("target-error");
    }, 140);
  }

  function handleKeyPress(event) {
    if (!running || finished || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "Escape") {
      finishRun();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      return;
    }

    const typedKey = normalizeKey(event.key);
    if (!targetLetters.includes(typedKey)) return;
    event.preventDefault();

    elements.typedKeyDisplay.textContent = formatKeyboardKeyLabel(typedKey);

    if (awaitingStartKey) {
      if (typedKey !== warmupStartKey) {
        elements.typedKeyDisplay.classList.add("typed-key-error");
        elements.targetLetter.classList.add("target-error");
        elements.reactionStatus.textContent = `Press ${formatKeyboardKeyLabel(warmupStartKey)} to start the test.`;
        clearFeedbackAfterMiss(() => !running || finished || !awaitingStartKey);
        return;
      }
      elements.typedKeyDisplay.classList.add("typed-key-correct");
      elements.targetLetter.classList.add("target-correct");
      window.setTimeout(() => {
        if (!running || finished || !awaitingStartKey) return;
        beginTimedRun();
      }, 120);
      return;
    }

    if (typedKey !== currentTarget) {
      errors += 1;
      metronome.resetStreak();
      applyKeyAttempt({ targetKey: currentTarget, wasCorrect: false, typedKey });
      elements.typedKeyDisplay.classList.add("typed-key-error");
      elements.targetLetter.classList.add("target-error");
      elements.reactionStatus.textContent = "Wrong key. Retype the shown letter.";
      updateStats();
      clearFeedbackAfterMiss(() => !running || finished);
      return;
    }

    hits += 1;
    const pressedAt = performance.now();
    const reactionTime = pressedAt - targetShownAt;
    metronome.markForReward(pressedAt);
    applyKeyAttempt({ targetKey: currentTarget, wasCorrect: true, typedKey, reactionTime });
    reactionTimes.push(reactionTime);
    elements.typedKeyDisplay.classList.add("typed-key-correct");
    elements.targetLetter.classList.add("target-correct");
    elements.reactionStatus.textContent = "Correct.";
    updateStats();
    showNextTarget();
  }

  function recordRun() {
    history.push({
      completedAt: new Date().toISOString(),
      hits,
      errors,
      averageReaction: getAverageReactionTime(reactionTimes),
      accuracy: getReactionAccuracy(hits, errors),
      bestReaction: getBestReactionTime(reactionTimes),
      medianReaction: getPercentile(reactionTimes, 50),
      p90Reaction: getPercentile(reactionTimes, 90),
    });
    storage.saveHistory(history);
    chart.render(history);
  }

  function finishRun() {
    if (finished) return;
    running = false;
    finished = true;
    window.clearInterval(timerId);
    timerId = null;
    secondsLeft = 0;
    updateProgress();
    updateStats();
    elements.startButton.textContent = "Start";
    elements.focusExponent.disabled = false;
    elements.includeNonLetters.disabled = false;
    elements.reactionStatus.textContent = "Run complete.";
    elements.targetLetter.textContent = "-";
    elements.typedKeyDisplay.textContent = "-";

    elements.finalHits.textContent = hits;
    elements.finalErrors.textContent = errors;
    elements.finalAverageReaction.textContent = getAverageReactionTime(reactionTimes);
    elements.bestReactionValue.textContent = getBestReactionTime(reactionTimes);
    elements.medianReactionValue.textContent = getPercentile(reactionTimes, 50);
    elements.p90ReactionValue.textContent = getPercentile(reactionTimes, 90);
    elements.reactionResultPanel.hidden = false;
    recordRun();
  }

  elements.startButton.addEventListener("click", startRun);
  window.addEventListener("keydown", handleKeyPress);

  elements.focusExponent.addEventListener("input", () => {
    elements.focusExponentValue.value = elements.focusExponent.value;
    saveSettings();
    targetDistribution = buildDistribution();
  });
  elements.includeNonLetters.addEventListener("change", () => {
    saveSettings();
    targetDistribution = buildDistribution();
  });
  elements.metronomeInterval.addEventListener("input", () => {
    updateMetronomeIntervalLabel();
    saveSettings();
    metronome.restart();
  });
  elements.metronomeDuration.addEventListener("input", () => {
    updateMetronomeDurationLabel();
    saveSettings();
    metronome.restart();
  });
  heatmapMetricModeInputs.forEach((input) => input.addEventListener("change", () => {
    saveSettings();
    paintKeyboards();
  }));

  elements.clearReactionHistoryButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Are you sure? This will permanently delete all reaction test history and per-key accuracy and reaction-time data.",
    );
    if (!confirmed) return;

    history = [];
    keyStats = createEmptyKeyStats(targetLetters);
    storage.saveHistory(history);
    storage.saveKeyStats(keyStats);
    chart.render(history);
    paintKeyboards();
  });

  loadSettings();
  targetDistribution = buildDistribution();
  resetRun();
  updateMetronomeIntervalLabel();
  updateMetronomeDurationLabel();
  metronome.restart();

  renderDvorakKeyboard(elements.reactionAccuracyKeyboard, { datasetName: "key" });
  accuracyKeyElements = [...elements.reactionAccuracyKeyboard.querySelectorAll(".key[data-key]")];
  renderDvorakKeyboard(elements.reactionTimeKeyboard, { datasetName: "timeKey" });
  reactionTimeKeyElements = [...elements.reactionTimeKeyboard.querySelectorAll(".key[data-time-key]")];

  chart.render(history);
  paintKeyboards();

  return { elements, startRun, finishRun, handleKeyPress, getKeyStats: () => keyStats };
}
