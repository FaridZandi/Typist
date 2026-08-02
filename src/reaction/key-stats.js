// Per-key accuracy and reaction-time records. Every function takes the stats
// object explicitly, so the maths behind the heatmaps can be exercised without
// a page. A wrong press counts against both keys involved: the one that should
// have been pressed and the one that actually was.

import { keyMetricAlpha } from "./config.js";

function createKeyRecord() {
  return {
    correct: 0,
    wrong: 0,
    errors: {},
    reactionSamples: 0,
    totalReaction: 0,
    emaAccuracy: null,
    emaReaction: null,
  };
}

export function createEmptyKeyStats(keys) {
  return Object.fromEntries(keys.map((key) => [key, createKeyRecord()]));
}

export function ensureKeyStats(stats, key) {
  if (!stats[key]) stats[key] = createKeyRecord();
}

function updateEmaAccuracy(stats, key, value) {
  const current = stats[key].emaAccuracy;
  stats[key].emaAccuracy = current === null || !Number.isFinite(current)
    ? value
    : keyMetricAlpha * value + (1 - keyMetricAlpha) * current;
}

function updateEmaReaction(stats, key, reactionTime) {
  const current = stats[key].emaReaction;
  stats[key].emaReaction = current === null || !Number.isFinite(current)
    ? reactionTime
    : keyMetricAlpha * reactionTime + (1 - keyMetricAlpha) * current;
}

export function recordKeyAttempt(stats, { targetKey, wasCorrect, typedKey, reactionTime = null }) {
  ensureKeyStats(stats, targetKey);
  updateEmaAccuracy(stats, targetKey, wasCorrect ? 1 : 0);

  if (wasCorrect) {
    stats[targetKey].correct += 1;
    if (Number.isFinite(reactionTime)) {
      stats[targetKey].reactionSamples += 1;
      stats[targetKey].totalReaction += reactionTime;
      updateEmaReaction(stats, targetKey, reactionTime);
    }
    return stats;
  }

  stats[targetKey].wrong += 1;
  stats[targetKey].errors[typedKey] = (stats[targetKey].errors[typedKey] ?? 0) + 1;

  if (typedKey !== targetKey && stats[typedKey]) {
    updateEmaAccuracy(stats, typedKey, 0);
    stats[typedKey].wrong += 1;
    stats[typedKey].errors[targetKey] = (stats[typedKey].errors[targetKey] ?? 0) + 1;
  }
  return stats;
}

export function getKeyAccuracy(stats, key) {
  const record = stats[key];
  if (!record) return null;
  const attempts = record.correct + record.wrong;
  if (attempts === 0) return null;
  return Math.round((record.correct / attempts) * 100);
}

export function getKeyEmaAccuracy(stats, key) {
  const record = stats[key];
  if (!record || !Number.isFinite(record.emaAccuracy)) return null;
  return Math.round(record.emaAccuracy * 100);
}

export function getAverageKeyReactionTime(stats, key) {
  const record = stats[key];
  if (!record || record.reactionSamples === 0 || record.totalReaction <= 0) return null;
  return Math.round(record.totalReaction / record.reactionSamples);
}

export function getKeyEmaReactionTime(stats, key) {
  const record = stats[key];
  if (!record || !Number.isFinite(record.emaReaction)) return null;
  return Math.round(record.emaReaction);
}
