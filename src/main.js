// Application wiring. This module owns the element lookups, the per-session
// view state, and the event handlers; everything it renders or calculates lives
// in a module that has no opinion about the DOM.

import { feedbackDerivationVersion, maxDetailedRunsPerText } from "./config.js";
import { typingTexts } from "./texts.js";
import { createTextIndex, getRunLengthSeconds, getTextDifficulty, getWords, resolveText } from "./text-model.js";
import { createStorage } from "./storage.js";
import { TypingRun, now } from "./run-engine.js";
import { getRhythmTimeline, getRunConsistency, getSmoothedRunIntervals, getSpeedHistogramBins, getTypingScore, formatDuration } from "./metrics.js";
import { deriveRunAnnotations } from "./annotations.js";
import { choosePrimaryFeedback, formatBundleEvidence, getCoaching, getFeedbackBundles } from "./feedback.js";
import { getProgressState } from "./progress.js";
import { createCharts } from "./charts.js";
import { renderPrompt } from "./view/prompt.js";
import { renderAccuracyHeatmap, renderLastRunHeatmap, renderSpeedHeatmap } from "./view/heatmaps.js";
import {
  renderErrorDetails,
  renderProgressDetail,
  renderRhythmDetails,
  renderRunNotes,
  renderSecondaryFeedback,
  renderTransitionDetails,
  renderWordDetails,
} from "./view/results.js";

const elementIds = [
  "textDisplay", "typingInput", "testView", "resultsView", "restartButton", "clearHistoryButton",
  "textSelect", "currentTextLabel", "currentTextMeta",
  "speedValue", "accuracyValue", "consistencyValue", "scoreValue",
  "resultPanel", "resultTitle", "lastRunHeatmapTitle",
  "finalSpeed", "finalAccuracy", "finalScore", "grossSpeed", "effectiveSpeed",
  "finalAccuracyDetail", "processAccuracy", "correctionSummary", "completionTime", "pauseSummary", "finalConsistency",
  "runObservation", "runEvidence", "runRecommendation",
  "secondaryFeedback", "secondaryFeedbackCount", "secondaryFeedbackList",
  "runNotes", "runNoteList", "runNoteDescription", "resultPassage", "resultTextDisplay",
  "rhythmDetailSummary", "rhythmDetailIntro", "errorDetailSummary", "errorDetailIntro", "errorCategoryList",
  "transitionDetailSummary", "transitionDetailIntro", "transitionList",
  "wordDetailSummary", "wordDetailIntro", "wordList",
  "progressDetailSummary", "progressDetailIntro",
  "lastRunHeatmap", "heatmapDisplay", "heatmapRuns",
  "accuracyLegendHighest", "accuracyLegendLowest", "speedChart", "speedLegendHighest", "speedLegendLowest",
  "timerProgressFill",
];

const canvasIds = ["rhythmChart", "lastRunHistogram", "progressChart", "tradeoffChart"];

