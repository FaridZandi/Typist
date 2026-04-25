const promptText = [
  "Typing well is built from steady rhythm, careful attention, and relaxed hands.",
  "Focus on one word at a time. Let mistakes show you where to slow down, then keep moving with calm precision.",
  "A clear mind and consistent pace matter more than rushing through every sentence.",
  "Good practice feels deliberate. Keep your shoulders loose, return your eyes to the next letter, and trust the pattern under your fingers.",
  "When you miss a character, notice it quickly and continue. The goal is not perfection in every moment, but cleaner habits over the full minute.",
  "Short sessions make progress easier to see. Breathe, keep a steady rhythm, and finish the line in front of you.",
].join(" ");

const runLengthSeconds = 60;
const storageKey = `typist-heatmap:${promptText}`;

const textDisplay = document.querySelector("#textDisplay");
const typingInput = document.querySelector("#typingInput");
const restartButton = document.querySelector("#restartButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const timeRemaining = document.querySelector("#timeRemaining");
const speedValue = document.querySelector("#speedValue");
const accuracyValue = document.querySelector("#accuracyValue");
const resultPanel = document.querySelector("#resultPanel");
const finalSpeed = document.querySelector("#finalSpeed");
const finalAccuracy = document.querySelector("#finalAccuracy");
const heatmapDisplay = document.querySelector("#heatmapDisplay");
const heatmapRuns = document.querySelector("#heatmapRuns");
const speedChart = document.querySelector("#speedChart");

let started = false;
let finished = false;
let timerId = null;
let secondsLeft = runLengthSeconds;
let runAttempts = new Set();
let runMistakes = new Set();
let runIntervals = new Map();
let previousTypedLength = 0;
let previousLetterTime = null;
let heatmapStats = loadHeatmapStats();

function createEmptyHeatmapStats() {
  return {
    runs: 0,
    characters: [...promptText].map(() => ({
      attempts: 0,
      mistakes: 0,
      intervalSamples: 0,
      totalIntervalMs: 0,
    })),
  };
}

function loadHeatmapStats() {
  try {
    const savedStats = JSON.parse(localStorage.getItem(storageKey));

    if (
      savedStats?.characters?.length === promptText.length &&
      Number.isInteger(savedStats.runs)
    ) {
      savedStats.characters = savedStats.characters.map((stats) => ({
        attempts: Number.isFinite(stats.attempts) ? stats.attempts : 0,
        mistakes: Number.isFinite(stats.mistakes) ? stats.mistakes : 0,
        intervalSamples: Number.isFinite(stats.intervalSamples)
          ? stats.intervalSamples
          : 0,
        totalIntervalMs: Number.isFinite(stats.totalIntervalMs)
          ? stats.totalIntervalMs
          : 0,
      }));

      return savedStats;
    }
  } catch {
    // localStorage can fail in restrictive browser modes.
  }

  return createEmptyHeatmapStats();
}

function saveHeatmapStats() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(heatmapStats));
  } catch {
    // The app still works for the current page session if persistence fails.
  }
}

function renderPrompt(typedText = "") {
  textDisplay.replaceChildren();

  [...promptText].forEach((char, index) => {
    const span = document.createElement("span");
    span.textContent = char;
    span.className = "char";

    if (index < typedText.length) {
      if (typedText[index] !== char) {
        span.classList.add("incorrect");
      } else if (runMistakes.has(index)) {
        span.classList.add("corrected");
      } else {
        span.classList.add("correct");
      }
    } else if (index === typedText.length && !finished) {
      span.classList.add("current");
    }

    textDisplay.append(span);
  });
}

function getCharacterAccuracy(index) {
  const stats = heatmapStats.characters[index];

  if (!stats || stats.attempts === 0) {
    return null;
  }

  return Math.round(((stats.attempts - stats.mistakes) / stats.attempts) * 100);
}

function getHeatmapColor(accuracy, lowestAccuracy) {
  const clampedAccuracy = Math.max(0, Math.min(100, accuracy));
  const clampedLowest = Math.max(0, Math.min(99, lowestAccuracy));
  const normalizedAccuracy =
    clampedAccuracy === 100
      ? 1
      : (clampedAccuracy - clampedLowest) / (100 - clampedLowest);
  const hue = Math.round(Math.max(0, Math.min(1, normalizedAccuracy)) * 120);

  return `hsl(${hue} 68% 72%)`;
}

function renderHeatmap() {
  heatmapDisplay.replaceChildren();
  heatmapRuns.textContent = heatmapStats.runs;

  const recordedAccuracies = heatmapStats.characters
    .filter((stats) => stats.attempts > 0)
    .map((stats) =>
      Math.round(((stats.attempts - stats.mistakes) / stats.attempts) * 100),
    );
  const lowestAccuracy = Math.min(...recordedAccuracies, 100);

  [...promptText].forEach((char, index) => {
    const span = document.createElement("span");
    const accuracy = getCharacterAccuracy(index);

    span.textContent = char;
    span.className = "heatmap-char";

    if (accuracy === null) {
      span.classList.add("untracked");
      span.title = "No runs recorded for this character";
    } else {
      span.style.backgroundColor = getHeatmapColor(accuracy, lowestAccuracy);
      span.title = `${accuracy}% accuracy across ${heatmapStats.characters[index].attempts} attempts`;
    }

    heatmapDisplay.append(span);
  });
}

function getAverageLetterWpm(index) {
  const stats = heatmapStats.characters[index];

  if (!stats || stats.intervalSamples === 0 || stats.totalIntervalMs <= 0) {
    return null;
  }

  const averageIntervalSeconds =
    stats.totalIntervalMs / stats.intervalSamples / 1000;

  return Math.round(12 / averageIntervalSeconds);
}

