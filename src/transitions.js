// Measuring how costly a key-to-key movement really is.
//
// A raw inter-key interval has at least six causes competing for credit:
// the movement itself, reading ahead to the next word, an unfamiliar word,
// recognising a word at all, an outright hesitation, and the physical class of
// the movement. Attributing all of it to the bigram is how an app invents
// weaknesses that are not there.
//
// So a sample only counts when it is:
//   * between two consecutive, correctly typed characters inside one word;
//   * not a hesitation (anything past the run's pause threshold is thinking);
// and it is scored *relative to the other movements in the same word*, which
// is what stops a hard or unfamiliar word from making all of its bigrams look
// like motor problems.

import { getMedian, getQuantile } from "./metrics.js";
import { getMotorClass } from "./shared/keyboard-map.js";

// A pair needs to show up in several different words before it can be called a
// property of the movement rather than a property of one word.
export const MINIMUM_DISTINCT_WORDS = 3;
export const MINIMUM_USABLE_SAMPLES = 12;
// Ratios wider than this are inconsistent, which is not what a motor
// difficulty looks like.
export const MAXIMUM_DISPERSION = 0.9;
// A pair seen almost only at the start of words is confounded with the cost of
// recognising the word itself.
export const MAXIMUM_WORD_START_SHARE = 0.7;

function getWordTexts(record) {
  const texts = new Map();
  (record.words || []).forEach((analysis) => {
    if (Number.isInteger(analysis.wordIndex)) texts.set(analysis.wordIndex, analysis.expected);
  });
  return texts;
}

// Every aligned intra-word movement in one run, with the context needed to
// discount it later.
export function collectTransitionSamples(record, { pauseThresholdMs = Infinity } = {}) {
  const events = record.events || [];
  const wordTexts = getWordTexts(record);
  const samples = [];

  events.forEach((event, index) => {
    const previous = events[index - 1];
    if (!previous) return;
    const aligned = (candidate) => candidate.type === "character" && candidate.expectedCharacter !== null && candidate.key === candidate.expectedCharacter;
    if (!aligned(event) || !aligned(previous)) return;
    if (event.wordIndex !== previous.wordIndex) return;
    if (event.bufferOffset !== previous.bufferOffset + 1) return;

    const intervalMs = event.timestampMs - previous.timestampMs;
    if (!(intervalMs > 0)) return;

    samples.push({
      pair: `${previous.key}${event.key}`,
      intervalMs,
      wordIndex: event.wordIndex,
      word: wordTexts.get(event.wordIndex) ?? null,
      offset: previous.bufferOffset,
      atWordStart: previous.bufferOffset === 0,
      hesitation: intervalMs >= pauseThresholdMs,
      textId: record.textId ?? null,
      completedAt: record.completedAt ?? null,
    });
  });

  return samples;
}

// Score each usable sample against the other movements in the same word.
// 1.0 means "no slower than the rest of this word"; 1.4 means "40% slower".
function addRelativeCost(samples) {
  const byWord = new Map();
  samples.forEach((sample) => {
    if (sample.hesitation) return;
    const key = `${sample.textId}:${sample.completedAt}:${sample.wordIndex}`;
    if (!byWord.has(key)) byWord.set(key, []);
    byWord.get(key).push(sample);
  });

  byWord.forEach((group) => {
    if (group.length < 2) return;
    group.forEach((sample) => {
      const others = group.filter((candidate) => candidate !== sample).map((candidate) => candidate.intervalMs);
      const baseline = getMedian(others);
      if (baseline > 0) sample.relativeCost = sample.intervalMs / baseline;
    });
  });

  return samples;
}

