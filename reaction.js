const reactionRunLengthSeconds = 60;
const reactionHistoryStorageKey = "typist-reaction-history";
const reactionKeyStatsStorageKey = "typist-reaction-key-stats";
const keyboardRows = [
  ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "[", "]"],
  ["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/", "=", "\\"],
  ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"],
  [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
];
const targetLetters = keyboardRows.flat();
const baselineTargetWeight = 1;
const accuracyPenaltyWeight = 3;
const reactionTimePenaltyWeight = 2;
const targetWeightConfidenceSamples = 8;

const startButton = document.querySelector("#startButton");
const hitValue = document.querySelector("#hitValue");
const averageReactionValue = document.querySelector("#averageReactionValue");
const reactionAccuracyValue = document.querySelector("#reactionAccuracyValue");
const errorValue = document.querySelector("#errorValue");
const reactionProgress = document.querySelector(".timer-progress");
const reactionProgressFill = document.querySelector("#reactionProgressFill");
const targetLetter = document.querySelector("#targetLetter");
const typedKeyDisplay = document.querySelector("#typedKeyDisplay");
const reactionStatus = document.querySelector("#reactionStatus");
const reactionResultPanel = document.querySelector("#reactionResultPanel");
const finalHits = document.querySelector("#finalHits");
const finalErrors = document.querySelector("#finalErrors");
const finalAverageReaction = document.querySelector("#finalAverageReaction");
const bestReactionValue = document.querySelector("#bestReactionValue");
const medianReactionValue = document.querySelector("#medianReactionValue");
const p90ReactionValue = document.querySelector("#p90ReactionValue");
const clearReactionHistoryButton = document.querySelector(
  "#clearReactionHistoryButton",
);
const reactionHistoryChartCanvas = document.querySelector("#reactionHistoryChart");
const reactionKeyboardKeys = document.querySelectorAll(
  ".reaction-keyboard .key[data-key]",
);
const reactionTimeKeyboard = document.querySelector("#reactionTimeKeyboard");
let reactionTimeKeyboardKeys = [];

let running = false;
let finished = false;
let timerId = null;
let secondsLeft = reactionRunLengthSeconds;
let currentTarget = "";
let targetShownAt = 0;
let hits = 0;
let errors = 0;
let reactionTimes = [];
let reactionHistory = loadReactionHistory();
let reactionKeyStats = loadReactionKeyStats();
let reactionHistoryChart = null;
let targetDistribution = getTargetDistribution();

function startReactionRun() {
  resetReactionRun();
  running = true;
  targetDistribution = getTargetDistribution();

  console.log("Target distribution:", targetDistribution);  

  startButton.blur();
  startButton.textContent = "Restart";
  reactionStatus.textContent = "Type the displayed letter.";
  showNextTarget();

  timerId = setInterval(() => {
    secondsLeft -= 1;
    updateProgress();

    if (secondsLeft <= 0) {
      finishReactionRun();
    }
  }, 1000);
}

function resetReactionRun() {
  running = false;
  finished = false;
  clearInterval(timerId);
  timerId = null;
  secondsLeft = reactionRunLengthSeconds;
  currentTarget = "";
  targetShownAt = 0;
  hits = 0;
  errors = 0;
  reactionTimes = [];
  targetLetter.textContent = "-";
  typedKeyDisplay.textContent = "-";
  typedKeyDisplay.classList.remove("typed-key-error", "typed-key-correct");
  reactionResultPanel.hidden = true;
  updateStats();
  updateProgress();
}

function showNextTarget() {
  currentTarget = getRandomLetter();
  targetLetter.textContent = formatKeyLabel(currentTarget);
  targetLetter.classList.remove("target-error", "target-correct");
  typedKeyDisplay.textContent = "-";
  typedKeyDisplay.classList.remove("typed-key-error", "typed-key-correct");
  targetShownAt = performance.now();
}

function getRandomLetter() {
  if (targetDistribution.length === 0) {
    return targetLetters[0];
  }

  let nextLetter = currentTarget;
  let attempts = 0;

  while (
    nextLetter === currentTarget &&
    targetDistribution.length > 1 &&
    attempts < 8
  ) {
    nextLetter = getWeightedTarget(targetDistribution);
    attempts += 1;
  }

  return nextLetter;
}

