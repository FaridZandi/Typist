// Pure scoring and timing maths. Nothing here reads run state or the DOM, so
// every function can be exercised directly without a browser environment.

import { speedSmoothingPreviousLetters } from "./config.js";

export function getMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function getTypingScore(wordsPerMinute, accuracy, consistency) {
  return Math.round(wordsPerMinute * (accuracy / 100) + consistency);
}

export function getRunConsistency(intervals) {
  const values = [...intervals.values()].filter((value) => value > 0);
  if (values.length < 2) return 100;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.max(0, Math.min(100, (1 - Math.sqrt(variance) / mean) * 100)));
}

export function getFluencyMetrics(events) {
  const timed = [];
  const recoveryIntervals = [];
  let previous = null;
  events.forEach((event) => {
    if (previous && event.timestampMs > previous.timestampMs) {
      const interval = event.timestampMs - previous.timestampMs;
      timed.push({ timestampMs: event.timestampMs, interval });
      if (previous.type === "character" && previous.expectedCharacter !== null && previous.key !== previous.expectedCharacter) recoveryIntervals.push(interval);
    }
    previous = event;
  });
  const last = events.at(-1)?.timestampMs || 0;
  const third = last / 3;
  const early = average(timed.filter((point) => point.timestampMs <= third).map((point) => point.interval));
  const late = average(timed.filter((point) => point.timestampMs >= third * 2).map((point) => point.interval));
  return {
    recoveryMs: Math.round(average(recoveryIntervals)),
    recoverySamples: recoveryIntervals.length,
    earlyIntervalMs: Math.round(early),
    lateIntervalMs: Math.round(late),
    fatiguePercent: early && late ? Math.round(((late / early) - 1) * 100) : 0,
  };
}

// Per-character intervals are noisy on their own, so each position is averaged
// with the few positions before it before it reaches a heatmap.
export function getSmoothedRunIntervals(runIntervals) {
  const result = new Map();
  [...runIntervals.entries()].sort(([a], [b]) => a - b).forEach(([index]) => {
    const start = Math.max(0, index - speedSmoothingPreviousLetters);
    const samples = [];
    for (let position = start; position <= index; position += 1) {
      if (runIntervals.has(position)) samples.push(runIntervals.get(position));
    }
    if (samples.length) result.set(index, samples.reduce((total, value) => total + value, 0) / samples.length);
  });
  return result;
}

export function getRhythmTimeline(events) {
  let previousTimestamp = null;
  return events.flatMap((event, index) => {
    const timestamp = event.timestampMs;
    const interval = previousTimestamp === null ? null : timestamp - previousTimestamp;
    previousTimestamp = timestamp;
    if (!interval || interval <= 0) return [];
    return [{ x: Math.round(timestamp) / 1000, y: Math.round(12000 / interval), key: event.key, type: event.type, eventIndex: index }];
  });
}

export function getPaddedBounds(values, hardMin = null, hardMax = null) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: hardMin ?? 0, max: hardMax ?? 100 };
  const minValue = Math.min(...finite);
  const maxValue = Math.max(...finite);
  const padding = Math.max(1, (maxValue - minValue) * 0.12 || maxValue * 0.1);
  const min = hardMin === null ? minValue - padding : Math.max(hardMin, minValue - padding);
  const max = hardMax === null ? maxValue + padding : Math.min(hardMax, maxValue + padding);
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}

export function getSpeedHistogramBins(samples) {
  const speeds = samples.map((sample) => sample.speed).filter((speed) => speed !== null);
  if (!speeds.length) return [];
  const low = Math.min(...speeds);
  const high = Math.max(...speeds);
  if (low === high) return [{ min: low, max: high, count: speeds.length }];
  const count = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(speeds.length))));
  const size = (high - low) / count;
  const bins = Array.from({ length: count }, (_, index) => ({ min: low + index * size, max: index === count - 1 ? high : low + (index + 1) * size, count: 0 }));
  speeds.forEach((speed) => bins[Math.min(bins.length - 1, Math.floor((speed - low) / size))].count += 1);
  return bins;
}

export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}
