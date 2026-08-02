// Progress states over a series of runs. A single good run is never treated as
// proof: an improvement only becomes "retained" once it survives a spaced
// follow-up, and anything thinner than two full windows stays "learning".

import { feedbackDerivationVersion, progressWindowSize, retainedImprovementSpacingMs } from "./config.js";
import { getRunTransitions } from "./aggregates.js";

export function getProgressStateFromMeasurements(measurements) {
  const normalized = measurements.map((measurement) => ({
    ...measurement,
    completedAt: typeof measurement.completedAt === "number" ? measurement.completedAt : Date.parse(measurement.completedAt),
  })).filter((measurement) => Number.isFinite(measurement.completedAt) && Number.isFinite(measurement.speed)).sort((left, right) => left.completedAt - right.completedAt);
  const average = (items, key) => items.reduce((sum, item) => sum + item[key], 0) / items.length;
  const sourceTextIds = [...new Set(normalized.map((measurement) => measurement.textId).filter(Boolean))];
  const base = { sampleCount: normalized.length, sourceTextIds, derivationVersion: feedbackDerivationVersion };
  if (normalized.length < progressWindowSize * 2) return { state: "learning", ...base };
  const baseline = normalized.slice(0, progressWindowSize);
  const improvement = normalized.slice(progressWindowSize, progressWindowSize * 2);
  const baselineSpeed = average(baseline, "speed");
  const improvementSpeed = average(improvement, "speed");
  const improved = improvementSpeed >= baselineSpeed * 1.08;
  if (!improved) return { state: "learning", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
  if (normalized.length < progressWindowSize * 3) return { state: "recent-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
  const followUp = normalized.slice(-progressWindowSize);
  const followUpSpeed = average(followUp, "speed");
  const spaced = followUp[0].completedAt - improvement.at(-1).completedAt >= retainedImprovementSpacingMs;
  if (spaced && followUpSpeed >= baselineSpeed * 1.08) return { state: "retained-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(followUpSpeed) };
  if (spaced && followUpSpeed < baselineSpeed * 0.95) return { state: "needs-refresh", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(followUpSpeed) };
  return { state: "recent-improvement", ...base, baselineSpeed: Math.round(baselineSpeed), recentSpeed: Math.round(improvementSpeed) };
}

export function getProgressState(records) {
  return getProgressStateFromMeasurements(records.map((record) => ({
    completedAt: record.completedAt,
    speed: record.summary?.effectiveWordsPerMinute ?? record.effectiveWordsPerMinute ?? record.wordsPerMinute,
    accuracy: record.summary?.finalAccuracy ?? record.finalAccuracy ?? record.accuracy,
    textId: record.textId,
  })));
}

export function getPatternProgressState(records, pattern, ngramLength = 2) {
  const measurements = records.flatMap((record) => {
    const transition = getRunTransitions(record.events || [], ngramLength).find((entry) => entry.pair === pattern);
    return transition ? [{ completedAt: record.completedAt, speed: transition.speed, textId: record.textId, occurrences: transition.samples }] : [];
  });
  const state = getProgressStateFromMeasurements(measurements);
  return { ...state, pattern, occurrences: measurements.reduce((total, measurement) => total + measurement.occurrences, 0) };
}

export function getFluencyProgressState(records) {
  const measurements = records.flatMap((record) => {
    const fluency = record.summary;
    if (!fluency?.earlyIntervalMs || !fluency?.lateIntervalMs || !Number.isFinite(fluency.fatiguePercent)) return [];
    return [{ completedAt: record.completedAt, textId: record.textId, speed: Math.max(0, 100 - Math.abs(fluency.fatiguePercent)) }];
  });
  return getProgressStateFromMeasurements(measurements);
}