export function initTypingApp({
  document = globalThis.document,
  window = globalThis.window,
  catalog = typingTexts,
} = {}) {
  const elements = Object.fromEntries(elementIds.map((id) => [id, document.querySelector(`#${id}`)]));
  canvasIds.forEach((id) => { elements[`${id}Canvas`] = document.querySelector(`#${id}`); });
  elements.timerProgress = document.querySelector(".timer-progress");

  const resultAnalysisTabs = [...document.querySelectorAll("[data-result-tab]")];
  const resultAnalysisPanels = [...document.querySelectorAll("[data-result-panel]")];
  const chartScopeInputs = [...document.querySelectorAll('input[name="chartScope"]')];
  const viewTabLists = [...document.querySelectorAll("[data-view-tabs]")];

  const textById = createTextIndex(catalog);
  const storage = createStorage(textById, window.localStorage);

  let activeText = resolveText(catalog, textById, storage.settings.selectedText);
  let words = getWords(activeText.body);
  let run = createRun();
  let secondsLeft = getRunLengthSeconds(activeText);
  let timerId = null;
  let runAnnotations = [];
  let activeRunAnnotationId = null;
  let lastRunSpeeds = [];
  let lastRunHistogramBins = [];
  let focusRestartOnNextTab = false;
  let presentationUpdateScheduled = false;

  const afterLayout = (callback) => (window.requestAnimationFrame ?? ((fn) => fn()))(callback);
  const getRunLabel = (record) => textById.get(record.textId)?.title || record.textId;
  const getScopedRuns = () => storage.settings.chartScope === "all"
    ? storage.runsStore.runs
    : storage.runsStore.runs.filter((record) => record.textId === activeText.id);

  const charts = createCharts({
    elements,
    getRunLabel,
    onHistogramHover: (binIndex) => paintLastRunHeatmap(binIndex),
    getChart: () => window.Chart,
  });

  function createRun() {
    return new TypingRun({ words, onStart: startTimer });
  }

  function startTimer() {
    if (timerId) return;
    elements.textSelect.disabled = true;
    timerId = window.setInterval(() => {
      secondsLeft -= 1;
      updateStats();
      if (secondsLeft <= 0) finishRun();
    }, 1000);
  }

  function paintPrompt() {
    renderPrompt({ elements, document, words, run, annotations: runAnnotations, activeAnnotationId: activeRunAnnotationId });
  }

  function paintLastRunHeatmap(activeBinIndex = null) {
    renderLastRunHeatmap({ elements, document, samples: lastRunSpeeds, bins: lastRunHistogramBins, activeBinIndex });
  }

  function paintTextHeatmaps() {
    const stats = storage.getTextStats(activeText);
    renderAccuracyHeatmap({ elements, document, text: activeText, stats });
    renderSpeedHeatmap({ elements, document, text: activeText, stats });
  }

  function paintTrendCharts() {
    charts.renderProgress(getScopedRuns(), storage.settings.chartScope);
    charts.renderTradeoff(getScopedRuns(), storage.settings.chartScope, activeText.title);
  }

  function updateStats() {
    const metrics = run.getMetrics(getRunLengthSeconds(activeText) - secondsLeft);
    const consistency = getRunConsistency(run.keyIntervals);
    elements.speedValue.textContent = metrics.wordsPerMinute;
    elements.accuracyValue.textContent = metrics.accuracy;
    elements.consistencyValue.textContent = consistency;
    elements.scoreValue.textContent = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
    updateTimerProgress();
  }

  function updateTimerProgress() {
    const runLength = getRunLengthSeconds(activeText);
    const elapsedSeconds = runLength - secondsLeft;
    const elapsedPercent = Math.max(0, Math.min(100, (elapsedSeconds / runLength) * 100));
    elements.timerProgressFill.style.setProperty("--progress-width", `${elapsedPercent}%`);
    elements.timerProgress.setAttribute("aria-valuemax", String(runLength));
    elements.timerProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
  }

  // Two frames of delay keeps the prompt repaint off the keystroke path, so a
  // fast typist never waits on stats rendering.
  function schedulePresentationUpdate() {
    if (presentationUpdateScheduled || run.finished) return;
    presentationUpdateScheduled = true;
    afterLayout(() => afterLayout(() => {
      presentationUpdateScheduled = false;
      updateStats();
      paintPrompt();
    }));
  }

  function applyKeyResult(result) {
    paintPrompt();
    if (result.complete) finishRun();
    else schedulePresentationUpdate();
  }

  function updateTextSummary() {
    elements.currentTextLabel.textContent = activeText.title;
    elements.currentTextMeta.textContent = `${words.length} words · ${activeText.durationSeconds}s`;
    elements.lastRunHeatmapTitle.textContent = `${activeText.title} · last run character speed`;
  }

  function populateTextPicker() {
    elements.textSelect.replaceChildren();
    const randomOption = document.createElement("option");
    randomOption.value = "random";
    randomOption.textContent = "Random practice piece";
    elements.textSelect.append(randomOption);
    catalog.forEach((text, index) => {
      const option = document.createElement("option");
      option.value = text.id;
      option.textContent = `${index + 1}. ${text.title} · ${getWords(text.body).length} words`;
      option.title = text.body;
      elements.textSelect.append(option);
    });
    elements.textSelect.value = storage.settings.selectedText;
  }

  function setResultAnalysisTab(tabId) {
    resultAnalysisTabs.forEach((tab) => {
      const active = tab.dataset.resultTab === tabId;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    resultAnalysisPanels.forEach((panel) => { panel.hidden = panel.dataset.resultPanel !== tabId; });
    if (tabId === "rhythm" && !elements.resultsView.hidden) afterLayout(() => charts.resize("rhythm"));
  }

  function renderSessionDetails(summary) {
    const timeline = getRhythmTimeline(run.events);
    renderRhythmDetails({ elements, summary, timeline });
    charts.renderRhythm(timeline, summary);
    renderErrorDetails({ elements, document, summary });

    const storedRuns = storage.analysisStore.texts[activeText.id]?.runs || [];
    renderTransitionDetails({ elements, document, records: [...storedRuns, { events: run.events }] });
    renderWordDetails({ elements, document, records: [...storedRuns, { events: run.events, words: run.completedWordAnalyses }] });

    const progressRecords = storedRuns.map((record) => ({ ...record, textId: activeText.id }));
    progressRecords.push({ completedAt: new Date().toISOString(), summary, textId: activeText.id });
    renderProgressDetail({
      elements,
      records: progressRecords,
      currentSummary: summary,
      patternRecords: [...storage.getStoredAnalysisRecords(), { completedAt: new Date().toISOString(), events: run.events, textId: activeText.id }],
      fluencyRecords: progressRecords,
    });
  }

  function renderLastRunResults(smoothedIntervals) {
    lastRunSpeeds = [...activeText.body].map((character, index) => ({
      char: character,
      index,
      speed: smoothedIntervals.has(index) ? Math.round(12000 / smoothedIntervals.get(index)) : null,
    }));
    lastRunHistogramBins = getSpeedHistogramBins(lastRunSpeeds);
    paintLastRunHeatmap();
    charts.renderHistogram(lastRunHistogramBins);
  }

  function finishRun() {
    if (run.finished) return;
    run.finish(now());
    presentationUpdateScheduled = false;
    focusRestartOnNextTab = true;
    window.clearInterval(timerId);
    timerId = null;

    const metrics = run.getMetrics(getRunLengthSeconds(activeText) - secondsLeft);
    const consistency = getRunConsistency(run.keyIntervals);
    const typingScore = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
    const summary = run.buildSummary({ storedRecords: storage.getStoredAnalysisRecords(), textId: activeText.id });

    runAnnotations = deriveRunAnnotations({ summary, words, runEvents: run.events, completedWordAnalyses: run.completedWordAnalyses });
    activeRunAnnotationId = null;

    const bundles = getFeedbackBundles(summary);
    const previousFeedback = storage.analysisStore.texts[activeText.id]?.runs?.at(-1)?.primaryFeedback;
    const coaching = choosePrimaryFeedback(bundles, previousFeedback) || getCoaching(summary);

    elements.resultPanel.hidden = false;
    elements.finalSpeed.textContent = summary.effectiveWordsPerMinute;
    elements.finalAccuracy.textContent = summary.finalAccuracy;
    if (elements.finalScore) elements.finalScore.textContent = typingScore;
    elements.grossSpeed.textContent = summary.grossWordsPerMinute;
    elements.effectiveSpeed.textContent = summary.effectiveWordsPerMinute;
    elements.finalAccuracyDetail.textContent = summary.finalAccuracy;
    elements.processAccuracy.textContent = summary.processAccuracy;
    elements.correctionSummary.textContent = `${summary.correctedErrors} corrected · ${summary.remainingErrors} left`;
    elements.completionTime.textContent = formatDuration(summary.completionMs);
    elements.pauseSummary.textContent = summary.pauseCount
      ? `${summary.pauseCount} · ${formatDuration(summary.pauseDurationMs)}`
      : "None";
    elements.finalConsistency.textContent = consistency;
    elements.runObservation.previousElementSibling.textContent = coaching.title;
    elements.runObservation.textContent = coaching.observation;
    const evidence = formatBundleEvidence(coaching);
    elements.runEvidence.hidden = !evidence;
    elements.runEvidence.textContent = evidence;
    elements.runRecommendation.textContent = `Practice: ${coaching.recommendation}`;
    renderSecondaryFeedback({ elements, document, bundles, primaryBundle: coaching });

    elements.typingInput.disabled = true;
    elements.textSelect.disabled = false;
    elements.testView.hidden = true;
    elements.resultsView.hidden = false;

    paintPrompt();
    paintRunNotes();
    renderSessionDetails(summary);
    renderLastRunResults(getSmoothedRunIntervals(run.intervals));
    commitRun(metrics, consistency, typingScore, getSmoothedRunIntervals(run.intervals), summary, coaching);
    updateStats();
    afterLayout(() => {
      charts.resize("progress");
      elements.resultTitle.focus();
    });
  }

  function paintRunNotes() {
    renderRunNotes({
      elements,
      document,
      annotations: runAnnotations,
      activeAnnotationId: activeRunAnnotationId,
      onSelect: (id) => {
        activeRunAnnotationId = activeRunAnnotationId === id ? null : id;
        paintRunNotes();
        paintPrompt();
        if (activeRunAnnotationId) elements.runNoteDescription.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      },
    });
  }

  function commitRun(metrics, consistency, typingScore, smoothedIntervals, summary, primaryFeedback) {
    const stats = storage.getTextStats(activeText);
    run.promptAttempts.forEach((index) => {
      const character = stats.characters[index];
      if (!character) return;
      character.attempts += 1;
      if (run.mistakes.has(index)) character.mistakes += 1;
    });
    smoothedIntervals.forEach((intervalMs, index) => {
      const character = stats.characters[index];
      if (!character || intervalMs <= 0) return;
      character.intervalSamples += 1;
      character.totalIntervalMs += intervalMs;
    });
    stats.runs += 1;
    storage.statsStore.texts[activeText.id] = stats;

    const difficulty = getTextDifficulty(activeText);
    const completedAt = new Date().toISOString();
    storage.runsStore.runs.push({
      textId: activeText.id, completedAt,
      wordsPerMinute: metrics.wordsPerMinute, accuracy: metrics.accuracy, consistency, typingScore,
      difficulty,
      approximateNormalizedWpm: Math.round(summary.effectiveWordsPerMinute / difficulty),
    });

    const analysisText = storage.analysisStore.texts[activeText.id] || { runs: [] };
    const detailedRun = {
      completedAt,
      summary,
      events: run.events,
      words: run.completedWordAnalyses,
      derivationVersion: feedbackDerivationVersion,
      primaryFeedback: primaryFeedback?.kind
        ? { kind: primaryFeedback.kind, scope: primaryFeedback.scope, confidence: primaryFeedback.confidence, priority: primaryFeedback.priority, derivationVersion: feedbackDerivationVersion }
        : null,
    };
    detailedRun.progressState = getProgressState([...analysisText.runs, detailedRun].map((record) => ({ ...record, textId: activeText.id })));
    analysisText.runs.push(detailedRun);
    // Detailed event records stay bounded so local storage cannot grow without limit.
    analysisText.runs = analysisText.runs.slice(-maxDetailedRunsPerText);
    storage.analysisStore.texts[activeText.id] = analysisText;

    storage.saveStores();
    paintTextHeatmaps();
    paintTrendCharts();
  }

  function resetRun({ chooseRandom = storage.settings.selectedText === "random" } = {}) {
    if (chooseRandom) activeText = resolveText(catalog, textById, "random");
    words = getWords(activeText.body);
    run = createRun();
    secondsLeft = getRunLengthSeconds(activeText);
    focusRestartOnNextTab = false;
    presentationUpdateScheduled = false;
    window.clearInterval(timerId);
    timerId = null;
    runAnnotations = [];
    activeRunAnnotationId = null;
    lastRunSpeeds = [];
    lastRunHistogramBins = [];

    elements.typingInput.value = "";
    elements.typingInput.disabled = false;
    elements.textSelect.disabled = false;
    elements.speedValue.textContent = "0";
    elements.accuracyValue.textContent = "100";
    elements.consistencyValue.textContent = "100";
    elements.scoreValue.textContent = "100";
    elements.testView.hidden = false;
    elements.resultsView.hidden = true;
    elements.resultPanel.hidden = true;
    elements.lastRunHeatmap.replaceChildren();
    setResultAnalysisTab("rhythm");
    elements.runNotes.hidden = true;
    elements.runNoteList.replaceChildren();
    elements.runNoteDescription.hidden = true;
    elements.runNoteDescription.textContent = "";
    elements.secondaryFeedback.hidden = true;
    elements.secondaryFeedback.open = false;
    elements.secondaryFeedbackCount.textContent = "";
    elements.secondaryFeedbackList.replaceChildren();
    charts.destroyRhythm();
    elements.errorCategoryList.replaceChildren();
    elements.transitionList.replaceChildren();
    elements.wordList.replaceChildren();

    updateTextSummary();
    updateTimerProgress();
    paintPrompt();
    paintTextHeatmaps();
    elements.typingInput.focus();
  }

  elements.typingInput.addEventListener("keydown", (event) => {
    if (event.isComposing || run.finished) return;
    const modifiers = { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey };
    if (event.key === "Backspace") { event.preventDefault(); applyKeyResult(run.handleBackspace(now(), modifiers)); return; }
    if (event.key === " ") { event.preventDefault(); applyKeyResult(run.handleSpace(now(), modifiers)); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      applyKeyResult(run.handleCharacter(event.key, now(), modifiers));
    }
  });

  // Space must never scroll the page, and after a run the first Tab jumps
  // straight to Restart rather than walking the whole results view.
  document.addEventListener("keydown", (event) => {
    const activeControl = event.target?.closest?.(
      'button:not(:disabled), a, select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [role="tab"]',
    );
    if (event.key === " " && !activeControl) {
      event.preventDefault();
      return;
    }
    if (!run.finished || !focusRestartOnNextTab || event.key !== "Tab") return;
    event.preventDefault();
    focusRestartOnNextTab = false;
    elements.restartButton.focus();
  }, true);

  elements.typingInput.addEventListener("input", () => {
    if (!elements.typingInput.value) return;
    const value = elements.typingInput.value;
    elements.typingInput.value = "";
    applyKeyResult(run.applyExternalInput(value, now));
  });

  elements.textDisplay.addEventListener("click", () => elements.typingInput.focus());
  elements.restartButton.addEventListener("click", () => resetRun());

  elements.textSelect.addEventListener("change", () => {
    storage.settings.selectedText = elements.textSelect.value;
    storage.saveSettings();
    activeText = resolveText(catalog, textById, storage.settings.selectedText);
    resetRun({ chooseRandom: false });
  });

  chartScopeInputs.forEach((input) => input.addEventListener("change", () => {
    if (!input.checked) return;
    storage.settings.chartScope = input.value;
    storage.saveSettings();
    paintTrendCharts();
  }));

  viewTabLists.forEach((tabList) => {
    const group = tabList.dataset.viewTabs;
    const tabs = [...tabList.querySelectorAll('[role="tab"]')];
    const panels = [...document.querySelectorAll(`[data-view-panel="${group}"]`)];

    tabs.forEach((tab) => tab.addEventListener("click", () => {
      tabs.forEach((candidate) => {
        const isActive = candidate === tab;
        candidate.setAttribute("aria-selected", String(isActive));
        candidate.tabIndex = isActive ? 0 : -1;
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.viewId !== tab.dataset.viewTarget; });
      afterLayout(() => charts.resize(tab.dataset.viewTarget));
    }));
  });

  resultAnalysisTabs.forEach((tab) => tab.addEventListener("click", () => setResultAnalysisTab(tab.dataset.resultTab)));

  elements.clearHistoryButton.addEventListener("click", () => {
    if (!window.confirm("Clear all typing history and character statistics? This cannot be undone.")) return;
    storage.clearAll();
    paintTextHeatmaps();
    paintTrendCharts();
  });

  elements.lastRunHistogramCanvas.addEventListener("mouseleave", () => paintLastRunHeatmap());

  storage.removeLegacyStorage();
  populateTextPicker();
  chartScopeInputs.forEach((input) => { input.checked = input.value === storage.settings.chartScope; });
  resetRun({ chooseRandom: storage.settings.selectedText === "random" });
  paintTrendCharts();

  // Driving the run with explicit timestamps is what makes timing-dependent
  // behaviour reproducible outside a real keyboard.
  return {
    elements,
    handleCharacter: (character, timestamp = now(), modifiers = {}) => applyKeyResult(run.handleCharacter(character, timestamp, modifiers)),
    handleBackspace: (timestamp = now(), modifiers = {}) => applyKeyResult(run.handleBackspace(timestamp, modifiers)),
    handleSpace: (timestamp = now(), modifiers = {}) => applyKeyResult(run.handleSpace(timestamp, modifiers)),
    setResultAnalysisTab,
    finishRun,
    resetRun,
    getActiveText: () => activeText,
  };
}
