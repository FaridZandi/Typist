const runLengthSeconds = 60;
const minimumCoverageRatio = 0.5;
const speedSmoothingPreviousLetters = 5;
const typingStatsKey = "typist-typing-stats-v2";
const typingRunsKey = "typist-typing-runs-v2";
const typingSettingsKey = "typist-typing-settings-v2";
const typingAnalysisKey = "typist-typing-analysis-v3";
const maxDetailedRunsPerText = 12;
const minimumTransitionSamples = 12;
const minimumWordSamples = 4;
const minimumTechniqueSamples = 8;
const pauseFloorMs = 700;
const pauseMedianMultiplier = 2.5;
const progressWindowSize = 3;
const retainedImprovementSpacingMs = 7 * 24 * 60 * 60 * 1000;
const feedbackDerivationVersion = 1;
const promptCatalog = typeof typingTexts === "undefined" && !window.typingTexts
  ? [{ id: "calm-precision", title: "Calm precision", body: "Typing well is built from steady rhythm, careful attention, and relaxed hands.", durationSeconds: 60 }]
  : (typeof typingTexts === "undefined" ? window.typingTexts : typingTexts);

const textDisplay = document.querySelector("#textDisplay");
const typingInput = document.querySelector("#typingInput");
const testView = document.querySelector("#testView");
const resultsView = document.querySelector("#resultsView");
const restartButton = document.querySelector("#restartButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const textSelect = document.querySelector("#textSelect");
const currentTextLabel = document.querySelector("#currentTextLabel");
const currentTextMeta = document.querySelector("#currentTextMeta");
const speedValue = document.querySelector("#speedValue");
const accuracyValue = document.querySelector("#accuracyValue");
const consistencyValue = document.querySelector("#consistencyValue");
const scoreValue = document.querySelector("#scoreValue");
const resultPanel = document.querySelector("#resultPanel");
const resultTitle = document.querySelector("#resultTitle");
const lastRunHeatmapTitle = document.querySelector("#lastRunHeatmapTitle");
const finalSpeed = document.querySelector("#finalSpeed");
const finalAccuracy = document.querySelector("#finalAccuracy");
const finalScore = document.querySelector("#finalScore");
const grossSpeed = document.querySelector("#grossSpeed");
const effectiveSpeed = document.querySelector("#effectiveSpeed");
const finalAccuracyDetail = document.querySelector("#finalAccuracyDetail");
const processAccuracy = document.querySelector("#processAccuracy");
const correctionSummary = document.querySelector("#correctionSummary");
const completionTime = document.querySelector("#completionTime");
const pauseSummary = document.querySelector("#pauseSummary");
const finalConsistency = document.querySelector("#finalConsistency");
const runObservation = document.querySelector("#runObservation");
const runEvidence = document.querySelector("#runEvidence");
const runRecommendation = document.querySelector("#runRecommendation");
const secondaryFeedback = document.querySelector("#secondaryFeedback");
const secondaryFeedbackCount = document.querySelector("#secondaryFeedbackCount");
const secondaryFeedbackList = document.querySelector("#secondaryFeedbackList");
const runNotes = document.querySelector("#runNotes");
const runNoteList = document.querySelector("#runNoteList");
const runNoteDescription = document.querySelector("#runNoteDescription");
const resultPassage = document.querySelector("#resultPassage");
const resultTextDisplay = document.querySelector("#resultTextDisplay");
const rhythmDetails = document.querySelector("#rhythmDetails");
const rhythmDetailSummary = document.querySelector("#rhythmDetailSummary");
const rhythmDetailIntro = document.querySelector("#rhythmDetailIntro");
const rhythmChartCanvas = document.querySelector("#rhythmChart");
const errorDetails = document.querySelector("#errorDetails");
const errorDetailSummary = document.querySelector("#errorDetailSummary");
const errorDetailIntro = document.querySelector("#errorDetailIntro");
const errorCategoryList = document.querySelector("#errorCategoryList");
const transitionDetails = document.querySelector("#transitionDetails");
const transitionDetailSummary = document.querySelector("#transitionDetailSummary");
const transitionDetailIntro = document.querySelector("#transitionDetailIntro");
const transitionList = document.querySelector("#transitionList");
const wordDetails = document.querySelector("#wordDetails");
const wordDetailSummary = document.querySelector("#wordDetailSummary");
const wordDetailIntro = document.querySelector("#wordDetailIntro");
const wordList = document.querySelector("#wordList");
const progressDetails = document.querySelector("#progressDetails");
const progressDetailSummary = document.querySelector("#progressDetailSummary");
const progressDetailIntro = document.querySelector("#progressDetailIntro");
const resultAnalysisTabs = [...document.querySelectorAll("[data-result-tab]")];
const resultAnalysisPanels = [...document.querySelectorAll("[data-result-panel]")];
const lastRunHeatmap = document.querySelector("#lastRunHeatmap");
const lastRunHistogramCanvas = document.querySelector("#lastRunHistogram");
const heatmapDisplay = document.querySelector("#heatmapDisplay");
const heatmapRuns = document.querySelector("#heatmapRuns");
const accuracyLegendHighest = document.querySelector("#accuracyLegendHighest");
const accuracyLegendLowest = document.querySelector("#accuracyLegendLowest");
const speedChart = document.querySelector("#speedChart");
const speedLegendHighest = document.querySelector("#speedLegendHighest");
const speedLegendLowest = document.querySelector("#speedLegendLowest");
const progressChartCanvas = document.querySelector("#progressChart");
const tradeoffChartCanvas = document.querySelector("#tradeoffChart");
const timerProgress = document.querySelector(".timer-progress");
const timerProgressFill = document.querySelector("#timerProgressFill");
const chartScopeInputs = [...document.querySelectorAll('input[name="chartScope"]')];
const viewTabLists = [...document.querySelectorAll("[data-view-tabs]")];

const textById = new Map(promptCatalog.map((text) => [text.id, text]));
let settings = loadSettings();
let activeText = resolveText(settings.selectedText);
let words = getWords(activeText.body);
let started = false;
let finished = false;
let timerId = null;
let secondsLeft = getActiveRunLengthSeconds();
let currentWordIndex = 0;
let currentWordBuffer = "";
let currentWordKeys = [];
let currentWordLastKeyTimes = new Map();
let currentWordMistakeOffsets = new Set();
let currentWordDeletedExtraErrors = 0;
let committedWords = [];
let runPromptAttempts = new Set();
let runMistakes = new Set();
let runIntervals = new Map();
let runExpectedAttempts = 0;
let runCorrectCharacters = 0;
let runMistakeCount = 0;
let runExtraErrors = 0;
let previousMatchedTime = null;
let previousKeyTime = null;
let runKeyIntervals = [];
let runEvents = [];
let completedWordAnalyses = [];
let runPrintableKeyCount = 0;
let runCommittedSpaces = 0;
let runProcessErrors = 0;
let runCorrectedErrors = 0;
let runStartTimestamp = null;
let runAnnotations = [];
let activeRunAnnotationId = null;
let statsStore = loadStatsStore();
let runsStore = loadRunsStore();
let analysisStore = loadAnalysisStore();
let progressChart = null;
let tradeoffChart = null;
let lastRunHistogram = null;
let rhythmChart = null;
let lastRunSpeeds = [];
let lastRunHistogramBins = [];
let focusRestartOnNextTab = false;
let presentationUpdateScheduled = false;

function safeRead(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function loadSettings() {
  const saved = safeRead(typingSettingsKey, {});
  return {
    selectedText: saved.selectedText === "random" || textById.has(saved.selectedText) ? saved.selectedText : "random",
    chartScope: saved.chartScope === "all" ? "all" : "text",
  };
}

function saveSettings() {
  try {
    localStorage.setItem(typingSettingsKey, JSON.stringify(settings));
  } catch {
    // The session remains usable when local storage is unavailable.
  }
}

function loadStatsStore() {
  const saved = safeRead(typingStatsKey, {});
  return saved?.version === 2 && saved.texts && typeof saved.texts === "object"
    ? { version: 2, texts: saved.texts }
    : { version: 2, texts: {} };
}

function loadRunsStore() {
  const saved = safeRead(typingRunsKey, {});
  return saved?.version === 2 && Array.isArray(saved.runs)
    ? { version: 2, runs: saved.runs.filter(isValidRun) }
    : { version: 2, runs: [] };
}

function loadAnalysisStore() {
  const saved = safeRead(typingAnalysisKey, {});
  return saved?.version === 3 && saved.texts && typeof saved.texts === "object"
    ? { version: 3, texts: saved.texts }
    : { version: 3, texts: {} };
}

function removeLegacyTypingStorage() {
  try {
    [...Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))]
      .filter((key) => key?.startsWith("typist-heatmap:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage restrictions.
  }
}

function isValidRun(run) {
  return Boolean(
    run &&
      textById.has(run.textId) &&
      typeof run.completedAt === "string" &&
      Number.isFinite(run.wordsPerMinute) &&
      Number.isFinite(run.accuracy) &&
      Number.isFinite(run.consistency) &&
      Number.isFinite(run.typingScore),
  );
}

function saveStores() {
  try {
    localStorage.setItem(typingStatsKey, JSON.stringify(statsStore));
    localStorage.setItem(typingRunsKey, JSON.stringify(runsStore));
    localStorage.setItem(typingAnalysisKey, JSON.stringify(analysisStore));
  } catch {
    // The current run still renders when persistence fails.
  }
}

function createTextStats(text = activeText) {
  return {
    textId: text.id,
    runs: 0,
    characters: [...text.body].map(() => ({
      attempts: 0,
      mistakes: 0,
      intervalSamples: 0,
      totalIntervalMs: 0,
    })),
  };
}

function getTextStats(text = activeText) {
  const saved = statsStore.texts[text.id];
  if (!saved || !Array.isArray(saved.characters) || saved.characters.length !== text.body.length) {
    statsStore.texts[text.id] = createTextStats(text);
  }
  const stats = statsStore.texts[text.id];
  stats.runs = Number.isInteger(stats.runs) ? stats.runs : 0;
  stats.characters = stats.characters.map((character) => ({
    attempts: Number.isFinite(character.attempts) ? character.attempts : 0,
    mistakes: Number.isFinite(character.mistakes) ? character.mistakes : 0,
    intervalSamples: Number.isFinite(character.intervalSamples) ? character.intervalSamples : 0,
    totalIntervalMs: Number.isFinite(character.totalIntervalMs) ? character.totalIntervalMs : 0,
  }));
  return stats;
}

function resolveText(selection) {
  if (selection !== "random" && textById.has(selection)) return textById.get(selection);
  return promptCatalog[Math.floor(Math.random() * promptCatalog.length)];
}

function getActiveRunLengthSeconds() {
  return activeText.durationSeconds || runLengthSeconds;
}

function getTextDifficulty(text) {
  const characters = [...text.body];
  const letters = characters.filter((character) => /\p{L}/u.test(character));
  const punctuation = characters.filter((character) => /[^\p{L}\p{N}\s]/u.test(character)).length;
  const capitals = letters.filter((character) => character === character.toUpperCase() && character !== character.toLowerCase()).length;
  const punctuationDensity = punctuation / Math.max(1, characters.length);
  const capitalRate = capitals / Math.max(1, letters.length);
  return Number((1 + punctuationDensity * 2 + capitalRate * 0.4 + Math.max(0, characters.length - 400) / 2000).toFixed(3));
}

function getWords(body) {
  return [...body.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function populateTextPicker() {
  textSelect.replaceChildren();
  const randomOption = document.createElement("option");
  randomOption.value = "random";
  randomOption.textContent = "Random practice piece";
  textSelect.append(randomOption);
  promptCatalog.forEach((text, index) => {
    const option = document.createElement("option");
    option.value = text.id;
    option.textContent = `${index + 1}. ${text.title} · ${getWords(text.body).length} words`;
    option.title = text.body;
    textSelect.append(option);
  });
  textSelect.value = settings.selectedText;
}

function updateTextSummary() {
  currentTextLabel.textContent = activeText.title;
  currentTextMeta.textContent = `${words.length} words · ${activeText.durationSeconds}s`;
  lastRunHeatmapTitle.textContent = `${activeText.title} · last run character speed`;
}

function getPromptIndex(word, offset) {
  return word.start + offset;
}

function renderPrompt() {
  textDisplay.replaceChildren();
  words.forEach((word, wordIndex) => {
    const wordElement = document.createElement("span");
    wordElement.className = "prompt-word";
    const annotations = finished ? runAnnotations.filter((annotation) => annotation.wordIndex === wordIndex) : [];
    if (annotations.length) {
      wordElement.classList.add("run-annotation");
      wordElement.title = annotations.map((annotation) => annotation.message).join(" · ");
      if (annotations.some((annotation) => annotation.id === activeRunAnnotationId)) wordElement.classList.add("run-annotation-active");
    }
    if (wordIndex === currentWordIndex && !finished) wordElement.classList.add("active-word");
    const committed = committedWords[wordIndex];
    const isActive = wordIndex === currentWordIndex && !committed && !finished;
    const visibleBuffer = isActive ? [...currentWordBuffer] : committed?.typedCharacters || [];
    const mistakeOffsets = isActive ? currentWordMistakeOffsets : new Set(committed?.mistakeOffsets || []);

    if (isActive && visibleBuffer.length === 0) appendCaret(wordElement);

    [...word.text].forEach((character, offset) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = character;
      const typedCharacter = visibleBuffer[offset];
      if (typedCharacter !== undefined) {
        span.classList.add(typedCharacter === character ? "correct" : "incorrect");
        if (typedCharacter === character && mistakeOffsets.has(offset)) span.classList.add("corrected");
      } else if (committed) {
        span.classList.add("incorrect");
      }
      span.dataset.promptIndex = String(getPromptIndex(word, offset));
      wordElement.append(span);
      if (isActive && offset === visibleBuffer.length - 1) appendCaret(wordElement);
    });

    if (isActive || committed) {
      visibleBuffer.slice(word.text.length).forEach((character, extraIndex) => {
        const extra = document.createElement("span");
        extra.className = "extra-char";
        extra.textContent = character;
        extra.title = "Extra character: counted as an error, with no prompt position";
        wordElement.append(extra);
        if (isActive && extraIndex === visibleBuffer.length - word.text.length - 1) {
          appendCaret(wordElement);
        }
      });
    }
    textDisplay.append(wordElement);

    if (wordIndex < words.length - 1) {
      const separator = document.createElement("span");
      separator.className = "char prompt-space";
      separator.textContent = " ";
      separator.setAttribute("aria-hidden", "true");
      if (committed && committed.separatorCommitted) separator.classList.add("correct");
      textDisplay.append(separator);
    }
  });
  resultPassage.hidden = !finished;
  resultTextDisplay.replaceChildren(...[...textDisplay.childNodes].map((node) => node.cloneNode(true)));
}

function setResultAnalysisTab(tabId) {
  resultAnalysisTabs.forEach((tab) => {
    const active = tab.dataset.resultTab === tabId;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  resultAnalysisPanels.forEach((panel) => { panel.hidden = panel.dataset.resultPanel !== tabId; });
  if (tabId === "rhythm" && !resultsView.hidden) {
    const afterLayout = window.requestAnimationFrame ?? ((callback) => callback());
    afterLayout(() => rhythmChart?.resize?.());
  }
}

function appendCaret(parent) {
  const caret = document.createElement("span");
  caret.className = "typing-caret";
  caret.setAttribute("aria-hidden", "true");
  parent.append(caret);
}

function startTimer() {
  if (started || finished) return;
  started = true;
  textSelect.disabled = true;
  timerId = setInterval(() => {
    secondsLeft -= 1;
    updateStats();
    if (secondsLeft <= 0) finishRun();
  }, 1000);
}

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function recordRunEvent(type, key, timestamp, offset, expectedCharacter = null, modifiers = {}) {
  if (!Number.isFinite(timestamp)) return;
  if (runStartTimestamp === null) runStartTimestamp = timestamp;
  runEvents.push({
    type,
    key,
    timestampMs: Math.max(0, timestamp - runStartTimestamp),
    wordIndex: currentWordIndex,
    bufferOffset: offset,
    expectedCharacter,
    modifiers: { shift: Boolean(modifiers.shift), alt: Boolean(modifiers.alt), ctrl: Boolean(modifiers.ctrl), meta: Boolean(modifiers.meta) },
  });
}

function handleCharacter(character, timestamp = getNow(), modifiers = {}) {
  if (finished || character === " " || currentWordIndex >= words.length) return;
  startTimer();
  recordKeyTiming(timestamp);
  const offset = currentWordBuffer.length;
  const expected = words[currentWordIndex].text[offset];
  recordRunEvent("character", character, timestamp, offset, expected ?? null, modifiers);
  runPrintableKeyCount += 1;
  if (character !== expected) runProcessErrors += 1;
  currentWordBuffer += character;
  currentWordKeys.push({ character, offset, timestamp });
  currentWordLastKeyTimes.set(offset, timestamp);
  if (expected !== character) currentWordMistakeOffsets.add(offset);
  renderPrompt();
  const isFinalWord = currentWordIndex === words.length - 1;
  if (isFinalWord && currentWordBuffer.length >= words[currentWordIndex].text.length && [...currentWordBuffer].every((value, index) => value === words[currentWordIndex].text[index])) {
    commitCurrentWord(timestamp, false);
    finishRun();
    return;
  }
  schedulePresentationUpdate();
}

function handleBackspace(timestamp = getNow(), modifiers = {}) {
  if (finished || currentWordBuffer.length === 0) return;
  startTimer();
  recordKeyTiming(timestamp);
  const removedOffset = currentWordBuffer.length - 1;
  const removedCharacter = [...currentWordBuffer][removedOffset];
  const expected = words[currentWordIndex].text[removedOffset];
  recordRunEvent("backspace", "Backspace", timestamp, removedOffset, expected ?? null, modifiers);
  if (removedCharacter !== expected) runCorrectedErrors += 1;
  if (removedOffset >= words[currentWordIndex].text.length) currentWordDeletedExtraErrors += 1;
  currentWordBuffer = [...currentWordBuffer].slice(0, -1).join("");
  currentWordKeys.push({ character: "Backspace", offset: removedOffset, timestamp });
  renderPrompt();
  schedulePresentationUpdate();
}

function handleSpace(timestamp = getNow(), modifiers = {}) {
  if (finished) return;
  startTimer();
  recordKeyTiming(timestamp);
  recordRunEvent("space", " ", timestamp, currentWordBuffer.length, null, modifiers);
  runPrintableKeyCount += 1;
  commitCurrentWord(timestamp, true);
  renderPrompt();
  if (currentWordIndex >= words.length) finishRun();
  else schedulePresentationUpdate();
}

function schedulePresentationUpdate() {
  if (presentationUpdateScheduled || finished) return;
  presentationUpdateScheduled = true;
  const requestFrame = window.requestAnimationFrame ?? ((callback) => callback());

  requestFrame(() => {
    requestFrame(() => {
      presentationUpdateScheduled = false;
      updateStats();
      renderPrompt();
    });
  });
}

function recordMatchedTiming(promptIndex, timestamp) {
  if (!Number.isFinite(timestamp)) return;
  if (previousMatchedTime !== null && timestamp > previousMatchedTime) runIntervals.set(promptIndex, timestamp - previousMatchedTime);
  previousMatchedTime = timestamp;
}

function recordKeyTiming(timestamp) {
  if (!Number.isFinite(timestamp)) return;
  if (previousKeyTime !== null && timestamp > previousKeyTime) {
    runKeyIntervals.push(timestamp - previousKeyTime);
  }
  previousKeyTime = timestamp;
}

function commitCurrentWord(separatorTimestamp = getNow(), includeSeparator) {
  if (finished || currentWordIndex >= words.length) return;
  const word = words[currentWordIndex];
  const typedCharacters = [...currentWordBuffer];
  const mistakeOffsets = new Set(currentWordMistakeOffsets);
  const committed = { typedCharacters, mistakeOffsets: [...mistakeOffsets], separatorCommitted: Boolean(includeSeparator) };
  completedWordAnalyses.push({ ...analyzeWordAlignment(word.text, typedCharacters), wordIndex: currentWordIndex });
  let wordMistakes = 0;

  [...word.text].forEach((expectedCharacter, offset) => {
    const promptIndex = getPromptIndex(word, offset);
    runPromptAttempts.add(promptIndex);
    runExpectedAttempts += 1;
    const isCorrect = typedCharacters[offset] === expectedCharacter && !mistakeOffsets.has(offset);
    if (isCorrect) {
      runCorrectCharacters += 1;
      recordMatchedTiming(promptIndex, currentWordLastKeyTimes.get(offset));
    } else {
      wordMistakes += 1;
      runMistakes.add(promptIndex);
    }
  });
  const extraErrors = currentWordDeletedExtraErrors + Math.max(0, typedCharacters.length - word.text.length);
  runExtraErrors += extraErrors;
  runMistakeCount += wordMistakes + extraErrors;

  if (includeSeparator && currentWordIndex < words.length - 1) {
    const separatorIndex = word.end;
    runPromptAttempts.add(separatorIndex);
    runExpectedAttempts += 1;
    runCorrectCharacters += 1;
    recordMatchedTiming(separatorIndex, separatorTimestamp);
    runCommittedSpaces += 1;
  }

  committedWords[currentWordIndex] = committed;
  currentWordIndex += includeSeparator ? 1 : 0;
  if (!includeSeparator) currentWordIndex = words.length;
  currentWordBuffer = "";
  currentWordKeys = [];
  currentWordLastKeyTimes = new Map();
  currentWordMistakeOffsets = new Set();
  currentWordDeletedExtraErrors = 0;
}

function analyzeWordAlignment(expected, typed) {
  const source = [...expected];
  const target = [...typed];
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  const moves = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(null));
  for (let row = 1; row <= source.length; row += 1) { matrix[row][0] = row; moves[row][0] = "omission"; }
  for (let column = 1; column <= target.length; column += 1) { matrix[0][column] = column; moves[0][column] = "insertion"; }
  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const candidates = [
        { cost: matrix[row - 1][column - 1] + (source[row - 1] === target[column - 1] ? 0 : 1), move: source[row - 1] === target[column - 1] ? "match" : "substitution" },
        { cost: matrix[row - 1][column] + 1, move: "omission" },
        { cost: matrix[row][column - 1] + 1, move: "insertion" },
      ];
      if (row > 1 && column > 1 && source[row - 1] === target[column - 2] && source[row - 2] === target[column - 1]) {
        candidates.push({ cost: matrix[row - 2][column - 2] + 1, move: "transposition" });
      }
      const best = candidates.reduce((left, right) => right.cost < left.cost ? right : left);
      matrix[row][column] = best.cost;
      moves[row][column] = best.move;
    }
  }
  const categories = { substitution: 0, omission: 0, insertion: 0, transposition: 0, duplication: 0, capitalization: 0, punctuation: 0 };
  let row = source.length;
  let column = target.length;
  while (row || column) {
    const move = moves[row][column];
    if (move === "match") { row -= 1; column -= 1; continue; }
    if (move === "substitution") {
      const expectedCharacter = source[row - 1];
      const enteredCharacter = target[column - 1];
      if (expectedCharacter.toLowerCase() === enteredCharacter.toLowerCase() && expectedCharacter !== enteredCharacter) categories.capitalization += 1;
      else if (/[^\p{L}\p{N}\s]/u.test(expectedCharacter) || /[^\p{L}\p{N}\s]/u.test(enteredCharacter)) categories.punctuation += 1;
      else categories.substitution += 1;
      row -= 1; column -= 1;
    } else if (move === "omission") { categories.omission += 1; row -= 1; }
    else if (move === "insertion") {
      categories.insertion += 1;
      if (column > 1 && target[column - 1] === target[column - 2]) categories.duplication += 1;
      column -= 1;
    } else if (move === "transposition") { categories.transposition += 1; row -= 2; column -= 2; }
    else break;
  }
  const incorrectExpected = categories.substitution + categories.omission + categories.capitalization + categories.punctuation + (categories.transposition * 2);
  return { expected, typed, categories, finalCorrect: Math.max(0, source.length - incorrectExpected) };
}

function processExternalInput(value) {
  typingInput.value = "";
  if (!/[\s]/.test(value) && currentWordIndex < words.length) {
    currentWordBuffer = "";
    currentWordKeys = [];
    currentWordLastKeyTimes = new Map();
  }
  [...value].forEach((character) => {
    if (character === " ") handleSpace(getNow());
    else if (character === "\n" || character === "\r" || character === "\t") handleSpace(getNow());
    else handleCharacter(character, getNow());
  });
}

function getProvisionalCounts() {
  let attempts = runExpectedAttempts;
  let correct = runCorrectCharacters;
  let mistakes = runMistakeCount;
  if (!finished && currentWordIndex < words.length) {
    const expected = [...words[currentWordIndex].text];
    const typed = [...currentWordBuffer];
    attempts += typed.length;
    typed.forEach((character, index) => {
      if (character === expected[index] && !currentWordMistakeOffsets.has(index)) correct += 1;
      else mistakes += 1;
    });
  }
  return { attempts, correct, mistakes };
}

function getMetrics() {
  const counts = getProvisionalCounts();
  const minutesElapsed = Math.max(
    (getActiveRunLengthSeconds() - secondsLeft) / 60,
    1 / 60,
  );
  const wordsPerMinute = Math.round(counts.correct / 5 / minutesElapsed);
  const attempts = counts.attempts + runExtraErrors;
  const accuracy = attempts === 0 ? 100 : Math.round((counts.correct / attempts) * 100);
  return { wordsPerMinute, accuracy };
}

function getTypingScore(wordsPerMinute, accuracy, consistency) {
  return Math.round(wordsPerMinute * (accuracy / 100) + consistency);
}

function getRunConsistency(intervals) {
  const values = [...intervals.values()].filter((value) => value > 0);
  if (values.length < 2) return 100;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.max(0, Math.min(100, (1 - Math.sqrt(variance) / mean) * 100)));
}

function getMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getStoredAnalysisRecords() {
  return Object.entries(analysisStore.texts).flatMap(([textId, text]) => (text.runs || []).map((run) => ({ ...run, textId })));
}

function getSessionAnalysis() {
  const categories = { substitution: 0, omission: 0, insertion: 0, transposition: 0, duplication: 0, capitalization: 0, punctuation: 0 };
  let finalCorrect = 0;
  let expectedCharacters = 0;
  let insertions = 0;
  completedWordAnalyses.forEach((word) => {
    finalCorrect += word.finalCorrect;
    expectedCharacters += [...word.expected].length;
    insertions += word.categories.insertion;
    Object.keys(categories).forEach((category) => { categories[category] += word.categories[category]; });
  });
  finalCorrect += runCommittedSpaces;
  expectedCharacters += runCommittedSpaces;
  const intervals = runKeyIntervals.filter((interval) => interval > 0);
  const medianInterval = getMedian(intervals);
  const pauseThreshold = Math.max(pauseFloorMs, medianInterval * pauseMedianMultiplier);
  const pauses = intervals.filter((interval) => interval >= pauseThreshold);
  const lastTimestamp = runEvents.at(-1)?.timestampMs ?? 0;
  const fluency = getFluencyMetrics(runEvents);
  const durationMs = Math.max(lastTimestamp, 1000);
  const minutes = durationMs / 60000;
  const finalAttempts = expectedCharacters + insertions;
  const processAttempts = runPrintableKeyCount;
  const transitions = getTransitionAggregate([...getStoredAnalysisRecords(), { events: runEvents, textId: activeText.id }]);
  const trigrams = getTransitionAggregate([...getStoredAnalysisRecords(), { events: runEvents, textId: activeText.id }], 3);
  const characters = getCharacterAggregate([...getStoredAnalysisRecords(), { events: runEvents, textId: activeText.id }]);
  const wordPatterns = getWordAggregate([...getStoredAnalysisRecords(), { events: runEvents, words: completedWordAnalyses, textId: activeText.id }]);
  const prefixPatterns = getWordFragmentAggregate([...getStoredAnalysisRecords(), { words: completedWordAnalyses, textId: activeText.id }], "prefix");
  const suffixPatterns = getWordFragmentAggregate([...getStoredAnalysisRecords(), { words: completedWordAnalyses, textId: activeText.id }], "suffix");
  const shift = getShiftMetrics([...getStoredAnalysisRecords(), { events: runEvents, textId: activeText.id }]);
  return {
    grossWordsPerMinute: Math.round((runPrintableKeyCount / 5) / minutes),
    effectiveWordsPerMinute: Math.round((finalCorrect / 5) / minutes),
    finalAccuracy: finalAttempts ? Math.round((finalCorrect / finalAttempts) * 100) : 100,
    processAccuracy: processAttempts ? Math.round(((processAttempts - runProcessErrors) / processAttempts) * 100) : 100,
    correctedErrors: runCorrectedErrors,
    remainingErrors: Math.max(0, finalAttempts - finalCorrect),
    completionMs: lastTimestamp,
    pauseCount: pauses.length,
    pauseDurationMs: pauses.reduce((total, pause) => total + pause, 0),
    pauseThresholdMs: Math.round(pauseThreshold),
    categories,
    transitions,
    trigrams,
    characters,
    wordPatterns,
    prefixPatterns,
    suffixPatterns,
    shift,
    ...fluency,
  };
}

function deriveRunAnnotations(summary) {
  const annotations = [];
  let id = 0;
  const add = (kind, wordIndex, label, message, severity = "medium", evidence = null, confidence = "run-only") => {
    if (!Number.isInteger(wordIndex)) return;
    annotations.push({ id: `${kind}-${id += 1}`, kind, wordIndex, scope: { type: "word", wordIndex }, label, message, severity, evidence, confidence });
  };
  completedWordAnalyses.forEach((analysis) => {
    const errors = [...analysis.expected].length - analysis.finalCorrect + analysis.categories.insertion;
    const categoryAnnotations = getWordErrorAnnotations(analysis);
    if (categoryAnnotations.length) categoryAnnotations.forEach((annotation) => add(annotation.kind, analysis.wordIndex, annotation.label, annotation.message, annotation.severity, { count: annotation.count }));
    else if (errors) add("error", analysis.wordIndex, `${errors} error${errors === 1 ? "" : "s"} in “${analysis.expected}”`, `Committed with ${errors} remaining error${errors === 1 ? "" : "s"}.`, errors > 1 ? "high" : "medium", { count: errors });
  });
  runEvents.forEach((event, index) => {
    const previous = runEvents[index - 1];
    if (previous && event.timestampMs > previous.timestampMs && event.timestampMs - previous.timestampMs >= summary.pauseThresholdMs) {
      const durationMs = event.timestampMs - previous.timestampMs;
      add("pause", event.wordIndex, `Pause before “${words[event.wordIndex]?.text || "this word"}”`, `${Math.round(durationMs / 100) / 10}s pause before this word.`, "medium", { durationMs });
    }
    if (event.type === "backspace" && previous?.type === "character" && previous.key !== previous.expectedCharacter) {
      add("correction", event.wordIndex, `Correction in “${words[event.wordIndex]?.text || "this word"}”`, "An incorrect key was removed before the word was committed.", "low", { count: 1 });
    }
  });
  const transitions = [];
  runEvents.forEach((event, index) => {
    const previous = runEvents[index - 1];
    const isAlignedCharacter = event.type === "character" && event.key === event.expectedCharacter;
    const followsAlignedCharacter = previous?.type === "character" && previous.key === previous.expectedCharacter;
    if (!isAlignedCharacter || !followsAlignedCharacter || event.wordIndex !== previous.wordIndex || event.bufferOffset !== previous.bufferOffset + 1) return;
    const interval = event.timestampMs - previous.timestampMs;
    if (interval > 0) transitions.push({ event, previous, interval });
  });
  const transitionMedian = getMedian(transitions.map((transition) => transition.interval));
  const slowTransitionThreshold = Math.max(300, transitionMedian * 1.75);
  transitions.filter((transition) => transition.interval >= slowTransitionThreshold).forEach((transition) => {
    const pair = `${transition.previous.key}${transition.event.key}`;
    add("slow-transition", transition.event.wordIndex, `Slow “${pair}” in “${words[transition.event.wordIndex]?.text || "this word"}”`, `${Math.round(transition.interval)}ms between “${pair[0]}” and “${pair[1]}”, slower than this run’s usual transitions.`, "medium", { pair, intervalMs: Math.round(transition.interval) });
  });
  const wordTimings = completedWordAnalyses.map((analysis) => {
    const timestamps = runEvents.filter((event) => event.wordIndex === analysis.wordIndex).map((event) => event.timestampMs);
    const duration = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
    return { analysis, durationPerCharacter: duration / Math.max(1, [...analysis.expected].length) };
  }).filter((timing) => timing.durationPerCharacter > 0);
  const wordMedian = getMedian(wordTimings.map((timing) => timing.durationPerCharacter));
  wordTimings.filter((timing) => wordTimings.length >= 3 && timing.durationPerCharacter >= Math.max(250, wordMedian * 1.75)).forEach((timing) => {
    add("slow-word", timing.analysis.wordIndex, `Slow word “${timing.analysis.expected}”`, `${Math.round(timing.durationPerCharacter)}ms per character, slower than this run’s usual words.`, "medium", { durationPerCharacter: Math.round(timing.durationPerCharacter) });
  });
  if (summary.earlyIntervalMs && summary.lateIntervalMs && Math.abs(summary.fatiguePercent) >= 20) {
    const lateEvent = [...runEvents].reverse().find((event) => Number.isInteger(event.wordIndex));
    const slower = summary.fatiguePercent > 0;
    add("pace-change", lateEvent?.wordIndex, slower ? "Pace slowed near the end" : "Pace picked up near the end", `The final third was ${Math.abs(summary.fatiguePercent)}% ${slower ? "slower" : "faster"} than the opening third.`, "medium", { percent: Math.abs(summary.fatiguePercent) });
  }
  return annotations;
}

function getWordErrorAnnotations(analysis) {
  const labels = {
    substitution: "substitution", omission: "omission", insertion: "insertion", transposition: "transposition",
    duplication: "duplication", capitalization: "capitalization error", punctuation: "punctuation error",
  };
  return Object.entries(analysis.categories || {}).filter(([, count]) => count > 0).map(([kind, count]) => ({
    kind,
    count,
    label: `${count} ${labels[kind]}${count === 1 ? "" : "s"} in “${analysis.expected}”`,
    message: `The word was committed with ${count} ${labels[kind]}${count === 1 ? "" : "s"}.`,
    severity: count > 1 ? "high" : "medium",
  }));
}

function renderRunNotes() {
  runNoteList.replaceChildren();
  runNotes.hidden = runAnnotations.length === 0;
  const activeAnnotation = runAnnotations.find((annotation) => annotation.id === activeRunAnnotationId);
  runNoteDescription.hidden = !activeAnnotation;
  runNoteDescription.textContent = activeAnnotation ? activeAnnotation.message : "";
  runAnnotations.slice(0, 5).forEach((annotation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-note";
    button.textContent = annotation.label;
    button.title = annotation.message;
    button.setAttribute("aria-label", `${annotation.label}: ${annotation.message}`);
    button.setAttribute("aria-controls", "runNoteDescription");
    button.setAttribute("aria-pressed", String(annotation.id === activeRunAnnotationId));
    button.addEventListener("click", () => {
      activeRunAnnotationId = activeRunAnnotationId === annotation.id ? null : annotation.id;
      renderRunNotes();
      renderPrompt();
      if (activeRunAnnotationId) runNoteDescription.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });
    runNoteList.append(button);
  });
}

function getFluencyMetrics(events) {
  const timed = [];
  const recoveryIntervals = [];
  let previous = null;
  events.forEach((event) => {
    if (previous && event.timestampMs > previous.timestampMs) {
      const interval = event.timestampMs - previous.timestampMs;
      timed.push({ timestampMs: event.timestampMs, interval });
      if (previous.type === "character" && previous.expectedCharacter !== null && previous.key !== previous.expectedCharacter) recoveryIntervals.push(interval);
    }
    previous = event;
  });
  const last = events.at(-1)?.timestampMs || 0;
  const third = last / 3;
  const average = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  const early = average(timed.filter((point) => point.timestampMs <= third).map((point) => point.interval));
  const late = average(timed.filter((point) => point.timestampMs >= third * 2).map((point) => point.interval));
  return {
    recoveryMs: Math.round(average(recoveryIntervals)),
    recoverySamples: recoveryIntervals.length,
    earlyIntervalMs: Math.round(early),
    lateIntervalMs: Math.round(late),
    fatiguePercent: early && late ? Math.round(((late / early) - 1) * 100) : 0,
  };
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function getFeedbackBundles(summary) {
  const candidates = [];
  if (summary.pauseCount >= 2) candidates.push({
    kind: "pauses", scope: "run", sampleCount: summary.pauseCount, confidence: "run-only", impact: summary.pauseCount * 10, stability: 1, actionability: 1,
    title: "Pauses interrupted your rhythm",
    observation: `${summary.pauseCount} pauses exceeded ${Math.round(summary.pauseThresholdMs / 100) / 10}s, so your speed came in bursts rather than a steady flow.`,
    recommendation: "Practice one short phrase at a comfortable pace, leaving a deliberate but even beat between words.",
  });
  const slowTransition = summary.transitions?.find((transition) => transition.confidence === "supported" && transition.slowdownPercent >= 20);
  if (slowTransition) candidates.push({
    kind: "transition", scope: slowTransition.pair, sampleCount: slowTransition.samples, confidence: "supported", impact: slowTransition.samples * slowTransition.slowdownPercent / 10, stability: 1, actionability: 1,
    sourceTextCount: slowTransition.sourceTextCount,
    title: `“${slowTransition.pair}” is disrupting your rhythm`,
    observation: `Across ${slowTransition.samples} recent occurrences, “${slowTransition.pair}” is ${slowTransition.slowdownPercent}% slower than your typical recorded transition${slowTransition.sourceTextCount > 1 ? " across your saved texts" : ""}.`,
    recommendation: `Practice a small group of words containing “${slowTransition.pair}” slowly, then repeat at a comfortable pace.`,
  });
  const slowTrigram = summary.trigrams?.find((transition) => transition.confidence === "supported" && transition.slowdownPercent >= 20);
  if (slowTrigram && !slowTransition) candidates.push({
    kind: "trigram", scope: slowTrigram.pair, sampleCount: slowTrigram.samples, confidence: "supported", sourceTextCount: slowTrigram.sourceTextCount,
    impact: slowTrigram.samples * slowTrigram.slowdownPercent / 10, stability: slowTrigram.sourceTextCount > 1 ? 1 : 0.8, actionability: 1,
    title: `“${slowTrigram.pair}” is disrupting your rhythm`,
    observation: `Across ${slowTrigram.samples} recent occurrences, “${slowTrigram.pair}” is ${slowTrigram.slowdownPercent}% slower than your typical recorded three-letter sequence${slowTrigram.sourceTextCount > 1 ? " across your saved texts" : ""}.`,
    recommendation: `Practice a small group of words containing “${slowTrigram.pair}” slowly, then repeat at a comfortable pace.`,
  });
  const weakCharacter = summary.characters?.find((character) => character.confidence === "supported" && character.accuracy <= 90 && character.attempts - character.correct >= 2);
  if (weakCharacter) candidates.push({
    kind: "character", scope: weakCharacter.character, sampleCount: weakCharacter.attempts, confidence: "supported", sourceTextCount: weakCharacter.sourceTextCount,
    impact: (weakCharacter.attempts - weakCharacter.correct) * 8, stability: weakCharacter.sourceTextCount > 1 ? 1 : 0.8, actionability: 1,
    title: `“${weakCharacter.character}” needs more reliable control`,
    observation: `“${weakCharacter.character}” was correct ${weakCharacter.accuracy}% of the time across ${weakCharacter.attempts} recorded attempts${weakCharacter.commonSubstitution ? `, most often becoming “${weakCharacter.commonSubstitution}”` : ""}.`,
    recommendation: `Practice a short set of words with “${weakCharacter.character}”, prioritizing clean presses over speed.`,
  });
  const repeatedWordError = summary.wordPatterns?.find((word) => word.confidence === "supported" && word.finalErrors >= 2);
  if (repeatedWordError) candidates.push({
    kind: "word", scope: repeatedWordError.word, sampleCount: repeatedWordError.samples, confidence: "supported", sourceTextCount: repeatedWordError.sourceTextCount,
    impact: repeatedWordError.finalErrors * 7, stability: repeatedWordError.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.9,
    title: `“${repeatedWordError.word}” is not yet reliable`,
    observation: `“${repeatedWordError.word}” accumulated ${repeatedWordError.finalErrors} committed error${repeatedWordError.finalErrors === 1 ? "" : "s"} across ${repeatedWordError.samples} recorded attempts.`,
    recommendation: `Repeat “${repeatedWordError.word}” slowly in a few short phrases, then return to normal text.`,
  });
  const fragmentPattern = [...(summary.prefixPatterns || []), ...(summary.suffixPatterns || [])]
    .filter((pattern) => pattern.confidence === "supported" && pattern.finalErrors >= 3)
    .sort((left, right) => right.finalErrors - left.finalErrors || right.samples - left.samples)[0];
  if (fragmentPattern) candidates.push({
    kind: fragmentPattern.kind, scope: fragmentPattern.fragment, sampleCount: fragmentPattern.samples, confidence: "supported", sourceTextCount: fragmentPattern.sourceTextCount,
    impact: fragmentPattern.finalErrors * 5, stability: fragmentPattern.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.8,
    title: `Words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}” need more reliable control`,
    observation: `${fragmentPattern.finalErrors} committed errors appeared across ${fragmentPattern.samples} recorded words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}”. This is a word-pattern signal, not proof that one key is the cause.`,
    recommendation: `Practice a small group of words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}” at a controlled pace.`,
  });
  if (summary.shift?.supported && summary.shift.slowdownPercent >= 30) candidates.push({
    kind: "shift", scope: "capital letters", sampleCount: summary.shift.shiftSamples, confidence: "supported", sourceTextCount: summary.shift.sourceTextCount,
    impact: summary.shift.shiftSamples * summary.shift.slowdownPercent / 12, stability: summary.shift.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.85,
    title: "Capital letters may be interrupting your rhythm",
    observation: `Capital-letter presses took ${summary.shift.slowdownPercent}% longer than lowercase presses across ${summary.shift.shiftSamples} recorded capital letters. This may be a timing pattern rather than a technique problem.`,
    recommendation: "Practice a small mixed-case phrase at an even pace, pausing only between repetitions.",
  });
  if (summary.correctedErrors >= 2) candidates.push({
    kind: "corrections", scope: "run", sampleCount: summary.correctedErrors, confidence: "run-only", impact: summary.correctedErrors * 6, stability: 1, actionability: 1,
    title: "Recovery was doing extra work",
    observation: `${summary.correctedErrors} incorrect key${summary.correctedErrors === 1 ? " was" : "s were"} removed before committing the word. Your final text recovered, but the process was less smooth.`,
    recommendation: "Slow down slightly for the next run and aim to keep process accuracy above 95%.",
  });
  if (summary.remainingErrors >= 2) candidates.push({
    kind: "remaining-errors", scope: "run", sampleCount: summary.remainingErrors, confidence: "run-only", impact: summary.remainingErrors * 5, stability: 1, actionability: 1,
    title: "A few errors remained in the text",
    observation: `${summary.remainingErrors} character${summary.remainingErrors === 1 ? " was" : "s were"} still misaligned when words were committed.`,
    recommendation: "Use the visible word feedback to correct the current word before pressing Space.",
  });
  return candidates.map((candidate) => ({
    ...candidate,
    interpretation: candidate.title,
    evidence: { sampleCount: candidate.sampleCount, scope: candidate.scope, confidence: candidate.confidence, sourceTextCount: candidate.sourceTextCount || 1 },
    practice: candidate.recommendation,
    priority: candidate.impact * candidate.stability * candidate.actionability,
  }))
    .sort((left, right) => right.priority - left.priority);
}

function choosePrimaryFeedback(bundles, previousFeedback) {
  const top = bundles[0];
  if (!top || previousFeedback?.confidence !== "supported") return top;
  const continuing = bundles.find((bundle) => bundle.kind === previousFeedback.kind && bundle.scope === previousFeedback.scope && bundle.confidence === "supported");
  return continuing && continuing.priority >= top.priority * 0.85 ? continuing : top;
}

function getCoaching(summary) {
  const primary = getFeedbackBundles(summary)[0];
  if (primary) return primary;
  return {
    title: "Collect another calm baseline",
    observation: `${summary.finalAccuracy}% final accuracy with ${summary.correctedErrors} corrected error${summary.correctedErrors === 1 ? "" : "s"} recorded, but no repeated pattern is ready to direct practice yet.`,
    recommendation: "Repeat this piece once at the same relaxed pace so the next recommendation has stronger evidence.",
  };
}

function formatBundleEvidence(bundle) {
  if (!bundle?.kind) return "";
  const confidence = bundle.confidence === "supported" ? "supported pattern" : "this run";
  const scope = bundle.scope === "run"
    ? "across the run"
    : bundle.sourceTextCount > 1
      ? `for “${bundle.scope}” across ${bundle.sourceTextCount} texts`
      : `for “${bundle.scope}”`;
  return `Evidence: ${bundle.sampleCount} example${bundle.sampleCount === 1 ? "" : "s"} ${scope} · ${confidence}`;
}

function renderSecondaryFeedback(bundles, primaryBundle = bundles[0]) {
  const secondary = bundles.filter((bundle) => bundle !== primaryBundle).slice(0, 3);
  secondaryFeedback.hidden = secondary.length === 0;
  secondaryFeedback.open = false;
  secondaryFeedbackCount.textContent = secondary.length ? `· ${secondary.length}` : "";
  secondaryFeedbackList.replaceChildren();
  secondary.forEach((bundle) => {
    const item = document.createElement("article");
    item.className = "secondary-feedback-item";
    const title = document.createElement("h4");
    title.textContent = bundle.title;
    const observation = document.createElement("p");
    observation.textContent = bundle.observation;
    const evidence = document.createElement("p");
    evidence.textContent = formatBundleEvidence(bundle);
    const recommendation = document.createElement("p");
    recommendation.className = "recommendation";
    recommendation.textContent = `Practice: ${bundle.recommendation}`;
    item.append(title, observation, evidence, recommendation);
    secondaryFeedbackList.append(item);
  });
}

function getRhythmTimeline(events) {
  let previousTimestamp = null;
  return events.flatMap((event, index) => {
    const timestamp = event.timestampMs;
    const interval = previousTimestamp === null ? null : timestamp - previousTimestamp;
    previousTimestamp = timestamp;
    if (!interval || interval <= 0) return [];
    return [{ x: Math.round(timestamp) / 1000, y: Math.round(12000 / interval), key: event.key, type: event.type, eventIndex: index }];
  });
}

function renderSessionDetails(summary) {
  const timeline = getRhythmTimeline(runEvents);
  rhythmDetailSummary.textContent = summary.pauseCount
    ? `${summary.pauseCount} pause${summary.pauseCount === 1 ? "" : "s"} over ${Math.round(summary.pauseThresholdMs / 100) / 10}s`
    : "No meaningful pauses detected";
  rhythmDetailIntro.textContent = timeline.length
    ? `Each point is the instantaneous inter-key speed. ${summary.recoverySamples ? `After ${summary.recoverySamples} error${summary.recoverySamples === 1 ? "" : "s"}, the next key took ${summary.recoveryMs} ms on average.` : "No error-recovery interval was recorded."}${summary.earlyIntervalMs && summary.lateIntervalMs ? ` The final third was ${Math.abs(summary.fatiguePercent)}% ${summary.fatiguePercent > 0 ? "slower" : "faster"} than the first.` : ""}`
    : "There were not enough separately timed key presses to draw a rhythm trace.";
  renderRhythmChart(timeline, summary);

  const labels = {
    substitution: "Substitutions", omission: "Omissions", insertion: "Insertions", transposition: "Transpositions",
    duplication: "Duplications", capitalization: "Capitalization", punctuation: "Punctuation",
  };
  const displayed = Object.entries(summary.categories).filter(([, count]) => count > 0);
  const categoryCount = displayed.reduce((sum, [, count]) => sum + count, 0);
  const total = summary.remainingErrors;
  errorDetailSummary.textContent = total ? `${total} final-text error${total === 1 ? "" : "s"}` : "No final-text errors";
  errorDetailIntro.textContent = categoryCount
    ? "Categories describe what remained when each word was committed; corrected mistakes are kept separately in the session summary."
    : "Committed text aligned cleanly. Any corrected mistakes remain visible in the headline correction count.";
  errorCategoryList.replaceChildren();
  (displayed.length ? displayed : [["clean", 0]]).forEach(([category, count]) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = category === "clean" ? "Final text" : labels[category];
    const value = document.createElement("strong");
    value.textContent = category === "clean" ? "Clean" : count;
    item.append(label, value);
    errorCategoryList.append(item);
  });
  renderTransitionDetails();
  renderWordDetails();
  renderProgressDetail(summary);
}

function getProgressStateFromMeasurements(measurements) {
  const normalized = measurements.map((measurement) => ({
    ...measurement,
    completedAt: typeof measurement.completedAt === "number" ? measurement.completedAt : Date.parse(measurement.completedAt),
  })).filter((measurement) => Number.isFinite(measurement.completedAt) && Number.isFinite(measurement.speed)).sort((left, right) => left.completedAt - right.completedAt);
  const average = (items, key) => items.reduce((sum, item) => sum + item[key], 0) / items.length;
  const sourceTextIds = [...new Set(normalized.map((measurement) => measurement.textId).filter(Boolean))];
  const base = { sampleCount: normalized.length, sourceTextIds, derivationVersion: feedbackDerivationVersion };
  if (normalized.length < progressWindowSize * 2) return { state: "learning", ...base };
  const baseline = normalized.slice(0, progressWindowSize);
  const improvement = normalized.slice(progressWindowSize, progressWindowSize * 2);
  const baselineSpeed = average(baseline, "speed");
  const improvementSpeed = average(improvement, "speed");
  const improved = improvementSpeed >= baselineSpeed * 1.08;
  if (!improved) return { state: "learning", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
  if (normalized.length < progressWindowSize * 3) return { state: "recent-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
  const followUp = normalized.slice(-progressWindowSize);
  const followUpSpeed = average(followUp, "speed");
  const spaced = followUp[0].completedAt - improvement.at(-1).completedAt >= retainedImprovementSpacingMs;
  if (spaced && followUpSpeed >= baselineSpeed * 1.08) return { state: "retained-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(followUpSpeed) };
  if (spaced && followUpSpeed < baselineSpeed * 0.95) return { state: "needs-refresh", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(followUpSpeed) };
  return { state: "recent-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
}

function getProgressState(records) {
  return getProgressStateFromMeasurements(records.map((record) => ({
    completedAt: record.completedAt,
    speed: record.summary?.effectiveWordsPerMinute ?? record.effectiveWordsPerMinute ?? record.wordsPerMinute,
    accuracy: record.summary?.finalAccuracy ?? record.finalAccuracy ?? record.accuracy,
    textId: record.textId,
  })));
}

function getPatternProgressState(records, pattern, ngramLength = 2) {
  const measurements = records.flatMap((record) => {
    const transition = getRunTransitions(record.events || [], ngramLength).find((entry) => entry.pair === pattern);
    return transition ? [{ completedAt: record.completedAt, speed: transition.speed, textId: record.textId, occurrences: transition.samples }] : [];
  });
  const state = getProgressStateFromMeasurements(measurements);
  return { ...state, pattern, occurrences: measurements.reduce((total, measurement) => total + measurement.occurrences, 0) };
}

function getFluencyProgressState(records) {
  const measurements = records.flatMap((record) => {
    const fluency = record.summary;
    if (!fluency?.earlyIntervalMs || !fluency?.lateIntervalMs || !Number.isFinite(fluency.fatiguePercent)) return [];
    return [{ completedAt: record.completedAt, textId: record.textId, speed: Math.max(0, 100 - Math.abs(fluency.fatiguePercent)) }];
  });
  return getProgressStateFromMeasurements(measurements);
}

function renderProgressDetail(currentSummary = null) {
  const records = (analysisStore.texts[activeText.id]?.runs || []).map((run) => ({ ...run, textId: activeText.id }));
  if (currentSummary) records.push({ completedAt: new Date().toISOString(), summary: currentSummary, textId: activeText.id });
  const progress = getProgressState(records);
  const stateLabels = { learning: "no clear change yet", "recent-improvement": "recent improvement", "retained-improvement": "improvement holding", "needs-refresh": "worth refreshing" };
  const stateLabel = stateLabels[progress.state];
  progressDetailSummary.textContent = `${progress.sampleCount} run${progress.sampleCount === 1 ? "" : "s"} · ${stateLabel}`;
  if (progress.state === "recent-improvement") {
    progressDetailIntro.textContent = `Recent raw speed is ${progress.recentSpeed} WPM versus an earlier ${progress.baselineSpeed} WPM window for this text. This is a supported recent improvement; check again after a week before treating it as retained.`;
  } else if (progress.state === "retained-improvement") {
    progressDetailIntro.textContent = `Recent raw speed is ${progress.recentSpeed} WPM versus an earlier ${progress.baselineSpeed} WPM window for this text, and the gain reappeared after at least a week. This improvement looks retained.`;
  } else if (progress.state === "needs-refresh") {
    progressDetailIntro.textContent = `A formerly stronger ${progress.baselineSpeed} WPM window is now followed by ${progress.recentSpeed} WPM after a spaced check. Treat this as a cue to refresh the skill, not a verdict on one bad run.`;
  } else {
    progressDetailIntro.textContent = progress.sampleCount < progressWindowSize * 2
      ? "Complete more runs of this same piece before the app makes a progress claim. Raw per-text history remains available without mixing passage difficulty."
      : `The recent ${progress.recentSpeed} WPM window does not yet show a reliable improvement over the earlier ${progress.baselineSpeed} WPM window.`;
  }
  const primaryTransition = currentSummary?.transitions?.find((transition) => transition.confidence === "supported");
  if (primaryTransition) {
    const patternRecords = [...getStoredAnalysisRecords(), { completedAt: new Date().toISOString(), events: runEvents, textId: activeText.id }];
    const patternProgress = getPatternProgressState(patternRecords, primaryTransition.pair);
    if (patternProgress.state === "recent-improvement" || patternProgress.state === "retained-improvement") {
      progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, ${patternProgress.state === "retained-improvement" ? "the faster pattern also held after a spaced follow-up" : "the faster pattern is recent and still needs a spaced follow-up"}.`;
    } else if (patternProgress.state === "needs-refresh") {
      progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, a later spaced check suggests the pattern needs a refresh.`;
    } else if (patternProgress.sampleCount < progressWindowSize * 2) {
      progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, there are not yet enough event-recorded runs to make a progress claim.`;
    }
  }
  const fluencyProgress = getFluencyProgressState(records);
  if (fluencyProgress.state === "recent-improvement" || fluencyProgress.state === "retained-improvement") {
    progressDetailIntro.textContent += ` Your first-to-last-third pacing is ${fluencyProgress.state === "retained-improvement" ? "steadier across a spaced follow-up" : "recently steadier; check again after a week"}.`;
  } else if (fluencyProgress.state === "needs-refresh") {
    progressDetailIntro.textContent += " Your first-to-last-third pacing has become less even in a spaced follow-up, so a short controlled repeat may help.";
  }
}

function appendDetailItem(list, labelText, valueText) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  const value = document.createElement("strong");
  label.textContent = labelText;
  value.textContent = valueText;
  item.append(label, value);
  list.append(item);
}

function getRunTransitions(events, ngramLength = 2) {
  const transitions = new Map();
  let previous = null;
  let sequence = [];
  events.forEach((event) => {
    const matchesExpected = event.type === "character" && event.expectedCharacter !== null && event.key === event.expectedCharacter;
    if (!matchesExpected) { previous = null; sequence = []; return; }
    if (!previous || event.wordIndex !== previous.wordIndex || event.bufferOffset !== previous.bufferOffset + 1) sequence = [event];
    else sequence.push(event);
    if (sequence.length >= ngramLength) {
      const ngram = sequence.slice(-ngramLength);
      const interval = (ngram.at(-1).timestampMs - ngram[0].timestampMs) / (ngramLength - 1);
      if (interval > 0) {
        const pair = ngram.map((item) => item.key).join("");
        const current = transitions.get(pair) || { pair, samples: 0, totalIntervalMs: 0 };
        current.samples += 1;
        current.totalIntervalMs += interval;
        transitions.set(pair, current);
      }
    }
    previous = event;
  });
  return [...transitions.values()].map((transition) => ({
    ...transition,
    averageIntervalMs: Math.round(transition.totalIntervalMs / transition.samples),
    speed: Math.round(12000 / (transition.totalIntervalMs / transition.samples)),
  })).sort((left, right) => right.averageIntervalMs - left.averageIntervalMs);
}

function getTransitionAggregate(records, ngramLength = 2) {
  const aggregate = new Map();
  records.forEach((record) => {
    getRunTransitions(record.events || [], ngramLength).forEach((transition) => {
      const current = aggregate.get(transition.pair) || { pair: transition.pair, samples: 0, totalIntervalMs: 0, textIds: new Set() };
      current.samples += transition.samples;
      current.totalIntervalMs += transition.totalIntervalMs;
      if (record.textId) current.textIds.add(record.textId);
      aggregate.set(transition.pair, current);
    });
  });
  const rows = [...aggregate.values()].map((transition) => {
    const { textIds, ...values } = transition;
    return {
      ...values,
      sourceTextCount: textIds.size,
      averageIntervalMs: Math.round(transition.totalIntervalMs / transition.samples),
      speed: Math.round(12000 / (transition.totalIntervalMs / transition.samples)),
    };
  });
  const baseline = rows.reduce((total, row) => total + row.totalIntervalMs, 0) / rows.reduce((total, row) => total + row.samples, 0);
  return rows.map((row) => ({
    ...row,
    slowdownPercent: Number.isFinite(baseline) ? Math.round(((row.averageIntervalMs / baseline) - 1) * 100) : 0,
    confidence: row.samples >= minimumTransitionSamples ? "supported" : "learning",
  })).sort((left, right) => right.averageIntervalMs - left.averageIntervalMs);
}

function getCharacterAggregate(records) {
  const aggregate = new Map();
  records.forEach((record) => {
    let previousTimestamp = null;
    (record.events || []).forEach((event) => {
      const interval = previousTimestamp === null ? null : event.timestampMs - previousTimestamp;
      previousTimestamp = event.timestampMs;
      if (event.type !== "character" || event.expectedCharacter === null) return;
      const current = aggregate.get(event.expectedCharacter) || { character: event.expectedCharacter, attempts: 0, correct: 0, totalIntervalMs: 0, intervalSamples: 0, substitutions: {}, textIds: new Set() };
      current.attempts += 1;
      if (record.textId) current.textIds.add(record.textId);
      if (event.key === event.expectedCharacter) current.correct += 1;
      else current.substitutions[event.key] = (current.substitutions[event.key] || 0) + 1;
      if (interval > 0) { current.totalIntervalMs += interval; current.intervalSamples += 1; }
      aggregate.set(event.expectedCharacter, current);
    });
  });
  return [...aggregate.values()].map((entry) => {
    const { textIds, ...values } = entry;
    return {
      ...values,
      sourceTextCount: textIds.size,
      accuracy: Math.round((entry.correct / entry.attempts) * 100),
      speed: entry.intervalSamples ? Math.round(12000 / (entry.totalIntervalMs / entry.intervalSamples)) : null,
      confidence: entry.attempts >= minimumTransitionSamples ? "supported" : "learning",
      commonSubstitution: Object.entries(entry.substitutions).sort((left, right) => right[1] - left[1])[0]?.[0] || null,
    };
  }).sort((left, right) => left.accuracy - right.accuracy || (left.speed || Infinity) - (right.speed || Infinity));
}

function getShiftMetrics(records) {
  const shiftIntervals = []; const lowerIntervals = [];
  const textIds = new Set();
  records.forEach((record) => {
    let previous = null;
    (record.events || []).forEach((event) => {
      const interval = previous ? event.timestampMs - previous.timestampMs : 0;
      if (event.type === "character" && event.expectedCharacter && interval > 0) {
        if (event.modifiers?.shift) { shiftIntervals.push(interval); if (record.textId) textIds.add(record.textId); }
        else if (event.expectedCharacter === event.expectedCharacter.toLowerCase()) { lowerIntervals.push(interval); if (record.textId) textIds.add(record.textId); }
      }
      previous = event;
    });
  });
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const shift = average(shiftIntervals); const lower = average(lowerIntervals);
  return { shiftSamples: shiftIntervals.length, lowerSamples: lowerIntervals.length, sourceTextCount: textIds.size, slowdownPercent: shift && lower ? Math.round(((shift / lower) - 1) * 100) : 0, supported: shiftIntervals.length >= minimumTechniqueSamples && lowerIntervals.length >= minimumTechniqueSamples };
}

function renderTransitionDetails() {
  const previousRecords = analysisStore.texts[activeText.id]?.runs || [];
  const records = [...previousRecords, { events: runEvents }];
  const transitions = getTransitionAggregate(records);
  const characters = getCharacterAggregate(records);
  const shift = getShiftMetrics(records);
  const supported = transitions.filter((transition) => transition.confidence === "supported");
  transitionDetailSummary.textContent = transitions.length
    ? `${transitions.length} key-to-key movement${transitions.length === 1 ? "" : "s"} · ${supported.length ? `${supported.length} recurring pattern${supported.length === 1 ? "" : "s"}` : "still collecting examples"}`
    : "No timed key-to-key movements yet";
  transitionDetailIntro.textContent = transitions.length
    ? supported.length
      ? `Supported patterns have at least ${minimumTransitionSamples} samples across recent runs for this text. Slowdown is relative to your other recorded transitions.`
      : `These observations need ${minimumTransitionSamples} samples per transition before they become supported practice advice.`
    : "Type at least two correctly aligned letters with distinct timing to start building transition evidence.";
  transitionList.replaceChildren();
  const rows = transitions.slice(0, 3).map((transition) => ({ kind: "transition", ...transition })).concat(characters.slice(0, 2).map((character) => ({ kind: "character", ...character })));
  (rows.length ? rows : [{ pair: "—", samples: 0 }]).forEach((transition) => {
    if (transition.kind === "character") {
      const confidence = transition.confidence === "supported" ? "Supported" : `Learning · ${transition.attempts}/${minimumTransitionSamples}`;
      const substitution = transition.commonSubstitution ? ` · often “${transition.commonSubstitution}”` : "";
      appendDetailItem(transitionList, `Key “${transition.character}” · ${transition.attempts} attempts`, `${transition.accuracy}% process accuracy${transition.speed ? ` · ${transition.speed} WPM` : ""}${substitution} · ${confidence}`);
      return;
    }
    const confidence = transition.confidence === "supported" ? "Supported" : `Learning · ${transition.samples}/${minimumTransitionSamples}`;
    appendDetailItem(transitionList, transition.samples ? `“${transition.pair}” · ${transition.samples} sample${transition.samples === 1 ? "" : "s"}` : "No timed transition", transition.samples ? `${transition.speed} WPM · ${confidence}` : "Learning");
  });
  if (shift.shiftSamples || shift.lowerSamples) appendDetailItem(transitionList, `Shift combinations · ${shift.shiftSamples} sample${shift.shiftSamples === 1 ? "" : "s"}`, shift.supported ? `${shift.slowdownPercent}% ${shift.slowdownPercent > 0 ? "slower" : "faster"} than lowercase · Supported` : `Learning · ${shift.shiftSamples}/${minimumTechniqueSamples} Shift samples`);
}

function renderWordDetails() {
  const currentRecord = { events: runEvents, words: completedWordAnalyses };
  const summaries = getWordAggregate([...(analysisStore.texts[activeText.id]?.runs || []), currentRecord]);
  const affected = summaries.filter((word) => word.finalErrors || word.durationPerCharacter > 0);
  wordDetailSummary.textContent = affected.length ? `${affected.length} word observation${affected.length === 1 ? "" : "s"} · ${affected.some((word) => word.confidence === "supported") ? "some patterns repeat" : "still collecting examples"}` : "No completed words to compare";
  wordDetailIntro.textContent = affected.length
    ? `Word timing is normalized by length. Repeated words need ${minimumWordSamples} observations before they are treated as supported patterns.`
    : "Commit a word to see its final alignment and timing here.";
  wordList.replaceChildren();
  (affected.slice(0, 4).length ? affected.slice(0, 4) : [{ word: "—", finalErrors: 0, durationPerCharacter: 0 }]).forEach((word) => {
    const detail = word.word === "—" ? "Learning" : [word.finalErrors ? `${word.finalErrors} error${word.finalErrors === 1 ? "" : "s"}` : "Clean", word.durationPerCharacter ? `${word.durationPerCharacter} ms/char` : null, `${word.confidence === "supported" ? "Supported" : `Learning · ${word.samples}/${minimumWordSamples}`}`].filter(Boolean).join(" · ");
    appendDetailItem(wordList, word.word === "—" ? "No completed word" : `“${word.word}”`, detail);
  });
}

function getWordAggregate(records) {
  const wordsByText = new Map();
  records.forEach((record) => (record.words || []).forEach((analysis) => {
    const sourceEvents = record.events || [];
    const relevantEvents = sourceEvents.filter((event) => event.wordIndex === analysis.wordIndex);
    const timestamps = relevantEvents.map((event) => event.timestampMs);
    const duration = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
    const finalErrors = [...analysis.expected].length - analysis.finalCorrect + analysis.categories.insertion;
    const current = wordsByText.get(analysis.expected) || { word: analysis.expected, samples: 0, finalErrors: 0, totalDurationPerCharacter: 0, timedSamples: 0, textIds: new Set() };
    current.samples += 1; current.finalErrors += finalErrors;
    if (record.textId) current.textIds.add(record.textId);
    if (duration > 0) { current.totalDurationPerCharacter += duration / Math.max(1, [...analysis.expected].length); current.timedSamples += 1; }
    wordsByText.set(analysis.expected, current);
  }));
  return [...wordsByText.values()].map((word) => {
    const { textIds, ...values } = word;
    return { ...values, sourceTextCount: textIds.size, durationPerCharacter: word.timedSamples ? Math.round(word.totalDurationPerCharacter / word.timedSamples) : 0, confidence: word.samples >= minimumWordSamples ? "supported" : "learning" };
  }).sort((left, right) => right.finalErrors - left.finalErrors || right.durationPerCharacter - left.durationPerCharacter);
}

function getWordFragmentAggregate(records, kind) {
  const fragments = new Map();
  records.forEach((record) => (record.words || []).forEach((analysis) => {
    const characters = [...analysis.expected];
    if (characters.length < 3) return;
    const fragment = kind === "prefix" ? characters.slice(0, 3).join("") : characters.slice(-3).join("");
    const finalErrors = characters.length - analysis.finalCorrect + analysis.categories.insertion;
    const current = fragments.get(fragment) || { kind, fragment, samples: 0, finalErrors: 0, textIds: new Set() };
    current.samples += 1;
    current.finalErrors += finalErrors;
    if (record.textId) current.textIds.add(record.textId);
    fragments.set(fragment, current);
  }));
  return [...fragments.values()].map((pattern) => {
    const { textIds, ...values } = pattern;
    return { ...values, sourceTextCount: textIds.size, confidence: pattern.samples >= minimumWordSamples ? "supported" : "learning" };
  }).sort((left, right) => right.finalErrors - left.finalErrors || right.samples - left.samples);
}

function renderRhythmChart(timeline, summary) {
  if (!window.Chart || !rhythmChartCanvas) return;
  const data = {
    datasets: [{
      label: "Inter-key speed", data: timeline, parsing: false, showLine: true, tension: 0.2,
      borderColor: "#0f766e", pointBackgroundColor: timeline.map((point) => point.y <= 12000 / summary.pauseThresholdMs ? "#c62828" : "#0f766e"), pointRadius: 3,
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
  if (rhythmChart) { rhythmChart.data = data; rhythmChart.options = options; rhythmChart.update(); return; }
  rhythmChart = new Chart(rhythmChartCanvas, { type: "line", data, options });
}

function updateStats() {
  const metrics = getMetrics();
  const consistency = getRunConsistency(runKeyIntervals);
  speedValue.textContent = metrics.wordsPerMinute;
  accuracyValue.textContent = metrics.accuracy;
  consistencyValue.textContent = consistency;
  scoreValue.textContent = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
  updateTimerProgress();
}

function updateTimerProgress() {
  const runLength = getActiveRunLengthSeconds();
  const elapsedSeconds = runLength - secondsLeft;
  const elapsedPercent = Math.max(0, Math.min(100, (elapsedSeconds / runLength) * 100));
  timerProgressFill.style.setProperty("--progress-width", `${elapsedPercent}%`);
  timerProgress.setAttribute("aria-valuemax", String(runLength));
  timerProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
}

function finishRun() {
  if (finished) return;
  if (currentWordIndex < words.length) commitCurrentWord(getNow(), false);
  finished = true;
  presentationUpdateScheduled = false;
  focusRestartOnNextTab = true;
  clearInterval(timerId);
  timerId = null;
  const metrics = getMetrics();
  const consistency = getRunConsistency(runKeyIntervals);
  const typingScore = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
  const sessionAnalysis = getSessionAnalysis();
  runAnnotations = deriveRunAnnotations(sessionAnalysis);
  activeRunAnnotationId = null;
  const feedbackBundles = getFeedbackBundles(sessionAnalysis);
  const previousFeedback = analysisStore.texts[activeText.id]?.runs?.at(-1)?.primaryFeedback;
  const coaching = choosePrimaryFeedback(feedbackBundles, previousFeedback) || getCoaching(sessionAnalysis);
  resultPanel.hidden = false;
  finalSpeed.textContent = sessionAnalysis.effectiveWordsPerMinute;
  finalAccuracy.textContent = sessionAnalysis.finalAccuracy;
  if (finalScore) finalScore.textContent = typingScore;
  grossSpeed.textContent = sessionAnalysis.grossWordsPerMinute;
  effectiveSpeed.textContent = sessionAnalysis.effectiveWordsPerMinute;
  finalAccuracyDetail.textContent = sessionAnalysis.finalAccuracy;
  processAccuracy.textContent = sessionAnalysis.processAccuracy;
  correctionSummary.textContent = `${sessionAnalysis.correctedErrors} corrected · ${sessionAnalysis.remainingErrors} left`;
  completionTime.textContent = formatDuration(sessionAnalysis.completionMs);
  pauseSummary.textContent = sessionAnalysis.pauseCount
    ? `${sessionAnalysis.pauseCount} · ${formatDuration(sessionAnalysis.pauseDurationMs)}`
    : "None";
  finalConsistency.textContent = consistency;
  runObservation.previousElementSibling.textContent = coaching.title;
  runObservation.textContent = coaching.observation;
  const evidence = formatBundleEvidence(coaching);
  runEvidence.hidden = !evidence;
  runEvidence.textContent = evidence;
  runRecommendation.textContent = `Practice: ${coaching.recommendation}`;
  renderSecondaryFeedback(feedbackBundles, coaching);
  typingInput.disabled = true;
  textSelect.disabled = false;
  testView.hidden = true;
  resultsView.hidden = false;
  renderPrompt();
  renderRunNotes();
  renderSessionDetails(sessionAnalysis);
  renderLastRunResults(getSmoothedRunIntervals());
  commitRun(metrics, consistency, typingScore, getSmoothedRunIntervals(), sessionAnalysis, coaching);
  updateStats();
  const afterLayout = window.requestAnimationFrame ?? ((callback) => callback());
  afterLayout(() => {
    progressChart?.resize?.();
    resultTitle.focus();
  });
}

function commitRun(metrics, consistency, typingScore, smoothedIntervals, sessionAnalysis, primaryFeedback) {
  const stats = getTextStats();
  runPromptAttempts.forEach((index) => {
    const character = stats.characters[index];
    if (!character) return;
    character.attempts += 1;
    if (runMistakes.has(index)) character.mistakes += 1;
  });
  smoothedIntervals.forEach((intervalMs, index) => {
    const character = stats.characters[index];
    if (!character || intervalMs <= 0) return;
    character.intervalSamples += 1;
    character.totalIntervalMs += intervalMs;
  });
  stats.runs += 1;
  statsStore.texts[activeText.id] = stats;
  const difficulty = getTextDifficulty(activeText);
  const completedAt = new Date().toISOString();
  runsStore.runs.push({ textId: activeText.id, completedAt, wordsPerMinute: metrics.wordsPerMinute, accuracy: metrics.accuracy, consistency, typingScore, difficulty, approximateNormalizedWpm: Math.round(sessionAnalysis.effectiveWordsPerMinute / difficulty) });
  const analysisText = analysisStore.texts[activeText.id] || { runs: [] };
  const detailedRun = {
    completedAt,
    summary: sessionAnalysis,
    events: runEvents,
    words: completedWordAnalyses,
    derivationVersion: feedbackDerivationVersion,
    primaryFeedback: primaryFeedback?.kind ? { kind: primaryFeedback.kind, scope: primaryFeedback.scope, confidence: primaryFeedback.confidence, priority: primaryFeedback.priority, derivationVersion: feedbackDerivationVersion } : null,
  };
  detailedRun.progressState = getProgressState([...analysisText.runs, detailedRun].map((run) => ({ ...run, textId: activeText.id })));
  analysisText.runs.push(detailedRun);
  analysisText.runs = analysisText.runs.slice(-maxDetailedRunsPerText);
  analysisStore.texts[activeText.id] = analysisText;
  saveStores();
  renderHeatmap();
  renderSpeedChart();
  renderProgressChart();
  renderTradeoffChart();
}

function getSmoothedRunIntervals() {
  const result = new Map();
  [...runIntervals.entries()].sort(([a], [b]) => a - b).forEach(([index]) => {
    const start = Math.max(0, index - speedSmoothingPreviousLetters);
    const samples = [];
    for (let position = start; position <= index; position += 1) {
      if (runIntervals.has(position)) samples.push(runIntervals.get(position));
    }
    if (samples.length) result.set(index, samples.reduce((total, value) => total + value, 0) / samples.length);
  });
  return result;
}

function hasEnoughCoverage(character, stats = getTextStats()) {
  return Boolean(stats.runs && character && character.attempts / stats.runs >= minimumCoverageRatio);
}

function getCoverageTitle(index, stats = getTextStats()) {
  const character = stats.characters[index];
  if (!character || character.attempts === 0) return "No runs recorded for this character";
  return `${character.attempts}/${stats.runs} runs recorded; needs ${Math.ceil(stats.runs * minimumCoverageRatio)} for heatmap`;
}

function getCharacterAccuracy(index, stats = getTextStats()) {
  const character = stats.characters[index];
  if (!hasEnoughCoverage(character, stats)) return null;
  return Math.round(((character.attempts - character.mistakes) / character.attempts) * 100);
}

function getHeatmapColor(accuracy, lowestAccuracy, highestAccuracy) {
  if (highestAccuracy <= lowestAccuracy) return "hsl(120 68% 72%)";
  const normalized = (accuracy - lowestAccuracy) / (highestAccuracy - lowestAccuracy);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

function renderHeatmap() {
  const stats = getTextStats();
  heatmapDisplay.replaceChildren();
  heatmapRuns.textContent = stats.runs;
  const accuracies = stats.characters.map((_, index) => getCharacterAccuracy(index, stats)).filter((value) => value !== null);
  const lowestAccuracy = accuracies.length ? Math.min(...accuracies) : null;
  const highestAccuracy = accuracies.length ? Math.max(...accuracies) : null;
  accuracyLegendLowest.textContent = lowestAccuracy === null ? "—" : `${lowestAccuracy}%`;
  accuracyLegendHighest.textContent = highestAccuracy === null ? "—" : `${highestAccuracy}%`;
  [...activeText.body].forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = character;
    const accuracy = getCharacterAccuracy(index, stats);
    if (accuracy === null) {
      span.classList.add("untracked");
      span.title = getCoverageTitle(index, stats);
    } else {
      span.style.backgroundColor = getHeatmapColor(
        accuracy,
        lowestAccuracy,
        highestAccuracy,
      );
      span.title = `${accuracy}% accuracy across ${stats.characters[index].attempts} attempts`;
    }
    heatmapDisplay.append(span);
  });
}

function getAverageLetterWpm(index, stats = getTextStats()) {
  const character = stats.characters[index];
  if (!hasEnoughCoverage(character, stats) || character.intervalSamples === 0 || character.totalIntervalMs <= 0) return null;
  return Math.round(12000 / (character.totalIntervalMs / character.intervalSamples));
}

function getSpeedColor(speed, lowestSpeed, highestSpeed) {
  const normalized = highestSpeed <= lowestSpeed ? 1 : (speed - lowestSpeed) / (highestSpeed - lowestSpeed);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

function renderSpeedChart() {
  const stats = getTextStats();
  speedChart.replaceChildren();
  const speeds = stats.characters.map((_, index) => getAverageLetterWpm(index, stats));
  const recorded = speeds.filter((speed) => speed !== null);
  const lowest = recorded.length ? Math.min(...recorded) : null;
  const highest = recorded.length ? Math.max(...recorded) : null;
  speedLegendLowest.textContent = lowest === null ? "—" : `${lowest} WPM`;
  speedLegendHighest.textContent = highest === null ? "—" : `${highest} WPM`;
  [...activeText.body].forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = character;
    const speed = speeds[index];
    if (speed === null) {
      span.classList.add("untracked");
      span.title = `${character === " " ? "space" : character}: ${getCoverageTitle(index, stats)}`;
    } else {
      span.style.backgroundColor = getSpeedColor(speed, lowest, highest);
      span.title = `${character === " " ? "space" : character}: ${speed} WPM average`;
    }
    speedChart.append(span);
  });
}

function getScopedRuns() {
  return settings.chartScope === "all" ? runsStore.runs : runsStore.runs.filter((run) => run.textId === activeText.id);
}

function getRunLabel(run) {
  return textById.get(run.textId)?.title || run.textId;
}

function formatChartTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderProgressChart() {
  if (!window.Chart || !progressChartCanvas) return;
  const runs = getScopedRuns();
  const datasets = [
      { label: "Speed (WPM)", data: runs.map((run, index) => ({ x: index + 1, y: run.wordsPerMinute, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#0f766e", tension: 0.25, parsing: false, hidden: true, yAxisID: "wpm" },
      { label: "Accuracy (%)", data: runs.map((run, index) => ({ x: index + 1, y: run.accuracy, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#15803d", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
      { label: "Consistency (%)", data: runs.map((run, index) => ({ x: index + 1, y: run.consistency, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#c62828", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
      { label: "Typing score", data: runs.map((run, index) => ({ x: index + 1, y: run.typingScore, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#7c3aed", tension: 0.25, parsing: false, yAxisID: "score" },
    ];
  if (settings.chartScope === "all") datasets.push({ label: "Approx. normalized WPM", data: runs.filter((run) => Number.isFinite(run.approximateNormalizedWpm)).map((run) => ({ x: runs.indexOf(run) + 1, y: run.approximateNormalizedWpm, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#b45309", borderDash: [5, 4], tension: 0.25, parsing: false, hidden: true, yAxisID: "wpm" });
  const chartData = { datasets };
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
  if (progressChart) { progressChart.data = chartData; progressChart.options = options; progressChart.update(); return; }
  progressChart = new Chart(progressChartCanvas, { type: "line", data: chartData, options });
}

function getPaddedBounds(values, hardMin = null, hardMax = null) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: hardMin ?? 0, max: hardMax ?? 100 };
  const minValue = Math.min(...finite); const maxValue = Math.max(...finite);
  const padding = Math.max(1, (maxValue - minValue) * 0.12 || maxValue * 0.1);
  const min = hardMin === null ? minValue - padding : Math.max(hardMin, minValue - padding);
  const max = hardMax === null ? maxValue + padding : Math.min(hardMax, maxValue + padding);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}

function renderTradeoffChart() {
  if (!window.Chart || !tradeoffChartCanvas) return;
  const runs = getScopedRuns();
  const newest = runs.length - 1;
  const speedBounds = getPaddedBounds(runs.map((run) => run.wordsPerMinute));
  const consistencyBounds = getPaddedBounds(runs.map((run) => run.consistency), 0, 100);
  const chartData = { datasets: [{ label: settings.chartScope === "all" ? "All texts" : activeText.title, data: runs.map((run, index) => ({ x: run.wordsPerMinute, y: run.consistency, testNumber: index + 1, completedAt: run.completedAt, accuracy: run.accuracy, typingScore: run.typingScore, textTitle: getRunLabel(run) })), borderColor: "rgba(97,112,128,.45)", borderWidth: 2, pointBackgroundColor: runs.map((_, index) => index === newest ? "#f3c74f" : "#0f766e"), pointRadius: runs.map((_, index) => index === newest ? 8 : 5), showLine: true, tension: 0.2 }] };
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      title(items) { const raw = items[0]?.raw; return raw ? `Test ${raw.testNumber} · ${raw.textTitle}` : ""; },
      label(item) { return [`Speed: ${item.raw.x} WPM`, `Consistency: ${item.raw.y}%`, `Accuracy: ${item.raw.accuracy}%`, `Score: ${item.raw.typingScore}`]; },
      afterLabel(item) { return formatChartTimestamp(new Date(item.raw.completedAt).getTime()); },
    } } },
    scales: { x: { type: "linear", min: speedBounds.min, max: speedBounds.max, title: { display: true, text: "Typing speed (WPM)" } }, y: { min: consistencyBounds.min, max: consistencyBounds.max, title: { display: true, text: "Consistency (%)" } } },
  };
  if (tradeoffChart) { tradeoffChart.data = chartData; tradeoffChart.options = options; tradeoffChart.update(); return; }
  tradeoffChart = new Chart(tradeoffChartCanvas, { type: "scatter", data: chartData, options });
}

function getRunSpeedData(intervals) {
  return [...activeText.body].map((character, index) => ({ char: character, index, speed: intervals.has(index) ? Math.round(12000 / intervals.get(index)) : null }));
}

function renderLastRunResults(smoothedIntervals) {
  lastRunSpeeds = getRunSpeedData(smoothedIntervals);
  lastRunHistogramBins = getSpeedHistogramBins(lastRunSpeeds);
  renderLastRunHeatmap();
  renderLastRunHistogram();
}

function getSpeedHistogramBins(samples) {
  const speeds = samples.map((sample) => sample.speed).filter((speed) => speed !== null);
  if (!speeds.length) return [];
  const low = Math.min(...speeds); const high = Math.max(...speeds);
  if (low === high) return [{ min: low, max: high, count: speeds.length }];
  const count = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(speeds.length))));
  const size = (high - low) / count;
  const bins = Array.from({ length: count }, (_, index) => ({ min: low + index * size, max: index === count - 1 ? high : low + (index + 1) * size, count: 0 }));
  speeds.forEach((speed) => bins[Math.min(bins.length - 1, Math.floor((speed - low) / size))].count += 1);
  return bins;
}

function isSpeedInBin(speed, bin) {
  const last = bin === lastRunHistogramBins.at(-1);
  return last ? speed >= bin.min && speed <= bin.max : speed >= bin.min && speed < bin.max;
}

function formatSpeedRange(bin) { return bin.min === bin.max ? String(Math.round(bin.min)) : `${Math.round(bin.min)}-${Math.round(bin.max)}`; }

function renderLastRunHeatmap(activeBinIndex = null) {
  lastRunHeatmap.replaceChildren();
  const speeds = lastRunSpeeds.map((sample) => sample.speed).filter((speed) => speed !== null);
  const low = Math.min(...speeds, 0); const high = Math.max(...speeds, 1);
  const activeBin = activeBinIndex === null ? null : lastRunHistogramBins[activeBinIndex];
  lastRunSpeeds.forEach((sample) => {
    const span = document.createElement("span"); span.className = "heatmap-char"; span.textContent = sample.char;
    if (sample.speed === null) { span.classList.add("untracked"); span.title = `${sample.char === " " ? "space" : sample.char}: no speed data`; }
    else if (activeBin && !isSpeedInBin(sample.speed, activeBin)) { span.classList.add("untracked"); span.title = `${sample.char}: ${sample.speed} WPM`; }
    else { span.style.backgroundColor = getSpeedColor(sample.speed, low, high); span.title = `${sample.char}: ${sample.speed} WPM`; }
    lastRunHeatmap.append(span);
  });
}

function renderLastRunHistogram() {
  if (!window.Chart || !lastRunHistogramCanvas) return;
  const data = { labels: lastRunHistogramBins.map(formatSpeedRange), datasets: [{ label: "Letters", data: lastRunHistogramBins.map((bin) => bin.count), backgroundColor: "rgba(15,118,110,.72)", borderColor: "#0f766e", borderWidth: 1 }] };
  const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title(items) { return `${formatSpeedRange(lastRunHistogramBins[items[0].dataIndex])} WPM`; }, label(item) { return `${item.parsed.y} letters`; } } } }, scales: { x: { title: { display: true, text: "Letter speed range (WPM)" } }, y: { beginAtZero: true, title: { display: true, text: "Letters" } } }, onHover(event, elements) { renderLastRunHeatmap(elements.length ? elements[0].index : null); } };
  if (lastRunHistogram) { lastRunHistogram.data = data; lastRunHistogram.update(); return; }
  lastRunHistogram = new Chart(lastRunHistogramCanvas, { type: "bar", data, options });
}

function resetRun({ chooseRandom = settings.selectedText === "random" } = {}) {
  if (chooseRandom) activeText = resolveText("random");
  words = getWords(activeText.body);
  started = false; finished = false; secondsLeft = getActiveRunLengthSeconds();
  focusRestartOnNextTab = false;
  presentationUpdateScheduled = false;
  clearInterval(timerId); timerId = null;
  currentWordIndex = 0; currentWordBuffer = ""; currentWordKeys = []; currentWordLastKeyTimes = new Map(); currentWordMistakeOffsets = new Set(); currentWordDeletedExtraErrors = 0; committedWords = [];
  runPromptAttempts = new Set(); runMistakes = new Set(); runIntervals = new Map(); runExpectedAttempts = 0; runCorrectCharacters = 0; runMistakeCount = 0; runExtraErrors = 0; previousMatchedTime = null; previousKeyTime = null; runKeyIntervals = [];
  runEvents = []; completedWordAnalyses = []; runPrintableKeyCount = 0; runCommittedSpaces = 0; runProcessErrors = 0; runCorrectedErrors = 0; runStartTimestamp = null;
  runAnnotations = []; activeRunAnnotationId = null;
  typingInput.value = ""; typingInput.disabled = false; textSelect.disabled = false;
  speedValue.textContent = "0"; accuracyValue.textContent = "100"; consistencyValue.textContent = "100"; scoreValue.textContent = "100";
  testView.hidden = false; resultsView.hidden = true; resultPanel.hidden = true; lastRunSpeeds = []; lastRunHistogramBins = []; lastRunHeatmap.replaceChildren();
  setResultAnalysisTab("rhythm");
  runNotes.hidden = true; runNoteList.replaceChildren(); runNoteDescription.hidden = true; runNoteDescription.textContent = "";
  secondaryFeedback.hidden = true; secondaryFeedback.open = false; secondaryFeedbackCount.textContent = ""; secondaryFeedbackList.replaceChildren();
  rhythmChart?.destroy?.(); rhythmChart = null; errorCategoryList.replaceChildren(); transitionList.replaceChildren(); wordList.replaceChildren();
  updateTextSummary(); updateTimerProgress(); renderPrompt(); renderHeatmap(); renderSpeedChart();
  typingInput.focus();
}

typingInput.addEventListener("keydown", (event) => {
  if (event.isComposing || finished) return;
  const modifiers = { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey };
  if (event.key === "Backspace") { event.preventDefault(); handleBackspace(getNow(), modifiers); return; }
  if (event.key === " ") { event.preventDefault(); handleSpace(getNow(), modifiers); return; }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); handleCharacter(event.key, getNow(), modifiers); }
});

document.addEventListener("keydown", (event) => {
  const activeControl = event.target?.closest?.(
    'button:not(:disabled), a, select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [role="tab"]',
  );
  if (event.key === " " && !activeControl) {
    event.preventDefault();
    return;
  }

  if (!finished || !focusRestartOnNextTab || event.key !== "Tab") return;
  event.preventDefault();
  focusRestartOnNextTab = false;
  restartButton.focus();
}, true);

typingInput.addEventListener("input", () => {
  if (typingInput.value) processExternalInput(typingInput.value);
});

textDisplay.addEventListener("click", () => typingInput.focus());
restartButton.addEventListener("click", () => resetRun());
textSelect.addEventListener("change", () => {
  settings.selectedText = textSelect.value;
  saveSettings();
  activeText = resolveText(settings.selectedText);
  resetRun({ chooseRandom: false });
});
chartScopeInputs.forEach((input) => input.addEventListener("change", () => {
  if (!input.checked) return;
  settings.chartScope = input.value;
  saveSettings();
  renderProgressChart(); renderTradeoffChart();
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
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.viewId !== tab.dataset.viewTarget;
    });
    const afterLayout = window.requestAnimationFrame ?? ((callback) => callback());
    afterLayout(() => {
      if (tab.dataset.viewTarget === "progress") progressChart?.resize?.();
      if (tab.dataset.viewTarget === "tradeoff") tradeoffChart?.resize?.();
    });
  }));
});
resultAnalysisTabs.forEach((tab) => tab.addEventListener("click", () => setResultAnalysisTab(tab.dataset.resultTab)));
clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("Clear all typing history and character statistics? This cannot be undone.")) return;
  statsStore = { version: 2, texts: {} };
  runsStore = { version: 2, runs: [] };
  analysisStore = { version: 3, texts: {} };
  saveStores();
  renderHeatmap(); renderSpeedChart(); renderProgressChart(); renderTradeoffChart();
});
lastRunHistogramCanvas.addEventListener("mouseleave", () => renderLastRunHeatmap());

removeLegacyTypingStorage();
populateTextPicker();
chartScopeInputs.forEach((input) => { input.checked = input.value === settings.chartScope; });
resetRun({ chooseRandom: settings.selectedText === "random" });
renderProgressChart();
renderTradeoffChart();
