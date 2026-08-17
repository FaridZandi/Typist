// Application wiring. This module owns the element lookups, the per-session
// view state, and the event handlers; everything it renders or calculates lives
// in a module that has no opinion about the DOM.

import { feedbackDerivationVersion, maxDetailedRunsPerText, pauseFloorMs } from "./config.js";
import { typingTexts } from "./texts.js";
import { createTextIndex, getRunLengthSeconds, getTextDifficulty, getWords, resolveText } from "./text-model.js";
import { createStorage } from "./storage.js";
import { TypingRun, now } from "./run-engine.js";
import { getRunConsistency, getSmoothedRunIntervals, getTypingScore } from "./metrics.js";
import { deriveRunAnnotations } from "./annotations.js";
import { getRunPairs, measureTransitions, summariseRunTransitions } from "./transitions.js";
import { selectFinding } from "./finding.js";
import { buildDrill } from "./drills.js";
import { getProgressState } from "./progress.js";
import { renderAnnotatedPassage, renderPrompt } from "./view/prompt.js";
import { renderDebrief } from "./view/debrief.js";

const elementIds = [
  "textDisplay", "typingInput", "testView", "resultsView", "restartButton", "clearHistoryButton",
  "textSelect", "currentTextLabel", "currentTextMeta",
  "speedValue", "accuracyValue", "consistencyValue", "scoreValue",
  "resultPanel", "resultTitle", "timerProgressFill",
  "finalSpeed", "finalAccuracy", "speedRange", "accuracyPips", "deltaStat", "speedDelta",
  "rhythmSection", "rhythmStrip", "rhythmEnd",
  "findingBlock", "findingLabel", "findingVisual", "findingBars", "findingTrend", "findingChips",
  "drillBlock", "drillWords", "drillDuration", "startDrillButton", "repeatPieceButton",
  "passageDetails", "resultTextDisplay",
];

