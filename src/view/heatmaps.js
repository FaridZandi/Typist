// Per-character colouring of the practice text. Each builder turns statistics
// into a list of cells, and one painter puts them on the passage — so the
// result screen shows a single passage that changes what it encodes, rather
// than one passage per metric.
//
// A character is only coloured once it has been attempted in enough runs to
// mean anything; everything else stays explicitly untracked.

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

const describe = (character) => (character === " " ? "space" : character);

// Accuracy across every recorded run of this text.
export function buildAccuracyCells(text, stats) {
  const values = stats.characters.map((_, index) => getCharacterAccuracy(index, stats)).filter((value) => value !== null);
  const lowest = values.length ? Math.min(...values) : null;
  const highest = values.length ? Math.max(...values) : null;

  const cells = [...text.body].map((character, index) => {
    const accuracy = getCharacterAccuracy(index, stats);
    if (accuracy === null) return { char: character, color: null, title: `${describe(character)}: ${getCoverageTitle(index, stats)}` };
    return {
      char: character,
      color: getHeatmapColor(accuracy, lowest, highest),
      title: `${accuracy}% accuracy across ${stats.characters[index].attempts} attempts`,
    };
  });

  return { cells, lowest: lowest === null ? "—" : `${lowest}%`, highest: highest === null ? "—" : `${highest}%` };
}

// Average letter speed across every recorded run of this text.
export function buildAllSpeedCells(text, stats) {
  const speeds = stats.characters.map((_, index) => getAverageLetterWpm(index, stats));
  const recorded = speeds.filter((speed) => speed !== null);
  const lowest = recorded.length ? Math.min(...recorded) : null;
  const highest = recorded.length ? Math.max(...recorded) : null;

  const cells = [...text.body].map((character, index) => {
    const speed = speeds[index];
    if (speed === null) return { char: character, color: null, title: `${describe(character)}: ${getCoverageTitle(index, stats)}` };
    return {
      char: character,
      color: getSpeedColor(speed, lowest, highest),
      title: `${describe(character)}: ${speed} WPM average`,
    };
  });

  return { cells, lowest: lowest === null ? "—" : `${lowest} WPM`, highest: highest === null ? "—" : `${highest} WPM` };
}

// Letter speed for the run that just finished. Hovering a histogram bin dims
// every character outside that speed range.
export function buildRunSpeedCells(samples, bins, activeBinIndex = null) {
  const speeds = samples.map((sample) => sample.speed).filter((speed) => speed !== null);
  const low = Math.min(...speeds, 0);
  const high = Math.max(...speeds, 1);
  const activeBin = activeBinIndex === null ? null : bins[activeBinIndex];

  const cells = samples.map((sample) => {
    if (sample.speed === null) return { char: sample.char, color: null, title: `${describe(sample.char)}: no speed data` };
    if (activeBin && !isSpeedInBin(sample.speed, activeBin, bins)) {
      return { char: sample.char, color: null, title: `${describe(sample.char)}: ${sample.speed} WPM` };
    }
    return {
      char: sample.char,
      color: getSpeedColor(sample.speed, low, high),
      title: `${describe(sample.char)}: ${sample.speed} WPM`,
    };
  });

  return {
    cells,
    lowest: speeds.length ? `${Math.min(...speeds)} WPM` : "—",
    highest: speeds.length ? `${Math.max(...speeds)} WPM` : "—",
  };
}

export function paintHeatmapCells(target, document, cells) {
  target.replaceChildren();
  cells.forEach((cell) => {
    const span = document.createElement("span");
    span.className = "heatmap-char";
    span.textContent = cell.char;
    if (cell.color === null) span.classList.add("untracked");
    else span.style.backgroundColor = cell.color;
    span.title = cell.title;
    target.append(span);
  });
}
