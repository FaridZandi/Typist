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
const minimumCoverageRatio = 0.5;
const speedSmoothingPreviousLetters = 5;

const textDisplay = document.querySelector("#textDisplay");
const typingInput = document.querySelector("#typingInput");
const restartButton = document.querySelector("#restartButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const speedValue = document.querySelector("#speedValue");
const accuracyValue = document.querySelector("#accuracyValue");
const consistencyValue = document.querySelector("#consistencyValue");
const scoreValue = document.querySelector("#scoreValue");
const resultPanel = document.querySelector("#resultPanel");
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
let progressChart = null;
let tradeoffChart = null;
let lastRunHistogram = null;
let lastRunSpeeds = [];
let lastRunHistogramBins = [];

function createEmptyHeatmapStats() {
  return {
    runs: 0,
    runHistory: [],
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
      savedStats.runHistory = Array.isArray(savedStats.runHistory)
        ? savedStats.runHistory
            .filter(
              (run) =>
                typeof run.completedAt === "string" &&
                Number.isFinite(run.wordsPerMinute) &&
                Number.isFinite(run.accuracy) &&
                Number.isFinite(run.consistency),
            )
            .map((run) => ({
              ...run,
              typingScore: Number.isFinite(run.typingScore)
                ? run.typingScore
                : getTypingScore(
                    run.wordsPerMinute,
                    run.accuracy,
                    run.consistency,
                  ),
            }))
        : [];

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
  const alignment = getTypingAlignment(typedText);
  const comparisonByPromptIndex = getLatestComparisonByPromptIndex(alignment);
  const skippedPromptIndices = new Set(alignment.skippedPromptIndices);

  [...promptText].forEach((char, index) => {
    const span = document.createElement("span");
    const comparison = comparisonByPromptIndex.get(index);
    span.textContent = char;
    span.className = "char";

    if (comparison) {
      if (!comparison.isCorrect) {
        span.classList.add("incorrect");
      } else if (runMistakes.has(index)) {
        span.classList.add("corrected");
      } else {
        span.classList.add("correct");
      }
    } else if (skippedPromptIndices.has(index)) {
      span.classList.add("incorrect");
    } else if (index === alignment.nextPromptIndex && !finished) {
      span.classList.add("current");
    }

    textDisplay.append(span);
  });
}

function getTypingAlignment(typedText) {
  const comparisons = [];
  const skippedPromptIndices = new Set();
  let promptIndex = 0;

  [...typedText].forEach((typedChar, typedIndex) => {
    if (promptIndex >= promptText.length) {
      return;
    }

    if (typedChar === " ") {
      const nextSpaceIndex = promptText.indexOf(" ", promptIndex);

      if (nextSpaceIndex !== -1) {
        for (let index = promptIndex; index < nextSpaceIndex; index += 1) {
          skippedPromptIndices.add(index);
        }

        promptIndex = nextSpaceIndex;
      }
    }

    const expectedChar = promptText[promptIndex];

    comparisons.push({
      typedIndex,
      promptIndex,
      typedChar,
      expectedChar,
      isCorrect: typedChar === expectedChar,
    });

    promptIndex += 1;
  });

  return {
    comparisons,
    skippedPromptIndices: [...skippedPromptIndices],
    nextPromptIndex: Math.min(promptIndex, promptText.length),
  };
}

function getLatestComparisonByPromptIndex(alignment) {
  return new Map(
    alignment.comparisons.map((comparison) => [
      comparison.promptIndex,
      comparison,
    ]),
  );
}

function getCharacterAccuracy(index) {
  const stats = heatmapStats.characters[index];

  if (!hasEnoughCoverage(stats)) {
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
    .filter((stats) => hasEnoughCoverage(stats))
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
      span.title = getCoverageTitle(index);
    } else {
      span.style.backgroundColor = getHeatmapColor(accuracy, lowestAccuracy);
      span.title = `${accuracy}% accuracy across ${heatmapStats.characters[index].attempts} attempts`;
    }

    heatmapDisplay.append(span);
  });
}

