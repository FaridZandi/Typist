// Per-key heatmaps over the Dvorak schematic. Both keyboards colour relative to
// the range actually recorded, and a key with no attempts stays explicitly
// untracked instead of being coloured as if it were perfect.

import { formatKeyboardKeyLabel } from "../../shared/keyboard-layout.js";
import {
  getAverageKeyReactionTime,
  getKeyAccuracy,
  getKeyEmaAccuracy,
  getKeyEmaReactionTime,
} from "../key-stats.js";

export function getKeyAccuracyColor(accuracy, lowestAccuracy, highestAccuracy) {
  if (highestAccuracy <= lowestAccuracy) {
    return `hsl(${Math.round((accuracy / 100) * 120)} 68% 72%)`;
  }
  const normalized = (accuracy - lowestAccuracy) / (highestAccuracy - lowestAccuracy);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalized)) * 120)} 68% 72%)`;
}

export function getReactionTimeColor(reactionTime, fastestReaction, slowestReaction) {
  if (slowestReaction <= fastestReaction) return "hsl(120 68% 72%)";
  const normalizedSpeed = 1 - (reactionTime - fastestReaction) / (slowestReaction - fastestReaction);
  return `hsl(${Math.round(Math.max(0, Math.min(1, normalizedSpeed)) * 120)} 68% 72%)`;
}

// Each title states the metric on show and the one it is not, so switching
// modes never hides the other number.
export function getKeyAccuracyTitle(keyStats, key, accuracy, metricMode) {
  const record = keyStats[key];
  const attempts = record.correct + record.wrong;
  const emaAccuracy = getKeyEmaAccuracy(keyStats, key);
  const lifetimeAccuracy = attempts === 0 ? 0 : Math.round((record.correct / attempts) * 100);
  const primaryLabel = metricMode === "lifetime" ? "lifetime" : "EMA";
  const comparison = metricMode === "lifetime"
    ? emaAccuracy === null ? "EMA: no data" : `${emaAccuracy}% EMA accuracy`
    : `${lifetimeAccuracy}% lifetime (${record.correct}/${attempts} correct)`;
  const commonErrors = Object.entries(record.errors)
    .sort(([, first], [, second]) => second - first)
    .slice(0, 3)
    .map(([wrongKey, count]) => `${formatKeyboardKeyLabel(wrongKey)} ${count}`)
    .join(", ");

  return [
    `${formatKeyboardKeyLabel(key)}: ${accuracy}% ${primaryLabel} accuracy`,
    comparison,
    commonErrors ? `Errors: ${commonErrors}` : "Errors: none",
  ].join(" | ");
}

export function getKeyReactionTimeTitle(keyStats, key, reactionTime, metricMode) {
  const record = keyStats[key];
  const emaReaction = getKeyEmaReactionTime(keyStats, key);
  const lifetimeReaction = getAverageKeyReactionTime(keyStats, key);
  const primaryLabel = metricMode === "lifetime" ? "lifetime average" : "EMA";
  const comparison = metricMode === "lifetime"
    ? emaReaction === null ? "EMA: no data" : `${emaReaction} ms EMA`
    : `${lifetimeReaction} ms lifetime average`;

  return [
    `${formatKeyboardKeyLabel(key)}: ${reactionTime} ms ${primaryLabel}`,
    comparison,
    `${record.reactionSamples} correct samples`,
  ].join(" | ");
}

function paint(keyElements, datasetName, read, colorFor, titleFor, emptyTitle) {
  keyElements.forEach((keyElement) => {
    const key = keyElement.dataset[datasetName];
    const value = read(key);

    keyElement.style.removeProperty("background-color");
    keyElement.classList.remove("key-untracked");

    if (value === null) {
      keyElement.classList.add("key-untracked");
      keyElement.title = `${formatKeyboardKeyLabel(key)}: ${emptyTitle}`;
      return;
    }

    keyElement.style.backgroundColor = colorFor(value);
    keyElement.title = titleFor(key, value);
  });
}

export function renderAccuracyKeyboard({ keyElements, keyStats, targetLetters, metricMode }) {
  const read = (key) => (metricMode === "lifetime" ? getKeyAccuracy : getKeyEmaAccuracy)(keyStats, key);
  const recorded = targetLetters.map(read).filter((value) => value !== null);
  const lowest = Math.min(...recorded, 100);
  const highest = Math.max(...recorded, 100);

  paint(
    keyElements,
    "key",
    read,
    (accuracy) => getKeyAccuracyColor(accuracy, lowest, highest),
    (key, accuracy) => getKeyAccuracyTitle(keyStats, key, accuracy, metricMode),
    "no attempts yet",
  );
}

export function renderReactionTimeKeyboard({ keyElements, keyStats, targetLetters, metricMode }) {
  const read = (key) => (metricMode === "lifetime" ? getAverageKeyReactionTime : getKeyEmaReactionTime)(keyStats, key);
  const recorded = targetLetters.map(read).filter((value) => value !== null);
  const fastest = recorded.length === 0 ? 0 : Math.min(...recorded);
  const slowest = recorded.length === 0 ? 0 : Math.max(...recorded);

  paint(
    keyElements,
    "timeKey",
    read,
    (reactionTime) => getReactionTimeColor(reactionTime, fastest, slowest),
    (key, reactionTime) => getKeyReactionTimeTitle(keyStats, key, reactionTime, metricMode),
    "no reaction time yet",
  );
}
