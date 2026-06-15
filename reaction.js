const reactionRunLengthSeconds = 60;
const reactionHistoryStorageKey = "typist-reaction-history";
const reactionKeyStatsStorageKey = "typist-reaction-key-stats";
const reactionSettingsStorageKey = "typist-reaction-settings";
const targetLetters = getDvorakKeyboardKeys();
const baselineTargetWeight = 1;
const accuracyPenaltyWeight = 3;
const reactionTimePenaltyWeight = 2;
const targetWeightConfidenceSamples = 8;
const keyMetricAlpha = 0.2;
const warmupStartKey = "h";

const startButton = document.querySelector("#startButton");
const focusExponentInput = document.querySelector("#focusExponent");
const focusExponentValue = document.querySelector("#focusExponentValue");
const includeNonLettersInput = document.querySelector("#includeNonLetters");
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
const reactionAccuracyKeyboard = document.querySelector(
  "#reactionAccuracyKeyboard",
);
const reactionTimeKeyboard = document.querySelector("#reactionTimeKeyboard");
let reactionKeyboardKeys = [];
let reactionTimeKeyboardKeys = [];

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
let reactionHistory = loadReactionHistory();
let reactionKeyStats = loadReactionKeyStats();
let reactionHistoryChart = null;
loadReactionSettings();
let targetDistribution = getTargetDistribution();

function loadReactionSettings() {
  try {
    const settings = JSON.parse(
      localStorage.getItem(reactionSettingsStorageKey),
    );

    if (!settings || typeof settings !== "object") {
      return;
    }

    const focusExponent = Number(settings.focusExponent);
    const minimumFocus = Number(focusExponentInput.min);
    const maximumFocus = Number(focusExponentInput.max);

    if (
      Number.isFinite(focusExponent) &&
      focusExponent >= minimumFocus &&
      focusExponent <= maximumFocus
    ) {
      focusExponentInput.value = String(focusExponent);
      focusExponentValue.value = String(focusExponent);
    }

    if (typeof settings.includeNonLetters === "boolean") {
      includeNonLettersInput.checked = settings.includeNonLetters;
    }
  } catch {
    // Default settings remain available if browser storage is unavailable.
  }
}

function saveReactionSettings() {
  try {
    localStorage.setItem(
      reactionSettingsStorageKey,
      JSON.stringify({
        focusExponent: Number(focusExponentInput.value),
        includeNonLetters: includeNonLettersInput.checked,
      }),
    );
  } catch {
    // The test still works if browser storage is unavailable.
  }
}

function startReactionRun() {
  resetReactionRun();
  running = true;
  awaitingStartKey = true;
  targetDistribution = getTargetDistribution();
  focusExponentInput.disabled = true;
  includeNonLettersInput.disabled = true;
  startButton.blur();
  startButton.textContent = "Restart";
  currentTarget = warmupStartKey;
  targetLetter.textContent = formatKeyLabel(warmupStartKey);
  reactionStatus.textContent = `Press ${formatKeyLabel(
    warmupStartKey,
  )} to start the test.`;
}

function beginTimedReactionRun() {
  awaitingStartKey = false;
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
  awaitingStartKey = false;
  clearInterval(timerId);
  timerId = null;
  secondsLeft = reactionRunLengthSeconds;
  currentTarget = "";
  targetShownAt = 0;
  hits = 0;
  errors = 0;
  reactionTimes = [];
  targetLetter.textContent = "-";
  targetLetter.classList.remove("target-error", "target-correct");
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

  const availableTargets = targetDistribution.filter(
    (target) => target.letter !== currentTarget,
  );

  return getWeightedTarget(
    availableTargets.length > 0 ? availableTargets : targetDistribution,
  );
}