function getAverageLetterWpm(index) {
  const stats = heatmapStats.characters[index];

  if (
    !hasEnoughCoverage(stats) ||
    stats.intervalSamples === 0 ||
    stats.totalIntervalMs <= 0
  ) {
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
      span.title = `${displayChar}: ${getCoverageTitle(index)}`;
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

function renderProgressChart() {
  if (!window.Chart || !progressChartCanvas) {
    return;
  }

  const chartData = {
    datasets: [
      {
        label: "Speed (WPM)",
        data: heatmapStats.runHistory.map((run, index) => ({
          x: index + 1,
          y: run.wordsPerMinute,
        })),
        borderColor: "#0f766e",
        backgroundColor: "rgba(15, 118, 110, 0.12)",
        tension: 0.25,
        parsing: false,
        hidden: true,
        yAxisID: "wpm",
      },
      {
        label: "Accuracy (%)",
        data: heatmapStats.runHistory.map((run, index) => ({
          x: index + 1,
          y: run.accuracy,
        })),
        borderColor: "#15803d",
        backgroundColor: "rgba(21, 128, 61, 0.12)",
        tension: 0.25,
        parsing: false,
        hidden: true,
        yAxisID: "percent",
      },
      {
        label: "Consistency (%)",
        data: heatmapStats.runHistory.map((run, index) => ({
          x: index + 1,
          y: run.consistency,
        })),
        borderColor: "#c62828",
        backgroundColor: "rgba(198, 40, 40, 0.12)",
        tension: 0.25,
        parsing: false,
        hidden: true,
        yAxisID: "percent",
      },
      {
        label: "Typing score",
        data: heatmapStats.runHistory.map((run, index) => ({
          x: index + 1,
          y: run.typingScore,
        })),
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124, 58, 237, 0.12)",
        tension: 0.25,
        parsing: false,
        yAxisID: "score",
      },
    ],
  };

  if (progressChart) {
    progressChart.data = chartData;
    progressChart.update();
    return;
  }

  progressChart = new Chart(progressChartCanvas, {
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
              const run = heatmapStats.runHistory[items[0].dataIndex];

              return formatChartTimestamp(new Date(run.completedAt).getTime());
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
            maxRotation: 45,
            minRotation: 0,
          },
        },
        wpm: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          title: {
            display: true,
            text: "WPM",
          },
        },
        percent: {
          type: "linear",
          position: "left",
          beginAtZero: true,
          max: 100,
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: "Percent",
          },
        },
        score: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: "Score",
          },
        },
      },
    },
  });
}

