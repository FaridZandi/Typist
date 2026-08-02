// Per-character heatmaps over the practice text. A character is only coloured
// once it has been attempted in enough runs to say anything; everything else
// stays explicitly untracked rather than guessing.

import { minimumCoverageRatio } from "../config.js";

function hasEnoughCoverage(character, stats) {
  return Boolean(stats.runs && character && character.attempts / stats.runs >= minimumCoverageRatio);
}

function getCoverageTitle(index, stats) {
  const character = stats.characters[index];
  if (!character || character.attempts === 0) return "No runs recorded for this character";
  return `${character.attempts}/${stats.runs} runs recorded; needs ${Math.ceil(stats.runs * minimumCoverageRatio)} for heatmap`;
}

export function getCharacterAccuracy(index, stats) {
  const character = stats.characters[index];
  if (!hasEnoughCoverage(character, stats)) return null;
  return Math.round(((character.attempts - character.mistakes) / character.attempts) * 100);
}

export function getAverageLetterWpm(index, stats) {
  const character = stats.characters[index];
  if (!hasEnoughCoverage(character, stats) || character.intervalSamples === 0 || character.totalIntervalMs <= 0) return null;
  return Math.round(12000 / (character.totalIntervalMs / character.intervalSamples));
}

export function getHeatmapColor(accuracy, lowestAccuracy, highestAccuracy) {
  if (highestAccuracy <= lowestAccuracy) return "hsl(120 68% 72%)";
  const normalized = (accuracy - lowestAccuracy) / (highestAccuracy - lowestAccuracy);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

export function getSpeedColor(speed, lowestSpeed, highestSpeed) {
  const normalized = highestSpeed <= lowestSpeed ? 1 : (speed - lowestSpeed) / (highestSpeed - lowestSpeed);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

export function isSpeedInBin(speed, bin, bins) {
  const last = bin === bins.at(-1);
  return last ? speed >= bin.min && speed <= bin.max : speed >= bin.min && speed < bin.max;
}

export function renderAccuracyHeatmap({ elements, document, text, stats }) {
  elements.heatmapDisplay.replaceChildren();
  elements.heatmapRuns.textContent = stats.runs;
  const accuracies = stats.characters.map((_, index) => getCharacterAccuracy(index, stats)).filter((value) => value !== null);
  const lowest = accuracies.length ? Math.min(...accuracies) : null;
  const highest = accuracies.length ? Math.max(...accuracies) : null;
  elements.accuracyLegendLowest.textContent = lowest === null ? "—" : `${lowest}%`;
  elements.accuracyLegendHighest.textContent = highest === null ? "—" : `${highest}%`;

  [...text.body].forEach((character, index) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = character;
    const accuracy = getCharacterAccuracy(index, stats);
    if (accuracy === null) {
      span.classList.add("untracked");
      span.title = getCoverageTitle(index, stats);
    } else {
      span.style.backgroundColor = getHeatmapColor(accuracy, lowest, highest);
      span.title = `${accuracy}% accuracy across ${stats.characters[index].attempts} attempts`;
    }
    elements.heatmapDisplay.append(span);
  });
}

export function renderSpeedHeatmap({ elements, document, text, stats }) {
  elements.speedChart.replaceChildren();
  const speeds = stats.characters.map((_, index) => getAverageLetterWpm(index, stats));
  const recorded = speeds.filter((speed) => speed !== null);
  const lowest = recorded.length ? Math.min(...recorded) : null;
  const highest = recorded.length ? Math.max(...recorded) : null;
  elements.speedLegendLowest.textContent = lowest === null ? "—" : `${lowest} WPM`;
  elements.speedLegendHighest.textContent = highest === null ? "—" : `${highest} WPM`;

  [...text.body].forEach((character, index) => {
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
    elements.speedChart.append(span);
  });
}

// Hovering a histogram bin dims every character outside that speed range.
export function renderLastRunHeatmap({ elements, document, samples, bins, activeBinIndex = null }) {
  elements.lastRunHeatmap.replaceChildren();
  const speeds = samples.map((sample) => sample.speed).filter((speed) => speed !== null);
  const low = Math.min(...speeds, 0);
  const high = Math.max(...speeds, 1);
  const activeBin = activeBinIndex === null ? null : bins[activeBinIndex];

  samples.forEach((sample) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = sample.char;
    if (sample.speed === null) {
      span.classList.add("untracked");
      span.title = `${sample.char === " " ? "space" : sample.char}: no speed data`;
    } else if (activeBin && !isSpeedInBin(sample.speed, activeBin, bins)) {
      span.classList.add("untracked");
      span.title = `${sample.char}: ${sample.speed} WPM`;
    } else {
      span.style.backgroundColor = getSpeedColor(sample.speed, low, high);
      span.title = `${sample.char}: ${sample.speed} WPM`;
    }
    elements.lastRunHeatmap.append(span);
  });
}