function renderSpeedChart() {
  speedChart.replaceChildren();

  const speeds = heatmapStats.characters.map((_, index) =>
    getAverageLetterWpm(index),
  );
  const recordedSpeeds = speeds.filter((speed) => speed !== null);
  const lowestSpeed = Math.min(...recordedSpeeds, 0);
  const highestSpeed = Math.max(...recordedSpeeds, 1);

  speeds.forEach((speed, index) => {
    const span = document.createElement("span");
    const displayChar = promptText[index] === " " ? "space" : promptText[index];

    span.textContent = promptText[index];
    span.className = "heatmap-char";

    if (speed === null) {
      span.classList.add("untracked");
      span.title = `${displayChar}: no timing data`;
    } else {
      span.style.backgroundColor = getSpeedColor(
        speed,
        lowestSpeed,
        highestSpeed,
      );
      span.title = `${displayChar}: ${speed} WPM average`;
    }

    speedChart.append(span);
  });
}

function getSpeedColor(speed, lowestSpeed, highestSpeed) {
  if (highestSpeed <= lowestSpeed) {
    return "hsl(120 68% 72%)";
  }

  const normalizedSpeed = (speed - lowestSpeed) / (highestSpeed - lowestSpeed);
  const hue = Math.round(Math.max(0, Math.min(1, normalizedSpeed)) * 120);

  return `hsl(${hue} 68% 72%)`;
}

function recordCurrentMistakes() {
  const typedText = typingInput.value;

  [...typedText].forEach((char, index) => {
    runAttempts.add(index);

    if (char !== promptText[index]) {
      runMistakes.add(index);
    }
  });
}

function recordLetterTiming(now) {
  const typedLength = typingInput.value.length;
  const typedOneCharacter = typedLength === previousTypedLength + 1;

  if (!typedOneCharacter) {
    previousTypedLength = typedLength;
    return;
  }

  const index = typedLength - 1;

  if (index > 0 && previousLetterTime !== null) {
    runIntervals.set(index, now - previousLetterTime);
  }

  previousLetterTime = now;
  previousTypedLength = typedLength;
}

function getMetrics() {
  const typedText = typingInput.value;
  const attemptedCharacters = runAttempts.size || typedText.length;
  const mistakenCharacters = runMistakes.size;
  const correctCharacters = Math.max(0, attemptedCharacters - mistakenCharacters);
  const minutesElapsed = Math.max(
    (runLengthSeconds - secondsLeft) / 60,
    1 / 60,
  );
  const wordsPerMinute = Math.round(correctCharacters / 5 / minutesElapsed);
  const accuracy =
    attemptedCharacters === 0
      ? 100
      : Math.round((correctCharacters / attemptedCharacters) * 100);

  return { wordsPerMinute, accuracy };
}

function updateStats() {
  const { wordsPerMinute, accuracy } = getMetrics();
  speedValue.textContent = wordsPerMinute;
  accuracyValue.textContent = accuracy;
}

function finishRun() {
  if (finished) return;

  finished = true;
  clearInterval(timerId);
  timerId = null;
  recordCurrentMistakes();
  commitRunToHeatmap();
  typingInput.disabled = true;
  renderPrompt(typingInput.value);
  updateStats();

  const { wordsPerMinute, accuracy } = getMetrics();
  finalSpeed.textContent = wordsPerMinute;
  finalAccuracy.textContent = accuracy;
  resultPanel.hidden = false;
}

function commitRunToHeatmap() {
  runAttempts.forEach((index) => {
    if (!heatmapStats.characters[index]) return;

    heatmapStats.characters[index].attempts += 1;

    if (runMistakes.has(index)) {
      heatmapStats.characters[index].mistakes += 1;
    }
  });

  runIntervals.forEach((intervalMs, index) => {
    if (!heatmapStats.characters[index] || intervalMs <= 0) return;

    heatmapStats.characters[index].intervalSamples += 1;
    heatmapStats.characters[index].totalIntervalMs += intervalMs;
  });

  heatmapStats.runs += 1;
  saveHeatmapStats();
  renderHeatmap();
  renderSpeedChart();
}

function startTimer(now) {
  if (started) return;

  started = true;
  timerId = setInterval(() => {
    secondsLeft -= 1;
    timeRemaining.textContent = secondsLeft;
    updateStats();

    if (secondsLeft <= 0) {
      finishRun();
    }
  }, 1000);
}

function resetRun() {
  started = false;
  finished = false;
  secondsLeft = runLengthSeconds;
  clearInterval(timerId);
  timerId = null;
  runAttempts = new Set();
  runMistakes = new Set();
  runIntervals = new Map();
  previousTypedLength = 0;
  previousLetterTime = null;

  typingInput.value = "";
  typingInput.disabled = false;
  timeRemaining.textContent = runLengthSeconds;
  speedValue.textContent = "0";
  accuracyValue.textContent = "100";
  resultPanel.hidden = true;
  renderPrompt();
  typingInput.focus();
}

typingInput.addEventListener("input", () => {
  const now = performance.now();
  startTimer(now);

  if (typingInput.value.length > promptText.length) {
    typingInput.value = typingInput.value.slice(0, promptText.length);
  }

  recordLetterTiming(now);
  recordCurrentMistakes();
  renderPrompt(typingInput.value);
  updateStats();

  if (typingInput.value.length === promptText.length) {
    finishRun();
  }
});

restartButton.addEventListener("click", resetRun);

clearHistoryButton.addEventListener("click", () => {
  heatmapStats = createEmptyHeatmapStats();
  saveHeatmapStats();
  renderHeatmap();
  renderSpeedChart();
});

resetRun();
renderHeatmap();
renderSpeedChart();