function renderTradeoffChart() {
  if (!window.Chart || !tradeoffChartCanvas) {
    return;
  }

  const runs = heatmapStats.runHistory;
  const newestRunIndex = runs.length - 1;
  const speedBounds = getPaddedBounds(runs.map((run) => run.wordsPerMinute));
  const consistencyBounds = getPaddedBounds(
    runs.map((run) => run.consistency),
    0,
    100,
  );
  const chartData = {
    datasets: [
      {
        label: "Completed runs",
        data: runs.map((run, index) => ({
          x: run.wordsPerMinute,
          y: run.consistency,
          testNumber: index + 1,
          completedAt: run.completedAt,
          accuracy: run.accuracy,
          typingScore: run.typingScore,
        })),
        borderColor: "rgba(97, 112, 128, 0.45)",
        borderWidth: 2,
        pointBackgroundColor: runs.map((_, index) =>
          getTradeoffPointColor(index, newestRunIndex),
        ),
        pointBorderColor: runs.map((_, index) =>
          index === newestRunIndex
            ? "#111827"
            : getTradeoffPointColor(index, newestRunIndex),
        ),
        pointBorderWidth: runs.map((_, index) =>
          index === newestRunIndex ? 4 : 1,
        ),
        fill: false,
        showLine: true,
        tension: 0.2,
        pointRadius: runs.map((_, index) => (index === newestRunIndex ? 8 : 5)),
        pointHoverRadius: runs.map((_, index) =>
          index === newestRunIndex ? 10 : 7,
        ),
      },
    ],
  };

  if (tradeoffChart) {
    tradeoffChart.data = chartData;
    tradeoffChart.options.scales.x.min = speedBounds.min;
    tradeoffChart.options.scales.x.max = speedBounds.max;
    tradeoffChart.options.scales.y.min = consistencyBounds.min;
    tradeoffChart.options.scales.y.max = consistencyBounds.max;
    tradeoffChart.update();
    return;
  }

  tradeoffChart = new Chart(tradeoffChartCanvas, {
    type: "scatter",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title(items) {
              return `Test ${items[0].raw.testNumber}`;
            },
            label(item) {
              return [
                `Speed: ${item.raw.x} WPM`,
                `Consistency: ${item.raw.y}%`,
                `Accuracy: ${item.raw.accuracy}%`,
                `Score: ${item.raw.typingScore}`,
              ];
            },
            afterLabel(item) {
              return formatChartTimestamp(
                new Date(item.raw.completedAt).getTime(),
              );
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: speedBounds.min,
          max: speedBounds.max,
          title: {
            display: true,
            text: "Typing speed (WPM)",
          },
        },
        y: {
          min: consistencyBounds.min,
          max: consistencyBounds.max,
          title: {
            display: true,
            text: "Consistency (%)",
          },
        },
      },
    },
  });
}

function getTradeoffPointColor(index, newestRunIndex) {
  if (newestRunIndex < 0) {
    return "rgba(15, 118, 110, 0.72)";
  }

  if (index === newestRunIndex) {
    return "#f3c74f";
  }

  if (newestRunIndex === 0) {
    return "rgba(15, 118, 110, 0.72)";
  }

  const ageRatio = index / newestRunIndex;
  const hue = 210 - ageRatio * 160;

  return `hsl(${hue} 72% 48%)`;
}

function getPaddedBounds(values, hardMin = null, hardMax = null) {
  const finiteValues = removeBoundOutliers(
    values.filter((value) => Number.isFinite(value)),
  );

  if (finiteValues.length === 0) {
    return {
      min: hardMin ?? 0,
      max: hardMax ?? 100,
    };
  }

  const lowestValue = Math.min(...finiteValues);
  const highestValue = Math.max(...finiteValues);
  const range = highestValue - lowestValue;
  const padding = range === 0 ? Math.max(1, highestValue * 0.1) : range * 0.12;
  const min =
    hardMin === null ? lowestValue - padding : Math.max(hardMin, lowestValue - padding);
  const max =
    hardMax === null
      ? highestValue + padding
      : Math.min(hardMax, highestValue + padding);

  if (min === max) {
    return {
      min: hardMin ?? min - 1,
      max: hardMax ?? max + 1,
    };
  }

  return { min, max };
}

function removeBoundOutliers(values) {
  if (values.length < 5) {
    return values;
  }

  const sortedValues = [...values].sort((first, second) => first - second);
  const firstQuartile = getQuantile(sortedValues, 0.25);
  const thirdQuartile = getQuantile(sortedValues, 0.75);
  const interquartileRange = thirdQuartile - firstQuartile;

  if (interquartileRange === 0) {
    return values;
  }

  const lowerFence = firstQuartile - interquartileRange * 1.5;
  const upperFence = thirdQuartile + interquartileRange * 1.5;
  const filteredValues = values.filter(
    (value) => value >= lowerFence && value <= upperFence,
  );

  return filteredValues.length > 0 ? filteredValues : values;
}

function getQuantile(sortedValues, quantile) {
  const position = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  );
}

function renderLastRunResults(smoothedRunIntervals) {
  lastRunSpeeds = getRunSpeedData(smoothedRunIntervals);
  lastRunHistogramBins = getSpeedHistogramBins(lastRunSpeeds);

  renderLastRunHeatmap();
  renderLastRunHistogram();
}