function summarisePair(pair, samples, allSamples) {
  const usable = samples.filter((sample) => !sample.hesitation);
  const scored = usable.filter((sample) => Number.isFinite(sample.relativeCost));
  const ratios = scored.map((sample) => sample.relativeCost);
  const intervals = usable.map((sample) => sample.intervalMs);
  const distinctWords = new Set(usable.map((sample) => sample.word).filter(Boolean));
  const distinctTexts = new Set(usable.map((sample) => sample.textId).filter(Boolean));
  const wordStarts = usable.filter((sample) => sample.atWordStart).length;

  const motorClass = getMotorClass(pair[0], pair[1]);
  const classBaselineMs = getClassBaseline(allSamples, pair);
  const medianIntervalMs = Math.round(getMedian(intervals));
  const relativeCost = ratios.length ? getMedian(ratios) : null;
  const withinWordBaselineMs = relativeCost ? Math.round(medianIntervalMs / relativeCost) : null;
  const dispersion = ratios.length >= 4 ? getQuantile(ratios, 0.75) - getQuantile(ratios, 0.25) : null;
  const wordStartShare = usable.length ? wordStarts / usable.length : 0;

  // Each entry is a rival explanation that the evidence rules out. These are
  // what the interface shows instead of asserting a cause in prose.
  const ruledOut = [];
  if (samples.length > usable.length) ruledOut.push("hesitation");
  if (distinctWords.size >= MINIMUM_DISTINCT_WORDS) ruledOut.push("single-word");
  if (distinctTexts.size > 1) ruledOut.push("single-text");
  if (wordStartShare <= MAXIMUM_WORD_START_SHARE) ruledOut.push("word-recognition");
  if (dispersion !== null && dispersion <= MAXIMUM_DISPERSION) ruledOut.push("inconsistent");

  const supported = scored.length >= MINIMUM_USABLE_SAMPLES
    && distinctWords.size >= MINIMUM_DISTINCT_WORDS
    && dispersion !== null && dispersion <= MAXIMUM_DISPERSION
    && wordStartShare <= MAXIMUM_WORD_START_SHARE;

  return {
    pair,
    motorClass,
    samples: usable.length,
    scoredSamples: scored.length,
    hesitationsExcluded: samples.length - usable.length,
    distinctWords: distinctWords.size,
    distinctTexts: distinctTexts.size,
    words: [...distinctWords],
    medianIntervalMs,
    withinWordBaselineMs,
    relativeCost: relativeCost === null ? null : Number(relativeCost.toFixed(3)),
    slowdownPercent: relativeCost === null ? null : Math.round((relativeCost - 1) * 100),
    dispersion: dispersion === null ? null : Number(dispersion.toFixed(3)),
    wordStartShare: Number(wordStartShare.toFixed(2)),
    classBaselineMs,
    classSlowdownPercent: classBaselineMs ? Math.round((medianIntervalMs / classBaselineMs - 1) * 100) : null,
    ruledOut,
    confidence: supported ? "supported" : "learning",
  };
}

// Baseline per motor class, so a same-finger hop is judged against other
// same-finger hops rather than against hand alternations.
function getClassBaseline(samples, pair) {
  const motorClass = getMotorClass(pair[0], pair[1]);
  const intervals = samples
    .filter((sample) => !sample.hesitation
      && sample.pair !== pair
      && getMotorClass(sample.pair[0], sample.pair[1]) === motorClass)
    .map((sample) => sample.intervalMs);
  return intervals.length >= 4 ? Math.round(getMedian(intervals)) : null;
}

export function measureTransitions(records, { pauseThresholdMs = Infinity } = {}) {
  const samples = addRelativeCost(records.flatMap((record) => collectTransitionSamples(record, { pauseThresholdMs })));

  const byPair = new Map();
  samples.forEach((sample) => {
    if (!byPair.has(sample.pair)) byPair.set(sample.pair, []);
    byPair.get(sample.pair).push(sample);
  });

  return [...byPair.entries()]
    .map(([pair, pairSamples]) => summarisePair(pair, pairSamples, samples))
    .filter((row) => row.relativeCost !== null)
    .sort((left, right) => right.relativeCost - left.relativeCost);
}

export function getSlowestSupportedTransition(rows, { presentPairs = null } = {}) {
  return rows.find((row) => row.confidence === "supported"
    && row.slowdownPercent >= 20
    && row.motorClass !== "same-key"
    && row.motorClass !== "unmapped"
    && (presentPairs === null || presentPairs.has(row.pair))) ?? null;
}

// The pairs actually typed in one run, so a finding can be required to be about
// the run it is shown beside.
export function getRunPairs(record, options = {}) {
  return new Set(collectTransitionSamples(record, options).map((sample) => sample.pair));
}
