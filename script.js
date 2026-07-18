const runLengthSeconds = 60;
const minimumCoverageRatio = 0.5;
const speedSmoothingPreviousLetters = 5;
const typingStatsKey = "typist-typing-stats-v2";
const typingRunsKey = "typist-typing-runs-v2";
const typingSettingsKey = "typist-typing-settings-v2";
const promptCatalog = typeof typingTexts === "undefined" && !window.typingTexts
  ? [{ id: "calm-precision", title: "Calm precision", body: "Typing well is built from steady rhythm, careful attention, and relaxed hands.", durationSeconds: 60 }]
  : (typeof typingTexts === "undefined" ? window.typingTexts : typingTexts);

const textDisplay = document.querySelector("#textDisplay");
const typingInput = document.querySelector("#typingInput");
const restartButton = document.querySelector("#restartButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const textSelect = document.querySelector("#textSelect");
const currentTextLabel = document.querySelector("#currentTextLabel");
const currentTextMeta = document.querySelector("#currentTextMeta");
const currentTextPreview = document.querySelector("#currentTextPreview");
const heatmapTitle = document.querySelector("#heatmapTitle");
const speedChartTitle = document.querySelector("#speedChartTitle");
const speedValue = document.querySelector("#speedValue");
const accuracyValue = document.querySelector("#accuracyValue");
const consistencyValue = document.querySelector("#consistencyValue");
const scoreValue = document.querySelector("#scoreValue");
const resultPanel = document.querySelector("#resultPanel");
const lastRunHeatmapTitle = document.querySelector("#lastRunHeatmapTitle");
const finalSpeed = document.querySelector("#finalSpeed");
const finalAccuracy = document.querySelector("#finalAccuracy");
const finalScore = document.querySelector("#finalScore");
const lastRunHeatmap = document.querySelector("#lastRunHeatmap");
const lastRunHistogramCanvas = document.querySelector("#lastRunHistogram");
const heatmapDisplay = document.querySelector("#heatmapDisplay");
const heatmapRuns = document.querySelector("#heatmapRuns");
const speedChart = document.querySelector("#speedChart");
const progressChartCanvas = document.querySelector("#progressChart");
const tradeoffChartCanvas = document.querySelector("#tradeoffChart");
const timerProgress = document.querySelector(".timer-progress");
const timerProgressFill = document.querySelector("#timerProgressFill");
const chartScopeInputs = [...document.querySelectorAll('input[name="chartScope"]')];

const textById = new Map(promptCatalog.map((text) => [text.id, text]));
let settings = loadSettings();
let activeText = resolveText(settings.selectedText);
let words = getWords(activeText.body);
let started = false;
let finished = false;
let timerId = null;
let secondsLeft = activeText.durationSeconds || runLengthSeconds;
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
let statsStore = loadStatsStore();
let runsStore = loadRunsStore();
let progressChart = null;
let tradeoffChart = null;
let lastRunHistogram = null;
let lastRunSpeeds = [];
let lastRunHistogramBins = [];

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
  currentTextPreview.textContent = activeText.body;
  heatmapTitle.textContent = `${activeText.title} · character accuracy`;
  speedChartTitle.textContent = `${activeText.title} · letter speed`;
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
    if (wordIndex === currentWordIndex && !finished) wordElement.classList.add("active-word");
    const committed = committedWords[wordIndex];
    const isActive = wordIndex === currentWordIndex && !committed && !finished;
    const visibleBuffer = isActive ? [...currentWordBuffer] : committed?.typedCharacters || [];
    const mistakeOffsets = isActive ? currentWordMistakeOffsets : new Set(committed?.mistakeOffsets || []);

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
      } else if (isActive && offset === visibleBuffer.length) {
        span.classList.add("current");
      }
      span.dataset.promptIndex = String(getPromptIndex(word, offset));
      wordElement.append(span);
      if (isActive && offset === visibleBuffer.length - 1) appendCaret(wordElement);
    });

    if (isActive) {
      [...currentWordBuffer].slice(word.text.length).forEach((character, extraIndex) => {
        const extra = document.createElement("span");
        extra.className = "extra-char";
        extra.textContent = character;
        extra.title = "Extra character: counted as an error, with no prompt position";
        wordElement.append(extra);
        if (extraIndex === currentWordBuffer.length - word.text.length - 1) appendCaret(wordElement);
      });
      if (currentWordBuffer.length === 0) appendCaret(wordElement);
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
  timerId = setInterval(() => {
    secondsLeft -= 1;
    updateStats();
    if (secondsLeft <= 0) finishRun();
  }, 1000);
}

function getNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function handleCharacter(character, timestamp = getNow()) {
  if (finished || character === " " || currentWordIndex >= words.length) return;
  startTimer();
  const offset = currentWordBuffer.length;
  const expected = words[currentWordIndex].text[offset];
  currentWordBuffer += character;
  currentWordKeys.push({ character, offset, timestamp });
  currentWordLastKeyTimes.set(offset, timestamp);
  if (expected !== character) currentWordMistakeOffsets.add(offset);
  renderPrompt();
  updateStats();
  const isFinalWord = currentWordIndex === words.length - 1;
  if (isFinalWord && currentWordBuffer.length >= words[currentWordIndex].text.length && [...currentWordBuffer].every((value, index) => value === words[currentWordIndex].text[index])) {
    commitCurrentWord(timestamp, false);
    finishRun();
  }
}

function handleBackspace(timestamp = getNow()) {
  if (finished || currentWordBuffer.length === 0) return;
  startTimer();
  const removedOffset = currentWordBuffer.length - 1;
  if (removedOffset >= words[currentWordIndex].text.length) currentWordDeletedExtraErrors += 1;
  currentWordBuffer = [...currentWordBuffer].slice(0, -1).join("");
  currentWordKeys.push({ character: "Backspace", offset: removedOffset, timestamp });
  renderPrompt();
  updateStats();
}

function handleSpace(timestamp = getNow()) {
  if (finished) return;
  startTimer();
  commitCurrentWord(timestamp, true);
  renderPrompt();
  updateStats();
  if (currentWordIndex >= words.length) finishRun();
}

function recordMatchedTiming(promptIndex, timestamp) {
  if (!Number.isFinite(timestamp)) return;
  if (previousMatchedTime !== null && timestamp > previousMatchedTime) runIntervals.set(promptIndex, timestamp - previousMatchedTime);
  previousMatchedTime = timestamp;
}

