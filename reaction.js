const reactionRunLengthSeconds = 60;
const reactionHistoryStorageKey = "typist-reaction-history";
const targetLetters = "abcdefghijklmnopqrstuvwxyz".split("");

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
let reactionHistoryChart = null;

function startReactionRun() {
  resetReactionRun();
  running = true;
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
  targetLetter.textContent = currentTarget.toUpperCase();
  targetLetter.classList.remove("target-error", "target-correct");
  typedKeyDisplay.textContent = "-";
  typedKeyDisplay.classList.remove("typed-key-error", "typed-key-correct");
  targetShownAt = performance.now();
}

function getRandomLetter() {
  let nextLetter = currentTarget;

  while (nextLetter === currentTarget && targetLetters.length > 1) {
    nextLetter =
      targetLetters[Math.floor(Math.random() * targetLetters.length)];
  }

  return nextLetter;
}

function handleKeyPress(event) {
  if (!running || finished || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.key === "Escape") {
    finishReactionRun();
    return;
  }

  if (event.key.length !== 1 || !/^[a-z]$/i.test(event.key)) {
    return;
  }

  event.preventDefault();

  const typedKey = event.key.toLowerCase();
  typedKeyDisplay.textContent = typedKey.toUpperCase();

  if (typedKey !== currentTarget) {
    errors += 1;
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
  reactionTimes.push(performance.now() - targetShownAt);
  typedKeyDisplay.classList.add("typed-key-correct");
  targetLetter.classList.add("target-correct");
  reactionStatus.textContent = "Correct.";
  updateStats();

  window.setTimeout(() => {
    if (!running || finished) return;

    showNextTarget();
  }, 120);
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
  saveReactionHistory();
  renderReactionHistoryChart();
});

resetReactionRun();
renderReactionHistoryChart();