export function initTypingApp({
  document = globalThis.document,
  window = globalThis.window,
  catalog = typingTexts,
} = {}) {
  const elements = Object.fromEntries(elementIds.map((id) => [id, document.querySelector(`#${id}`)]));
  elements.timerProgress = document.querySelector(".timer-progress");

  const textById = createTextIndex(catalog);
  const storage = createStorage(textById, window.localStorage);

  // The piece the typist chose, and the text actually being run — which is the
  // piece most of the time, and a generated drill when one is started.
  let selectedPiece = resolveText(catalog, textById, storage.settings.selectedText);
  let activeText = selectedPiece;
  let words = getWords(activeText.body);
  let run = createRun();
  let secondsLeft = getRunLengthSeconds(activeText);
  let timerId = null;
  let runAnnotations = [];
  let focusWordIndexes = [];
  let pendingDrill = null;
  let currentTransitions = null;
  let focusRestartOnNextTab = false;
  let presentationUpdateScheduled = false;

  const afterLayout = (callback) => (window.requestAnimationFrame ?? ((fn) => fn()))(callback);
  const isDrill = () => Boolean(activeText.isDrill);

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
    renderPrompt({ elements, document, words, run });
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

  // Two frames of delay keeps the prompt repaint off the keystroke path.
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
    elements.currentTextMeta.textContent = isDrill()
      ? `practice · ${activeText.durationSeconds}s`
      : `${words.length} words · ${activeText.durationSeconds}s`;
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

  // Speed only means something against the speeds this typist has produced on
  // this same piece, so drills and other texts are left out of the range.
  function getSpeedRange(currentSpeed) {
    const history = storage.runsStore.runs
      .filter((record) => record.textId === selectedPiece.id)
      .map((record) => record.wordsPerMinute)
      .filter(Number.isFinite);
    if (!history.length) return null;
    const values = [...history, currentSpeed];
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      previous: history.at(-1),
      current: currentSpeed,
    };
  }

  // The detailed store is trimmed, so its records are folded into the transition
  // history as they arrive. Doing it by key makes the fold idempotent and lets
  // an existing typist's history appear the first time this runs.
  function syncTransitionHistory() {
    const known = new Set(storage.transitionsStore.runs.map((entry) => `${entry.textId}|${entry.completedAt}`));
    const missing = storage.getStoredAnalysisRecords()
      .filter((record) => !known.has(`${record.textId}|${record.completedAt}`))
      .map((record) => summariseRunTransitions(record, { pauseThresholdMs: record.summary?.pauseThresholdMs ?? pauseFloorMs }));
    if (!missing.length) return;
    storage.transitionsStore.runs = [...storage.transitionsStore.runs, ...missing]
      .sort((left, right) => String(left.completedAt).localeCompare(String(right.completedAt)));
    storage.saveStores();
  }

  function buildFinding(summary, completedAt) {
    const currentRecord = {
      events: run.events,
      words: run.completedWordAnalyses,
      textId: activeText.id,
      isDrill: isDrill(),
      completedAt,
    };
    const records = [...storage.getStoredAnalysisRecords(), currentRecord];
    currentTransitions = summariseRunTransitions(currentRecord, { pauseThresholdMs: summary.pauseThresholdMs });

    return selectFinding({
      summary,
      words,
      runEvents: run.events,
      transitions: measureTransitions(records, { pauseThresholdMs: summary.pauseThresholdMs }),
      // A finding leads the debrief only if it happened in the run being
      // debriefed; history supports the claim but cannot be the whole of it.
      runPairs: getRunPairs(currentRecord, { pauseThresholdMs: summary.pauseThresholdMs }),
      // Confidence is re-derived from the recent detailed records; the picture
      // of progress reaches back over every run ever measured.
      transitionHistory: [...storage.transitionsStore.runs, currentTransitions],
      currentTransitions,
      wordRecords: records,
      eventRecords: records,
    });
  }

  function finishRun() {
    if (run.finished) return;
    run.finish(now());
    presentationUpdateScheduled = false;
    focusRestartOnNextTab = true;
    window.clearInterval(timerId);
    timerId = null;

    // One timestamp for the whole run, so the record and its transition summary
    // are recognisably the same run and can never be folded in twice.
    const completedAt = new Date().toISOString();
    const metrics = run.getMetrics(getRunLengthSeconds(activeText) - secondsLeft);
    const consistency = getRunConsistency(run.keyIntervals);
    const summary = run.buildSummary({ storedRecords: storage.getStoredAnalysisRecords(), textId: activeText.id });
    const finding = buildFinding(summary, completedAt);
    pendingDrill = buildDrill(finding, catalog);

    runAnnotations = deriveRunAnnotations({ summary, words, runEvents: run.events, completedWordAnalyses: run.completedWordAnalyses });
    focusWordIndexes = finding.locations;

    const range = getSpeedRange(summary.effectiveWordsPerMinute);
    renderDebrief({
      elements,
      document,
      data: {
        speed: summary.effectiveWordsPerMinute,
        accuracy: summary.finalAccuracy,
        delta: range && Number.isFinite(range.previous) ? summary.effectiveWordsPerMinute - range.previous : null,
        range,
        rhythm: { events: run.events, thresholdMs: summary.pauseThresholdMs },
        finding,
        drill: pendingDrill,
      },
    });

    elements.resultPanel.hidden = false;
    elements.typingInput.disabled = true;
    elements.textSelect.disabled = false;
    elements.testView.hidden = true;
    elements.resultsView.hidden = false;

    paintPrompt();
    renderAnnotatedPassage({ elements, document, words, run, annotations: runAnnotations, focusWordIndexes });
    commitRun(metrics, consistency, summary, finding, completedAt);
    updateStats();
    afterLayout(() => elements.resultTitle.focus());
  }

  function commitRun(metrics, consistency, summary, finding, completedAt) {
    // A drill is practice, not a measurement of the piece, so it never enters
    // the per-text history or the speed range. Its events are still recorded,
    // which is what lets a later run test whether the drill actually helped.
    if (!isDrill()) {
      const stats = storage.getTextStats(activeText);
      run.promptAttempts.forEach((index) => {
        const character = stats.characters[index];
        if (!character) return;
        character.attempts += 1;
        if (run.mistakes.has(index)) character.mistakes += 1;
      });
      getSmoothedRunIntervals(run.intervals).forEach((intervalMs, index) => {
        const character = stats.characters[index];
        if (!character || intervalMs <= 0) return;
        character.intervalSamples += 1;
        character.totalIntervalMs += intervalMs;
      });
      stats.runs += 1;
      storage.statsStore.texts[activeText.id] = stats;

      const difficulty = getTextDifficulty(activeText);
      storage.runsStore.runs.push({
        textId: activeText.id, completedAt,
        wordsPerMinute: metrics.wordsPerMinute, accuracy: metrics.accuracy, consistency,
        typingScore: getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency),
        difficulty,
        approximateNormalizedWpm: Math.round(summary.effectiveWordsPerMinute / difficulty),
      });
    }

    const analysisText = storage.analysisStore.texts[activeText.id] || { runs: [] };
    const detailedRun = {
      completedAt,
      summary,
      events: run.events,
      words: run.completedWordAnalyses,
      derivationVersion: feedbackDerivationVersion,
      isDrill: isDrill(),
      drillFocus: activeText.focus ?? null,
      finding: finding.level === "none" ? null : { level: finding.level, subject: finding.subject, confidence: finding.confidence },
    };
    detailedRun.progressState = getProgressState([...analysisText.runs, detailedRun].map((record) => ({ ...record, textId: activeText.id })));
    analysisText.runs.push(detailedRun);
    // Detailed event records stay bounded so local storage cannot grow forever.
    analysisText.runs = analysisText.runs.slice(-maxDetailedRunsPerText);
    storage.analysisStore.texts[activeText.id] = analysisText;

    // The one record that outlives the trim, so a movement's history can go
    // back further than the events it was derived from.
    if (currentTransitions) storage.transitionsStore.runs.push(currentTransitions);

    storage.saveStores();
  }

  function resetRun({ chooseRandom = false, text = null } = {}) {
    if (text) {
      activeText = text;
    } else {
      if (chooseRandom) selectedPiece = resolveText(catalog, textById, "random");
      activeText = selectedPiece;
    }
    words = getWords(activeText.body);
    run = createRun();
    secondsLeft = getRunLengthSeconds(activeText);
    focusRestartOnNextTab = false;
    presentationUpdateScheduled = false;
    window.clearInterval(timerId);
    timerId = null;
    runAnnotations = [];
    focusWordIndexes = [];

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
    elements.resultTextDisplay.replaceChildren();
    elements.passageDetails.open = false;

    updateTextSummary();
    updateTimerProgress();
    paintPrompt();
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
      'button:not(:disabled), a, select:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary',
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
  elements.restartButton.addEventListener("click", () => resetRun({ text: activeText }));

  elements.textSelect.addEventListener("change", () => {
    storage.settings.selectedText = elements.textSelect.value;
    storage.saveSettings();
    selectedPiece = resolveText(catalog, textById, storage.settings.selectedText);
    resetRun();
  });

  elements.startDrillButton.addEventListener("click", () => {
    if (pendingDrill) resetRun({ text: pendingDrill });
  });
  elements.repeatPieceButton.addEventListener("click", () => resetRun());

  elements.clearHistoryButton.addEventListener("click", () => {
    if (!window.confirm("Clear all typing history and character statistics? This cannot be undone.")) return;
    storage.clearAll();
  });

  storage.removeLegacyStorage();
  syncTransitionHistory();
  populateTextPicker();
  resetRun({ chooseRandom: storage.settings.selectedText === "random" });

  // Driving the run with explicit timestamps is what makes timing-dependent
  // behaviour reproducible outside a real keyboard.
  return {
    elements,
    handleCharacter: (character, timestamp = now(), modifiers = {}) => applyKeyResult(run.handleCharacter(character, timestamp, modifiers)),
    handleBackspace: (timestamp = now(), modifiers = {}) => applyKeyResult(run.handleBackspace(timestamp, modifiers)),
    handleSpace: (timestamp = now(), modifiers = {}) => applyKeyResult(run.handleSpace(timestamp, modifiers)),
    finishRun,
    resetRun,
    getActiveText: () => activeText,
    getPendingDrill: () => pendingDrill,
  };
}