function getTargetDistribution() {
  const averageReactionTimes = targetLetters
    .map((letter) => getAverageKeyReactionTime(letter))
    .filter((reactionTime) => reactionTime !== null);
  const fastestReaction =
    averageReactionTimes.length === 0 ? 0 : Math.min(...averageReactionTimes);
  const slowestReaction =
    averageReactionTimes.length === 0 ? 0 : Math.max(...averageReactionTimes);

  return targetLetters.map((letter) => {
    const stats = reactionKeyStats[letter] ?? {
      correct: 0,
      wrong: 0,
      reactionSamples: 0,
    };
    const attempts = stats.correct + stats.wrong;
    const accuracy = attempts === 0 ? null : stats.correct / attempts;
    const accuracyConfidence = Math.min(
      1,
      attempts / targetWeightConfidenceSamples,
    );
    const accuracyPenalty =
      accuracy === null ? 0 : (1 - accuracy) * accuracyConfidence;
    const averageReactionTime = getAverageKeyReactionTime(letter);
    const reactionConfidence = Math.min(
      1,
      stats.reactionSamples / targetWeightConfidenceSamples,
    );
    const reactionPenalty =
      averageReactionTime === null || slowestReaction <= fastestReaction
        ? 0
        : ((averageReactionTime - fastestReaction) /
            (slowestReaction - fastestReaction)) *
          reactionConfidence;

    let w = baselineTargetWeight +
        accuracyPenalty * accuracyPenaltyWeight +
        reactionPenalty * reactionTimePenaltyWeight; 

    return {
      letter,
      weight: w
    };
  });
}

function getWeightedTarget(distribution) {
  const totalWeight = distribution.reduce(
    (total, target) => total + target.weight,
    0,
  );
  let draw = Math.random() * totalWeight;

  for (const target of distribution) {
    draw -= target.weight;

    if (draw <= 0) {
      return target.letter;
    }
  }

  return distribution[distribution.length - 1].letter;
}

function handleKeyPress(event) {
  if (!running || finished || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key === "Escape") {
    finishReactionRun();
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    return;
  }

  const typedKey = normalizeKey(event.key);

  if (!targetLetters.includes(typedKey)) {
    return;
  }

  event.preventDefault();

  typedKeyDisplay.textContent = formatKeyLabel(typedKey);

  if (typedKey !== currentTarget) {
    errors += 1;
    recordKeyAttempt(currentTarget, false, typedKey);
    typedKeyDisplay.classList.add("typed-key-error");
    targetLetter.classList.add("target-error");
    reactionStatus.textContent = "Wrong key. Retype the shown letter.";
    updateStats();

    window.setTimeout(() => {
      if (!running || finished) return;

      typedKeyDisplay.textContent = "-";
      typedKeyDisplay.classList.remove("typed-key-error");
      targetLetter.classList.remove("target-error");
    }, 140);
    return;
  }

  hits += 1;
  const reactionTime = performance.now() - targetShownAt;
  recordKeyAttempt(currentTarget, true, typedKey, reactionTime);
  reactionTimes.push(reactionTime);
  typedKeyDisplay.classList.add("typed-key-correct");
  targetLetter.classList.add("target-correct");
  reactionStatus.textContent = "Correct.";
  updateStats();

  window.setTimeout(() => {
    if (!running || finished) return;

    showNextTarget();
  }, 120);
}

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

