// Run-level reaction metrics.

export function getAverageReactionTime(reactionTimes) {
  if (reactionTimes.length === 0) return 0;
  return Math.round(reactionTimes.reduce((total, value) => total + value, 0) / reactionTimes.length);
}

export function getReactionAccuracy(hits, errors) {
  const attempts = hits + errors;
  if (attempts === 0) return 100;
  return Math.round((hits / attempts) * 100);
}

export function getBestReactionTime(reactionTimes) {
  return reactionTimes.length === 0 ? 0 : Math.round(Math.min(...reactionTimes));
}

export function getPercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, index)]);
}