function getTargetDistribution() {
  const eligibleTargetLetters = includeNonLettersInput.checked
    ? targetLetters
    : targetLetters.filter(isLetterTarget);
  const emaReactionTimes = eligibleTargetLetters
    .map((letter) => getKeyEmaReactionTime(letter))
    .filter((reactionTime) => reactionTime !== null);
  const fastestReaction =
    emaReactionTimes.length === 0 ? 0 : Math.min(...emaReactionTimes);
  const slowestReaction =
    emaReactionTimes.length === 0 ? 0 : Math.max(...emaReactionTimes);

  return eligibleTargetLetters.map((letter) => {
    const stats = reactionKeyStats[letter] ?? {
      correct: 0,
      wrong: 0,
      reactionSamples: 0,
    };
    const attempts = stats.correct + stats.wrong;
    const accuracy =
      Number.isFinite(stats.emaAccuracy) && stats.emaAccuracy !== null
        ? stats.emaAccuracy
        : attempts === 0
          ? null
          : stats.correct / attempts;
    const accuracyConfidence = Math.min(
      1,
      attempts / targetWeightConfidenceSamples,
    );
    const accuracyPenalty =
      accuracy === null ? 0 : (1 - accuracy) * accuracyConfidence;
    const averageReactionTime = getKeyEmaReactionTime(letter);
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

    const weight =
      baselineTargetWeight +
      accuracyPenalty * accuracyPenaltyWeight +
      reactionPenalty * reactionTimePenaltyWeight;

    return {
      letter,
      weight: Math.pow(weight, Number(focusExponentInput.value)),
    };
  });
}

function isLetterTarget(target) {
  return /^[a-z]$/.test(target);
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

  if (awaitingStartKey) {
    if (typedKey !== warmupStartKey) {
      typedKeyDisplay.classList.add("typed-key-error");
      targetLetter.classList.add("target-error");
      reactionStatus.textContent = `Press ${formatKeyLabel(
        warmupStartKey,
      )} to start the test.`;

      window.setTimeout(() => {
        if (!running || finished || !awaitingStartKey) return;

        typedKeyDisplay.textContent = "-";
        typedKeyDisplay.classList.remove("typed-key-error");
        targetLetter.classList.remove("target-error");
      }, 140);
      return;
    }

    typedKeyDisplay.classList.add("typed-key-correct");
    targetLetter.classList.add("target-correct");

    window.setTimeout(() => {
      if (!running || finished || !awaitingStartKey) return;

      beginTimedReactionRun();
    }, 120);
    return;
  }

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

const formatKeyLabel = formatKeyboardKeyLabel;

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
        emaAccuracy: null,
        emaReaction: null,
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
        emaAccuracy:
          Number.isFinite(savedLetterStats.emaAccuracy) ||
          savedLetterStats.emaAccuracy === null
            ? savedLetterStats.emaAccuracy
            : null,
        emaReaction:
          Number.isFinite(savedLetterStats.emaReaction) ||
          savedLetterStats.emaReaction === null
            ? savedLetterStats.emaReaction
            : null,
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
  updateKeyEmaAccuracy(targetKey, wasCorrect ? 1 : 0);

  if (wasCorrect) {
    reactionKeyStats[targetKey].correct += 1;

    if (Number.isFinite(reactionTime)) {
      reactionKeyStats[targetKey].reactionSamples += 1;
      reactionKeyStats[targetKey].totalReaction += reactionTime;
      updateKeyEmaReaction(targetKey, reactionTime);
    }
  } else {
    reactionKeyStats[targetKey].wrong += 1;
    reactionKeyStats[targetKey].errors[typedKey] =
      (reactionKeyStats[targetKey].errors[typedKey] ?? 0) + 1;

    if (typedKey !== targetKey && reactionKeyStats[typedKey]) {
      updateKeyEmaAccuracy(typedKey, 0);
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
      emaAccuracy: null,
      emaReaction: null,
    };
  }
}

function updateKeyEmaAccuracy(key, value) {
  const currentAccuracy = reactionKeyStats[key].emaAccuracy;

  reactionKeyStats[key].emaAccuracy =
    currentAccuracy === null || !Number.isFinite(currentAccuracy)
      ? value
      : keyMetricAlpha * value + (1 - keyMetricAlpha) * currentAccuracy;
}