function formatKeyLabel(key) {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

function updateStats() {
  hitValue.textContent = hits;
  errorValue.textContent = errors;
  averageReactionValue.textContent = getAverageReactionTime();
  reactionAccuracyValue.textContent = getReactionAccuracy();
}

function updateProgress() {
  const elapsedSeconds = reactionRunLengthSeconds - secondsLeft;
  const elapsedPercent = Math.max(
    0,
    Math.min(100, (elapsedSeconds / reactionRunLengthSeconds) * 100),
  );

  reactionProgressFill.style.setProperty(
    "--progress-width",
    `${elapsedPercent}%`,
  );
  reactionProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
}

function getAverageReactionTime() {
  if (reactionTimes.length === 0) {
    return 0;
  }

  return Math.round(
    reactionTimes.reduce((total, reactionTime) => total + reactionTime, 0) /
      reactionTimes.length,
  );
}

function getReactionAccuracy() {
  const attempts = hits + errors;

  if (attempts === 0) {
    return 100;
  }

  return Math.round((hits / attempts) * 100);
}

function loadReactionHistory() {
  try {
    const savedHistory = JSON.parse(
      localStorage.getItem(reactionHistoryStorageKey),
    );

    if (!Array.isArray(savedHistory)) {
      return [];
    }

    return savedHistory.filter(
      (run) =>
        typeof run.completedAt === "string" &&
        Number.isFinite(run.hits) &&
        Number.isFinite(run.errors) &&
        Number.isFinite(run.averageReaction) &&
        Number.isFinite(run.accuracy) &&
        Number.isFinite(run.bestReaction) &&
        Number.isFinite(run.medianReaction) &&
        Number.isFinite(run.p90Reaction),
    );
  } catch {
    return [];
  }
}

function saveReactionHistory() {
  try {
    localStorage.setItem(
      reactionHistoryStorageKey,
      JSON.stringify(reactionHistory),
    );
  } catch {
    // The current run still works if browser storage is unavailable.
  }
}

function createEmptyKeyStats() {
  return Object.fromEntries(
    targetLetters.map((letter) => [
      letter,
      {
        correct: 0,
        wrong: 0,
        errors: {},
        reactionSamples: 0,
        totalReaction: 0,
      },
    ]),
  );
}

function loadReactionKeyStats() {
  try {
    const savedStats = JSON.parse(
      localStorage.getItem(reactionKeyStatsStorageKey),
    );
    const emptyStats = createEmptyKeyStats();

    if (!savedStats || typeof savedStats !== "object") {
      return emptyStats;
    }

    targetLetters.forEach((letter) => {
      const savedLetterStats = savedStats[letter];

      if (!savedLetterStats || typeof savedLetterStats !== "object") {
        return;
      }

      emptyStats[letter] = {
        correct: Number.isFinite(savedLetterStats.correct)
          ? savedLetterStats.correct
          : 0,
        wrong: Number.isFinite(savedLetterStats.wrong)
          ? savedLetterStats.wrong
          : 0,
        errors:
          savedLetterStats.errors && typeof savedLetterStats.errors === "object"
            ? savedLetterStats.errors
            : {},
        reactionSamples: Number.isFinite(savedLetterStats.reactionSamples)
          ? savedLetterStats.reactionSamples
          : 0,
        totalReaction: Number.isFinite(savedLetterStats.totalReaction)
          ? savedLetterStats.totalReaction
          : 0,
      };
    });

    return emptyStats;
  } catch {
    return createEmptyKeyStats();
  }
}

function saveReactionKeyStats() {
  try {
    localStorage.setItem(
      reactionKeyStatsStorageKey,
      JSON.stringify(reactionKeyStats),
    );
  } catch {
    // The live test still works if browser storage is unavailable.
  }
}

function recordKeyAttempt(targetKey, wasCorrect, typedKey, reactionTime = null) {
  ensureKeyStats(targetKey);

  if (wasCorrect) {
    reactionKeyStats[targetKey].correct += 1;

    if (Number.isFinite(reactionTime)) {
      reactionKeyStats[targetKey].reactionSamples += 1;
      reactionKeyStats[targetKey].totalReaction += reactionTime;
    }
  } else {
    reactionKeyStats[targetKey].wrong += 1;
    reactionKeyStats[targetKey].errors[typedKey] =
      (reactionKeyStats[targetKey].errors[typedKey] ?? 0) + 1;

    if (typedKey !== targetKey && reactionKeyStats[typedKey]) {
      reactionKeyStats[typedKey].wrong += 1;
      reactionKeyStats[typedKey].errors[targetKey] =
        (reactionKeyStats[typedKey].errors[targetKey] ?? 0) + 1;
    }
  }

  saveReactionKeyStats();
  renderReactionKeyboardStats();
  renderReactionTimeKeyboardStats();
}

function ensureKeyStats(key) {
  if (!reactionKeyStats[key]) {
    reactionKeyStats[key] = {
      correct: 0,
      wrong: 0,
      errors: {},
      reactionSamples: 0,
      totalReaction: 0,
    };
  }
}

function renderReactionKeyboardStats() {
  const attemptedAccuracies = targetLetters
    .map((letter) => getKeyAccuracy(letter))
    .filter((accuracy) => accuracy !== null);
  const lowestAccuracy = Math.min(...attemptedAccuracies, 100);
  const highestAccuracy = Math.max(...attemptedAccuracies, 100);

  reactionKeyboardKeys.forEach((keyElement) => {
    const key = keyElement.dataset.key;
    const accuracy = getKeyAccuracy(key);

    keyElement.style.removeProperty("background-color");
    keyElement.classList.remove("key-untracked");

    if (accuracy === null) {
      keyElement.classList.add("key-untracked");
      keyElement.title = `${formatKeyLabel(key)}: no attempts yet`;
      return;
    }

    keyElement.style.backgroundColor = getKeyAccuracyColor(
      accuracy,
      lowestAccuracy,
      highestAccuracy,
    );
    keyElement.title = getKeyStatsTitle(key, accuracy);
  });
}

function renderReactionTimeKeyboardMarkup() {
  reactionTimeKeyboard.replaceChildren();

  keyboardRows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = `keyboard-row ${getKeyboardRowClass(rowIndex)}`;

    row.forEach((key) => {
      const keyElement = document.createElement("div");
      keyElement.className = "key";
      keyElement.dataset.timeKey = key;
      keyElement.textContent = formatKeyLabel(key);
      rowElement.append(keyElement);
    });

    reactionTimeKeyboard.append(rowElement);
  });

  reactionTimeKeyboardKeys = reactionTimeKeyboard.querySelectorAll(
    ".key[data-time-key]",
  );
}