function commitCurrentWord(separatorTimestamp = getNow(), includeSeparator) {
  if (finished || currentWordIndex >= words.length) return;
  const word = words[currentWordIndex];
  const typedCharacters = [...currentWordBuffer];
  const mistakeOffsets = new Set(currentWordMistakeOffsets);
  const committed = { typedCharacters, mistakeOffsets: [...mistakeOffsets], separatorCommitted: Boolean(includeSeparator) };
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
  const minutesElapsed = Math.max((runLengthSeconds - secondsLeft) / 60, 1 / 60);
  const wordsPerMinute = Math.round(counts.correct / 5 / minutesElapsed);
  const accuracy = counts.attempts === 0 ? 100 : Math.round((counts.correct / counts.attempts) * 100);
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

function updateStats() {
  const metrics = getMetrics();
  const consistency = getRunConsistency(runIntervals);
  speedValue.textContent = metrics.wordsPerMinute;
  accuracyValue.textContent = metrics.accuracy;
  consistencyValue.textContent = consistency;
  scoreValue.textContent = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
  updateTimerProgress();
}

function updateTimerProgress() {
  const elapsedSeconds = (activeText.durationSeconds || runLengthSeconds) - secondsLeft;
  const elapsedPercent = Math.max(0, Math.min(100, (elapsedSeconds / (activeText.durationSeconds || runLengthSeconds)) * 100));
  timerProgressFill.style.setProperty("--progress-width", `${elapsedPercent}%`);
  timerProgress.setAttribute("aria-valuemax", String(activeText.durationSeconds || runLengthSeconds));
  timerProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
}

function finishRun() {
  if (finished) return;
  if (currentWordIndex < words.length) commitCurrentWord(getNow(), false);
  finished = true;
  clearInterval(timerId);
  timerId = null;
  const metrics = getMetrics();
  const consistency = getRunConsistency(runIntervals);
  const typingScore = getTypingScore(metrics.wordsPerMinute, metrics.accuracy, consistency);
  resultPanel.hidden = false;
  finalSpeed.textContent = metrics.wordsPerMinute;
  finalAccuracy.textContent = metrics.accuracy;
  finalScore.textContent = typingScore;
  typingInput.disabled = true;
  renderPrompt();
  renderLastRunResults(getSmoothedRunIntervals());
  commitRun(metrics, consistency, typingScore, getSmoothedRunIntervals());
  updateStats();
}

function commitRun(metrics, consistency, typingScore, smoothedIntervals) {
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
  runsStore.runs.push({ textId: activeText.id, completedAt: new Date().toISOString(), wordsPerMinute: metrics.wordsPerMinute, accuracy: metrics.accuracy, consistency, typingScore });
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

function getHeatmapColor(accuracy, lowestAccuracy) {
  const normalized = accuracy === 100 ? 1 : (accuracy - Math.max(0, Math.min(99, lowestAccuracy))) / (100 - Math.max(0, Math.min(99, lowestAccuracy)));
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

function renderHeatmap() {
  const stats = getTextStats();
  heatmapDisplay.replaceChildren();
  heatmapRuns.textContent = stats.runs;
  const accuracies = stats.characters.map((_, index) => getCharacterAccuracy(index, stats)).filter((value) => value !== null);
  const lowestAccuracy = Math.min(...accuracies, 100);
  [...activeText.body].forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = character;
    const accuracy = getCharacterAccuracy(index, stats);
    if (accuracy === null) {
      span.classList.add("untracked");
      span.title = getCoverageTitle(index, stats);
    } else {
      span.style.backgroundColor = getHeatmapColor(accuracy, lowestAccuracy);
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
  const lowest = Math.min(...recorded, 0);
  const highest = Math.max(...recorded, 1);
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
  const chartData = {
    datasets: [
      { label: "Speed (WPM)", data: runs.map((run, index) => ({ x: index + 1, y: run.wordsPerMinute, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#0f766e", tension: 0.25, parsing: false, hidden: true, yAxisID: "wpm" },
      { label: "Accuracy (%)", data: runs.map((run, index) => ({ x: index + 1, y: run.accuracy, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#15803d", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
      { label: "Consistency (%)", data: runs.map((run, index) => ({ x: index + 1, y: run.consistency, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#c62828", tension: 0.25, parsing: false, hidden: true, yAxisID: "percent" },
      { label: "Typing score", data: runs.map((run, index) => ({ x: index + 1, y: run.typingScore, completedAt: run.completedAt, textTitle: getRunLabel(run) })), borderColor: "#7c3aed", tension: 0.25, parsing: false, yAxisID: "score" },
    ],
  };
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
  started = false; finished = false; secondsLeft = activeText.durationSeconds || runLengthSeconds;
  clearInterval(timerId); timerId = null;
  currentWordIndex = 0; currentWordBuffer = ""; currentWordKeys = []; currentWordLastKeyTimes = new Map(); currentWordMistakeOffsets = new Set(); currentWordDeletedExtraErrors = 0; committedWords = [];
  runPromptAttempts = new Set(); runMistakes = new Set(); runIntervals = new Map(); runExpectedAttempts = 0; runCorrectCharacters = 0; runMistakeCount = 0; runExtraErrors = 0; previousMatchedTime = null;
  typingInput.value = ""; typingInput.disabled = false;
  speedValue.textContent = "0"; accuracyValue.textContent = "100"; consistencyValue.textContent = "100"; scoreValue.textContent = "100";
  resultPanel.hidden = true; lastRunSpeeds = []; lastRunHistogramBins = []; lastRunHeatmap.replaceChildren();
  updateTextSummary(); updateTimerProgress(); renderPrompt(); renderHeatmap(); renderSpeedChart();
  typingInput.focus();
}

typingInput.addEventListener("keydown", (event) => {
  if (event.isComposing || finished) return;
  if (event.key === "Backspace") { event.preventDefault(); handleBackspace(); return; }
  if (event.key === " ") { event.preventDefault(); handleSpace(); return; }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); handleCharacter(event.key); }
});

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
clearHistoryButton.addEventListener("click", () => {
  statsStore = { version: 2, texts: {} };
  runsStore = { version: 2, runs: [] };
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
