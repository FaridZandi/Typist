// Weighted target selection. The distribution is calculated once at the start
// of each run: every key keeps a baseline chance, and keys with worse recent
// accuracy or slower recent reaction times appear more often. Both penalties
// are scaled by how many samples back them, so a single bad press cannot
// dominate the run.

import {
  accuracyPenaltyWeight,
  baselineTargetWeight,
  reactionTimePenaltyWeight,
  targetWeightConfidenceSamples,
} from "./config.js";
import { getKeyEmaReactionTime } from "./key-stats.js";

export function isLetterTarget(target) {
  return /^[a-z]$/.test(target);
}

export function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function getTargetDistribution({ targetLetters, keyStats, includeNonLetters, focusExponent }) {
  const eligible = includeNonLetters ? targetLetters : targetLetters.filter(isLetterTarget);
  const emaReactionTimes = eligible
    .map((letter) => getKeyEmaReactionTime(keyStats, letter))
    .filter((reactionTime) => reactionTime !== null);
  const fastest = emaReactionTimes.length === 0 ? 0 : Math.min(...emaReactionTimes);
  const slowest = emaReactionTimes.length === 0 ? 0 : Math.max(...emaReactionTimes);

  return eligible.map((letter) => {
    const record = keyStats[letter] ?? { correct: 0, wrong: 0, reactionSamples: 0 };
    const attempts = record.correct + record.wrong;
    const accuracy = Number.isFinite(record.emaAccuracy) && record.emaAccuracy !== null
      ? record.emaAccuracy
      : attempts === 0
        ? null
        : record.correct / attempts;
    const accuracyConfidence = Math.min(1, attempts / targetWeightConfidenceSamples);
    const accuracyPenalty = accuracy === null ? 0 : (1 - accuracy) * accuracyConfidence;

    const averageReactionTime = getKeyEmaReactionTime(keyStats, letter);
    const reactionConfidence = Math.min(1, record.reactionSamples / targetWeightConfidenceSamples);
    const reactionPenalty = averageReactionTime === null || slowest <= fastest
      ? 0
      : ((averageReactionTime - fastest) / (slowest - fastest)) * reactionConfidence;

    const weight = baselineTargetWeight
      + accuracyPenalty * accuracyPenaltyWeight
      + reactionPenalty * reactionTimePenaltyWeight;

    return { letter, weight: Math.pow(weight, focusExponent) };
  });
}

export function getWeightedTarget(distribution, random = Math.random) {
  const totalWeight = distribution.reduce((total, target) => total + target.weight, 0);
  let draw = random() * totalWeight;

  for (const target of distribution) {
    draw -= target.weight;
    if (draw <= 0) return target.letter;
  }

  return distribution[distribution.length - 1].letter;
}

// The solved target never repeats immediately, so a hit is always followed by
// a genuine change of key.
export function getNextTarget({ distribution, targetLetters, currentTarget, random = Math.random }) {
  if (distribution.length === 0) return targetLetters[0];
  const available = distribution.filter((target) => target.letter !== currentTarget);
  return getWeightedTarget(available.length > 0 ? available : distribution, random);
}