function getKeyboardRowClass(rowIndex) {
  return ["number-row", "top-letter-row", "home-row", "lower-row"][rowIndex];
}

function renderReactionTimeKeyboardStats() {
  const attemptedReactionTimes = targetLetters
    .map((letter) => getAverageKeyReactionTime(letter))
    .filter((reactionTime) => reactionTime !== null);
  const fastestReaction =
    attemptedReactionTimes.length === 0
      ? 0
      : Math.min(...attemptedReactionTimes);
  const slowestReaction =
    attemptedReactionTimes.length === 0
      ? 0
      : Math.max(...attemptedReactionTimes);

  reactionTimeKeyboardKeys.forEach((keyElement) => {
    const key = keyElement.dataset.timeKey;
    const reactionTime = getAverageKeyReactionTime(key);

    keyElement.style.removeProperty("background-color");
    keyElement.classList.remove("key-untracked");

    if (reactionTime === null) {
      keyElement.classList.add("key-untracked");
      keyElement.title = `${formatKeyLabel(key)}: no reaction time yet`;
      return;
    }

    keyElement.style.backgroundColor = getReactionTimeColor(
      reactionTime,
      fastestReaction,
      slowestReaction,
    );
    keyElement.title = getKeyReactionTimeTitle(key, reactionTime);
  });
}

function getAverageKeyReactionTime(key) {
  const stats = reactionKeyStats[key];

  if (!stats || stats.reactionSamples === 0 || stats.totalReaction <= 0) {
    return null;
  }

  return Math.round(stats.totalReaction / stats.reactionSamples);
}

function getReactionTimeColor(reactionTime, fastestReaction, slowestReaction) {
  if (slowestReaction <= fastestReaction) {
    return "hsl(120 68% 72%)";
  }

  const normalizedSpeed =
    1 - (reactionTime - fastestReaction) / (slowestReaction - fastestReaction);
  const hue = Math.round(Math.max(0, Math.min(1, normalizedSpeed)) * 120);

  return `hsl(${hue} 68% 72%)`;
}

function getKeyReactionTimeTitle(key, reactionTime) {
  const stats = reactionKeyStats[key];

  return [
    `${formatKeyLabel(key)}: ${reactionTime} ms average`,
    `${stats.reactionSamples} correct samples`,
  ].join(" | ");
}

function getKeyAccuracy(key) {
  const stats = reactionKeyStats[key];

  if (!stats) {
    return null;
  }

  const attempts = stats.correct + stats.wrong;

  if (attempts === 0) {
    return null;
  }

  return Math.round((stats.correct / attempts) * 100);
}

function getKeyAccuracyColor(accuracy, lowestAccuracy, highestAccuracy) {
  if (highestAccuracy <= lowestAccuracy) {
    const hue = Math.round((accuracy / 100) * 120);

    return `hsl(${hue} 68% 72%)`;
  }

  const normalizedAccuracy =
    (accuracy - lowestAccuracy) / (highestAccuracy - lowestAccuracy);
  const hue = Math.round(Math.max(0, Math.min(1, normalizedAccuracy)) * 120);

  return `hsl(${hue} 68% 72%)`;
}

function getKeyStatsTitle(key, accuracy) {
  const stats = reactionKeyStats[key];
  const attempts = stats.correct + stats.wrong;
  const commonErrors = Object.entries(stats.errors)
    .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
    .slice(0, 3)
    .map(([wrongKey, count]) => `${formatKeyLabel(wrongKey)} ${count}`)
    .join(", ");

  return [
    `${formatKeyLabel(key)}: ${accuracy}% accuracy`,
    `${stats.correct}/${attempts} correct`,
    commonErrors ? `Errors: ${commonErrors}` : "Errors: none",
  ].join(" | ");
}