function getRunSpeedData(intervals) {
  return [...promptText].map((char, index) => {
    const intervalMs = intervals.get(index);

    if (!intervalMs || intervalMs <= 0) {
      return {
        char,
        index,
        speed: null,
      };
    }

    return {
      char,
      index,
      speed: Math.round(12000 / intervalMs),
    };
  });
}

function renderLastRunHeatmap(activeBinIndex = null) {
  lastRunHeatmap.replaceChildren();

  const speeds = lastRunSpeeds
    .map((sample) => sample.speed)
    .filter((speed) => speed !== null);
  const lowestSpeed = Math.min(...speeds, 0);
  const highestSpeed = Math.max(...speeds, 1);
  const activeBin =
    activeBinIndex === null ? null : lastRunHistogramBins[activeBinIndex];

  lastRunSpeeds.forEach((sample) => {
    const span = document.createElement("span");
    const displayChar = sample.char === " " ? "space" : sample.char;

    span.textContent = sample.char;
    span.className = "heatmap-char";

    if (sample.speed === null) {
      span.classList.add("untracked");
      span.title = `${displayChar}: no speed data`;
    } else if (activeBin && !isSpeedInBin(sample.speed, activeBin)) {
      span.classList.add("untracked");
      span.title = `${displayChar}: ${sample.speed} WPM`;
    } else {
      span.style.backgroundColor = getSpeedColor(
        sample.speed,
        lowestSpeed,
        highestSpeed,
      );
      span.title = `${displayChar}: ${sample.speed} WPM`;
    }

    lastRunHeatmap.append(span);
  });
}

function getSpeedHistogramBins(speedSamples) {
  const speeds = speedSamples
    .map((sample) => sample.speed)
    .filter((speed) => speed !== null);

  if (speeds.length === 0) {
    return [];
  }

  const lowestSpeed = Math.min(...speeds);
  const highestSpeed = Math.max(...speeds);

  if (lowestSpeed === highestSpeed) {
    return [
      {
        min: lowestSpeed,
        max: highestSpeed,
        count: speeds.length,
      },
    ];
  }

  const binCount = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(speeds.length))));
  const range = highestSpeed - lowestSpeed;
  const binSize = range / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => {
    const min = lowestSpeed + index * binSize;
    const max =
      index === binCount - 1 ? highestSpeed : lowestSpeed + (index + 1) * binSize;

    return {
      min,
      max,
      count: 0,
    };
  });

  speeds.forEach((speed) => {
    const binIndex = Math.min(
      bins.length - 1,
      Math.floor((speed - lowestSpeed) / binSize),
    );

    bins[binIndex].count += 1;
  });

  return bins;
}

function isSpeedInBin(speed, bin) {
  const isLastBin = bin === lastRunHistogramBins[lastRunHistogramBins.length - 1];

  return isLastBin
    ? speed >= bin.min && speed <= bin.max
    : speed >= bin.min && speed < bin.max;
}

function formatSpeedRange(bin) {
  if (bin.min === bin.max) {
    return String(Math.round(bin.min));
  }

  return `${Math.round(bin.min)}-${Math.round(bin.max)}`;
}

function renderLastRunHistogram() {
  if (!window.Chart || !lastRunHistogramCanvas) {
    return;
  }

  const chartData = {
    labels: lastRunHistogramBins.map((bin) => formatSpeedRange(bin)),
    datasets: [
      {
        label: "Letters",
        data: lastRunHistogramBins.map((bin) => bin.count),
        backgroundColor: "rgba(15, 118, 110, 0.72)",
        borderColor: "#0f766e",
        borderWidth: 1,
        barPercentage: 1,
        categoryPercentage: 1,
      },
    ],
  };

  if (lastRunHistogram) {
    lastRunHistogram.data = chartData;
    lastRunHistogram.update();
    return;
  }

  lastRunHistogram = new Chart(lastRunHistogramCanvas, {
    type: "bar",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: true,
        mode: "nearest",
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title(items) {
              const bin = lastRunHistogramBins[items[0].dataIndex];

              return `${formatSpeedRange(bin)} WPM`;
            },
            label(item) {
              return `${item.parsed.y} letters`;
            },
          },
        },
      },
      onHover(event, elements) {
        if (elements.length === 0) {
          renderLastRunHeatmap();
          return;
        }

        renderLastRunHeatmap(elements[0].index);
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Letter speed range (WPM)",
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
          title: {
            display: true,
            text: "Letters",
          },
        },
      },
    },
  });
}

function formatChartTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hasEnoughCoverage(stats) {
  if (!stats || heatmapStats.runs === 0) {
    return false;
  }

  return stats.attempts / heatmapStats.runs >= minimumCoverageRatio;
}

function getCoverageTitle(index) {
  const stats = heatmapStats.characters[index];

  if (!stats || stats.attempts === 0) {
    return "No runs recorded for this character";
  }

  const requiredAttempts = Math.ceil(heatmapStats.runs * minimumCoverageRatio);

  return `${stats.attempts}/${heatmapStats.runs} runs recorded; needs ${requiredAttempts} for heatmap`;
}

function recordCurrentMistakes() {
  const alignment = getTypingAlignment(typingInput.value);

  alignment.skippedPromptIndices.forEach((promptIndex) => {
    runAttempts.add(promptIndex);
    runMistakes.add(promptIndex);
  });

  alignment.comparisons.forEach((comparison) => {
    runAttempts.add(comparison.promptIndex);

    if (!comparison.isCorrect) {
      runMistakes.add(comparison.promptIndex);
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
  const alignment = getTypingAlignment(typingInput.value);
  const latestComparison = alignment.comparisons.at(-1);

  if (
    latestComparison &&
    latestComparison.typedIndex === index &&
    latestComparison.promptIndex > 0 &&
    previousLetterTime !== null
  ) {
    runIntervals.set(latestComparison.promptIndex, now - previousLetterTime);
  }

  previousLetterTime = now;
  previousTypedLength = typedLength;
}

function getMetrics() {
  const alignment = getTypingAlignment(typingInput.value);
  const alignedAttemptCount =
    getLatestComparisonByPromptIndex(alignment).size +
    alignment.skippedPromptIndices.length;
  const attemptedCharacters = runAttempts.size || alignedAttemptCount;
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
  const consistency = getRunConsistency(runIntervals);
  speedValue.textContent = wordsPerMinute;
  accuracyValue.textContent = accuracy;
  consistencyValue.textContent = consistency;
  scoreValue.textContent = getTypingScore(wordsPerMinute, accuracy, consistency);
  updateTimerProgress();
}

function getTypingScore(wordsPerMinute, accuracy, consistency) {
  return Math.round(wordsPerMinute * (accuracy / 100) + consistency);
}

function updateTimerProgress() {
  const elapsedSeconds = runLengthSeconds - secondsLeft;
  const elapsedRatio = elapsedSeconds / runLengthSeconds;
  const elapsedPercent = Math.max(0, Math.min(100, elapsedRatio * 100));

  timerProgressFill.style.setProperty("--progress-width", `${elapsedPercent}%`);
  timerProgress.setAttribute("aria-valuenow", String(elapsedSeconds));
}

function finishRun() {
  if (finished) return;

  finished = true;
  clearInterval(timerId);
  timerId = null;
  recordCurrentMistakes();
  const smoothedRunIntervals = getSmoothedRunIntervals();
  resultPanel.hidden = false;
  renderLastRunResults(smoothedRunIntervals);
  commitRunToHeatmap(smoothedRunIntervals);
  typingInput.disabled = true;
  renderPrompt(typingInput.value);
  updateStats();

  const { wordsPerMinute, accuracy } = getMetrics();
  const consistency = getRunConsistency(runIntervals);
  finalSpeed.textContent = wordsPerMinute;
  finalAccuracy.textContent = accuracy;
  finalScore.textContent = getTypingScore(wordsPerMinute, accuracy, consistency);
}

function commitRunToHeatmap(smoothedRunIntervals = getSmoothedRunIntervals()) {
  const { wordsPerMinute, accuracy } = getMetrics();
  const consistency = getRunConsistency(runIntervals);
  const typingScore = getTypingScore(wordsPerMinute, accuracy, consistency);

  runAttempts.forEach((index) => {
    if (!heatmapStats.characters[index]) return;

    heatmapStats.characters[index].attempts += 1;

    if (runMistakes.has(index)) {
      heatmapStats.characters[index].mistakes += 1;
    }
  });

  smoothedRunIntervals.forEach((intervalMs, index) => {
    if (!heatmapStats.characters[index] || intervalMs <= 0) return;

    heatmapStats.characters[index].intervalSamples += 1;
    heatmapStats.characters[index].totalIntervalMs += intervalMs;
  });

  heatmapStats.runHistory.push({
    completedAt: new Date().toISOString(),
    wordsPerMinute,
    accuracy,
    consistency,
    typingScore,
  });
  heatmapStats.runs += 1;
  saveHeatmapStats();
  renderHeatmap();
  renderSpeedChart();
  renderProgressChart();
  renderTradeoffChart();
}

function getSmoothedRunIntervals() {
  const smoothedIntervals = new Map();
  const sortedIntervals = [...runIntervals.entries()].sort(
    ([firstIndex], [secondIndex]) => firstIndex - secondIndex,
  );

  sortedIntervals.forEach(([index]) => {
    const windowStart = Math.max(1, index - speedSmoothingPreviousLetters);
    const windowIntervals = [];

    for (let windowIndex = windowStart; windowIndex <= index; windowIndex += 1) {
      const intervalMs = runIntervals.get(windowIndex);

      if (intervalMs !== undefined) {
        windowIntervals.push(intervalMs);
      }
    }

    if (windowIntervals.length > 0) {
      const totalIntervalMs = windowIntervals.reduce(
        (total, intervalMs) => total + intervalMs,
        0,
      );

      smoothedIntervals.set(index, totalIntervalMs / windowIntervals.length);
    }
  });

  return smoothedIntervals;
}

function getRunConsistency(intervals) {
  const values = [...intervals.values()].filter((intervalMs) => intervalMs > 0);

  if (values.length < 2) {
    return 100;
  }

  const mean =
    values.reduce((total, intervalMs) => total + intervalMs, 0) / values.length;
  const variance =
    values.reduce(
      (total, intervalMs) => total + (intervalMs - mean) ** 2,
      0,
    ) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = standardDeviation / mean;

  return Math.round(
    Math.max(0, Math.min(100, (1 - coefficientOfVariation) * 100)),
  );
}

function startTimer(now) {
  if (started) return;

  started = true;
  timerId = setInterval(() => {
    secondsLeft -= 1;
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
  speedValue.textContent = "0";
  accuracyValue.textContent = "100";
  consistencyValue.textContent = "100";
  scoreValue.textContent = "100";
  updateTimerProgress();
  resultPanel.hidden = true;
  lastRunSpeeds = [];
  lastRunHistogramBins = [];
  lastRunHeatmap.replaceChildren();
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

  if (
    getTypingAlignment(typingInput.value).nextPromptIndex === promptText.length
  ) {
    finishRun();
  }
});

restartButton.addEventListener("click", resetRun);

clearHistoryButton.addEventListener("click", () => {
  heatmapStats = createEmptyHeatmapStats();
  saveHeatmapStats();
  renderHeatmap();
  renderSpeedChart();
  renderProgressChart();
  renderTradeoffChart();
});

lastRunHistogramCanvas.addEventListener("mouseleave", () => {
  renderLastRunHeatmap();
});

resetRun();
renderHeatmap();
renderSpeedChart();
renderProgressChart();
renderTradeoffChart();