function updateKeyEmaReaction(key, reactionTime) {
  const currentReaction = reactionKeyStats[key].emaReaction;

  reactionKeyStats[key].emaReaction =
    currentReaction === null || !Number.isFinite(currentReaction)
      ? reactionTime
      : keyMetricAlpha * reactionTime + (1 - keyMetricAlpha) * currentReaction;
}

function renderReactionKeyboardStats() {
  const attemptedAccuracies = targetLetters
    .map((letter) => getKeyEmaAccuracy(letter))
    .filter((accuracy) => accuracy !== null);
  const lowestAccuracy = Math.min(...attemptedAccuracies, 100);
  const highestAccuracy = Math.max(...attemptedAccuracies, 100);

  reactionKeyboardKeys.forEach((keyElement) => {
    const key = keyElement.dataset.key;
    const accuracy = getKeyEmaAccuracy(key);

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

function renderReactionKeyboardMarkup() {
  renderDvorakKeyboard(reactionAccuracyKeyboard, {
    datasetName: "key",
  });
  reactionKeyboardKeys = reactionAccuracyKeyboard.querySelectorAll(
    ".key[data-key]",
  );
}

function renderReactionTimeKeyboardMarkup() {
  reactionTimeKeyboard.replaceChildren();
  renderDvorakKeyboard(reactionTimeKeyboard, {
    datasetName: "timeKey",
  });
  reactionTimeKeyboardKeys = reactionTimeKeyboard.querySelectorAll(
    ".key[data-time-key]",
  );
}

function renderReactionTimeKeyboardStats() {
  const attemptedReactionTimes = targetLetters
    .map((letter) => getKeyEmaReactionTime(letter))
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
    const reactionTime = getKeyEmaReactionTime(key);

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

function getKeyEmaAccuracy(key) {
  const stats = reactionKeyStats[key];

  if (!stats || !Number.isFinite(stats.emaAccuracy)) {
    return null;
  }

  return Math.round(stats.emaAccuracy * 100);
}

function getKeyEmaReactionTime(key) {
  const stats = reactionKeyStats[key];

  if (!stats || !Number.isFinite(stats.emaReaction)) {
    return null;
  }

  return Math.round(stats.emaReaction);
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
  const lifetimeReaction = getAverageKeyReactionTime(key);

  return [
    `${formatKeyLabel(key)}: ${reactionTime} ms EMA`,
    `${lifetimeReaction} ms lifetime average`,
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
  const lifetimeAccuracy =
    attempts === 0 ? 0 : Math.round((stats.correct / attempts) * 100);
  const commonErrors = Object.entries(stats.errors)
    .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
    .slice(0, 3)
    .map(([wrongKey, count]) => `${formatKeyLabel(wrongKey)} ${count}`)
    .join(", ");

  return [
    `${formatKeyLabel(key)}: ${accuracy}% EMA accuracy`,
    `${lifetimeAccuracy}% lifetime (${stats.correct}/${attempts} correct)`,
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
  focusExponentInput.disabled = false;
  includeNonLettersInput.disabled = false;
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
focusExponentInput.addEventListener("input", () => {
  focusExponentValue.value = focusExponentInput.value;
  saveReactionSettings();
  targetDistribution = getTargetDistribution();
});
includeNonLettersInput.addEventListener("change", () => {
  saveReactionSettings();
  targetDistribution = getTargetDistribution();
});
clearReactionHistoryButton.addEventListener("click", () => {
  const confirmed = window.confirm(
    "Are you sure? This will permanently delete all reaction test history and per-key accuracy and reaction-time data.",
  );

  if (!confirmed) {
    return;
  }

  reactionHistory = [];
  reactionKeyStats = createEmptyKeyStats();
  saveReactionHistory();
  saveReactionKeyStats();
  renderReactionHistoryChart();
  renderReactionKeyboardStats();
  renderReactionTimeKeyboardStats();
});

resetReactionRun();
renderReactionKeyboardMarkup();
renderReactionTimeKeyboardMarkup();
renderReactionHistoryChart();
renderReactionKeyboardStats();
renderReactionTimeKeyboardStats();