function recordReactionRun() {
  reactionHistory.push({
    completedAt: new Date().toISOString(),
    hits,
    errors,
    averageReaction: getAverageReactionTime(),
    accuracy: getReactionAccuracy(),
    bestReaction:
      reactionTimes.length === 0 ? 0 : Math.round(Math.min(...reactionTimes)),
    medianReaction: getPercentile(reactionTimes, 50),
    p90Reaction: getPercentile(reactionTimes, 90),
  });
  saveReactionHistory();
  renderReactionHistoryChart();
}

function renderReactionHistoryChart() {
  if (!window.Chart || !reactionHistoryChartCanvas) {
    return;
  }

  const chartData = {
    datasets: [
      {
        label: "Avg reaction (ms)",
        data: reactionHistory.map((run, index) => ({
          x: index + 1,
          y: run.averageReaction,
        })),
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.12)",
        tension: 0.25,
        parsing: false,
        yAxisID: "milliseconds",
      },
      {
        label: "Accuracy (%)",
        data: reactionHistory.map((run, index) => ({
          x: index + 1,
          y: run.accuracy,
        })),
        borderColor: "#15803d",
        backgroundColor: "rgba(21, 128, 61, 0.12)",
        tension: 0.25,
        parsing: false,
        yAxisID: "percent",
      },
      {
        label: "Hits",
        data: reactionHistory.map((run, index) => ({
          x: index + 1,
          y: run.hits,
        })),
        borderColor: "#4f5df3",
        backgroundColor: "rgba(79, 93, 243, 0.12)",
        tension: 0.25,
        parsing: false,
        hidden: true,
        yAxisID: "count",
      },
      {
        label: "Errors",
        data: reactionHistory.map((run, index) => ({
          x: index + 1,
          y: run.errors,
        })),
        borderColor: "#c62828",
        backgroundColor: "rgba(198, 40, 40, 0.12)",
        tension: 0.25,
        parsing: false,
        hidden: true,
        yAxisID: "count",
      },
    ],
  };

  if (reactionHistoryChart) {
    reactionHistoryChart.data = chartData;
    reactionHistoryChart.update();
    return;
  }

  reactionHistoryChart = new Chart(reactionHistoryChartCanvas, {
    type: "line",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          position: "bottom",
        },
        tooltip: {
          callbacks: {
            afterTitle(items) {
              const run = reactionHistory[items[0].dataIndex];

              return new Date(run.completedAt).toLocaleString();
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          title: {
            display: true,
            text: "Test number",
          },
          ticks: {
            stepSize: 1,
          },
        },
        milliseconds: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          title: {
            display: true,
            text: "Milliseconds",
          },
        },
        percent: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          max: 100,
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: "Accuracy",
          },
        },
        count: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          display: false,
          grid: {
            drawOnChartArea: false,
          },
        },
      },
    },
  });
}

function getPercentile(values, percentile) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;

  return Math.round(sortedValues[Math.max(0, index)]);
}

function finishReactionRun() {
  if (finished) return;

  running = false;
  finished = true;
  clearInterval(timerId);
  timerId = null;
  secondsLeft = 0;
  updateProgress();
  updateStats();
  startButton.textContent = "Start";
  reactionStatus.textContent = "Run complete.";
  targetLetter.textContent = "-";
  typedKeyDisplay.textContent = "-";

  finalHits.textContent = hits;
  finalErrors.textContent = errors;
  finalAverageReaction.textContent = getAverageReactionTime();
  bestReactionValue.textContent =
    reactionTimes.length === 0 ? 0 : Math.round(Math.min(...reactionTimes));
  medianReactionValue.textContent = getPercentile(reactionTimes, 50);
  p90ReactionValue.textContent = getPercentile(reactionTimes, 90);
  reactionResultPanel.hidden = false;
  recordReactionRun();
}

startButton.addEventListener("click", startReactionRun);
window.addEventListener("keydown", handleKeyPress);
clearReactionHistoryButton.addEventListener("click", () => {
  reactionHistory = [];
  reactionKeyStats = createEmptyKeyStats();
  saveReactionHistory();
  saveReactionKeyStats();
  renderReactionHistoryChart();
  renderReactionKeyboardStats();
  renderReactionTimeKeyboardStats();
});

resetReactionRun();
renderReactionTimeKeyboardMarkup();
renderReactionHistoryChart();
renderReactionKeyboardStats();
renderReactionTimeKeyboardStats();
