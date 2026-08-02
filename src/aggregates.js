// Cross-run aggregation over recorded key events. These are the comparable
// units the policy allows to be pooled across texts: characters, n-grams,
// repeated words, and word fragments. Every row carries its sample count, the
// number of texts it came from, and an honest confidence state.

import { minimumTechniqueSamples, minimumTransitionSamples, minimumWordSamples } from "./config.js";
import { average } from "./metrics.js";

// Only runs of correctly aligned, consecutive characters count, so a transition
// measures finger movement rather than the time spent recovering from a typo.
export function getRunTransitions(events, ngramLength = 2) {
  const transitions = new Map();
  let previous = null;
  let sequence = [];
  events.forEach((event) => {
    const matchesExpected = event.type === "character" && event.expectedCharacter !== null && event.key === event.expectedCharacter;
    if (!matchesExpected) { previous = null; sequence = []; return; }
    if (!previous || event.wordIndex !== previous.wordIndex || event.bufferOffset !== previous.bufferOffset + 1) sequence = [event];
    else sequence.push(event);
    if (sequence.length >= ngramLength) {
      const ngram = sequence.slice(-ngramLength);
      const interval = (ngram.at(-1).timestampMs - ngram[0].timestampMs) / (ngramLength - 1);
      if (interval > 0) {
        const pair = ngram.map((item) => item.key).join("");
        const current = transitions.get(pair) || { pair, samples: 0, totalIntervalMs: 0 };
        current.samples += 1;
        current.totalIntervalMs += interval;
        transitions.set(pair, current);
      }
    }
    previous = event;
  });
  return [...transitions.values()].map((transition) => ({
    ...transition,
    averageIntervalMs: Math.round(transition.totalIntervalMs / transition.samples),
    speed: Math.round(12000 / (transition.totalIntervalMs / transition.samples)),
  })).sort((left, right) => right.averageIntervalMs - left.averageIntervalMs);
}

export function getTransitionAggregate(records, ngramLength = 2) {
  const aggregate = new Map();
  records.forEach((record) => {
    getRunTransitions(record.events || [], ngramLength).forEach((transition) => {
      const current = aggregate.get(transition.pair) || { pair: transition.pair, samples: 0, totalIntervalMs: 0, textIds: new Set() };
      current.samples += transition.samples;
      current.totalIntervalMs += transition.totalIntervalMs;
      if (record.textId) current.textIds.add(record.textId);
      aggregate.set(transition.pair, current);
    });
  });
  const rows = [...aggregate.values()].map((transition) => {
    const { textIds, ...values } = transition;
    return {
      ...values,
      sourceTextCount: textIds.size,
      averageIntervalMs: Math.round(transition.totalIntervalMs / transition.samples),
      speed: Math.round(12000 / (transition.totalIntervalMs / transition.samples)),
    };
  });
  const baseline = rows.reduce((total, row) => total + row.totalIntervalMs, 0) / rows.reduce((total, row) => total + row.samples, 0);
  return rows.map((row) => ({
    ...row,
    slowdownPercent: Number.isFinite(baseline) ? Math.round(((row.averageIntervalMs / baseline) - 1) * 100) : 0,
    confidence: row.samples >= minimumTransitionSamples ? "supported" : "learning",
  })).sort((left, right) => right.averageIntervalMs - left.averageIntervalMs);
}

export function getCharacterAggregate(records) {
  const aggregate = new Map();
  records.forEach((record) => {
    let previousTimestamp = null;
    (record.events || []).forEach((event) => {
      const interval = previousTimestamp === null ? null : event.timestampMs - previousTimestamp;
      previousTimestamp = event.timestampMs;
      if (event.type !== "character" || event.expectedCharacter === null) return;
      const current = aggregate.get(event.expectedCharacter) || { character: event.expectedCharacter, attempts: 0, correct: 0, totalIntervalMs: 0, intervalSamples: 0, substitutions: {}, textIds: new Set() };
      current.attempts += 1;
      if (record.textId) current.textIds.add(record.textId);
      if (event.key === event.expectedCharacter) current.correct += 1;
      else current.substitutions[event.key] = (current.substitutions[event.key] || 0) + 1;
      if (interval > 0) { current.totalIntervalMs += interval; current.intervalSamples += 1; }
      aggregate.set(event.expectedCharacter, current);
    });
  });
  return [...aggregate.values()].map((entry) => {
    const { textIds, ...values } = entry;
    return {
      ...values,
      sourceTextCount: textIds.size,
      accuracy: Math.round((entry.correct / entry.attempts) * 100),
      speed: entry.intervalSamples ? Math.round(12000 / (entry.totalIntervalMs / entry.intervalSamples)) : null,
      confidence: entry.attempts >= minimumTransitionSamples ? "supported" : "learning",
      commonSubstitution: Object.entries(entry.substitutions).sort((left, right) => right[1] - left[1])[0]?.[0] || null,
    };
  }).sort((left, right) => left.accuracy - right.accuracy || (left.speed || Infinity) - (right.speed || Infinity));
}

export function getShiftMetrics(records) {
  const shiftIntervals = [];
  const lowerIntervals = [];
  const textIds = new Set();
  records.forEach((record) => {
    let previous = null;
    (record.events || []).forEach((event) => {
      const interval = previous ? event.timestampMs - previous.timestampMs : 0;
      if (event.type === "character" && event.expectedCharacter && interval > 0) {
        if (event.modifiers?.shift) { shiftIntervals.push(interval); if (record.textId) textIds.add(record.textId); }
        else if (event.expectedCharacter === event.expectedCharacter.toLowerCase()) { lowerIntervals.push(interval); if (record.textId) textIds.add(record.textId); }
      }
      previous = event;
    });
  });
  const shift = average(shiftIntervals);
  const lower = average(lowerIntervals);
  return {
    shiftSamples: shiftIntervals.length,
    lowerSamples: lowerIntervals.length,
    sourceTextCount: textIds.size,
    slowdownPercent: shift && lower ? Math.round(((shift / lower) - 1) * 100) : 0,
    supported: shiftIntervals.length >= minimumTechniqueSamples && lowerIntervals.length >= minimumTechniqueSamples,
  };
}

export function getWordAggregate(records) {
  const wordsByText = new Map();
  records.forEach((record) => (record.words || []).forEach((analysis) => {
    const sourceEvents = record.events || [];
    const relevantEvents = sourceEvents.filter((event) => event.wordIndex === analysis.wordIndex);
    const timestamps = relevantEvents.map((event) => event.timestampMs);
    const duration = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
    const finalErrors = [...analysis.expected].length - analysis.finalCorrect + analysis.categories.insertion;
    const current = wordsByText.get(analysis.expected) || { word: analysis.expected, samples: 0, finalErrors: 0, totalDurationPerCharacter: 0, timedSamples: 0, textIds: new Set() };
    current.samples += 1;
    current.finalErrors += finalErrors;
    if (record.textId) current.textIds.add(record.textId);
    if (duration > 0) { current.totalDurationPerCharacter += duration / Math.max(1, [...analysis.expected].length); current.timedSamples += 1; }
    wordsByText.set(analysis.expected, current);
  }));
  return [...wordsByText.values()].map((word) => {
    const { textIds, ...values } = word;
    return { ...values, sourceTextCount: textIds.size, durationPerCharacter: word.timedSamples ? Math.round(word.totalDurationPerCharacter / word.timedSamples) : 0, confidence: word.samples >= minimumWordSamples ? "supported" : "learning" };
  }).sort((left, right) => right.finalErrors - left.finalErrors || right.durationPerCharacter - left.durationPerCharacter);
}

export function getWordFragmentAggregate(records, kind) {
  const fragments = new Map();
  records.forEach((record) => (record.words || []).forEach((analysis) => {
    const characters = [...analysis.expected];
    if (characters.length < 3) return;
    const fragment = kind === "prefix" ? characters.slice(0, 3).join("") : characters.slice(-3).join("");
    const finalErrors = characters.length - analysis.finalCorrect + analysis.categories.insertion;
    const current = fragments.get(fragment) || { kind, fragment, samples: 0, finalErrors: 0, textIds: new Set() };
    current.samples += 1;
    current.finalErrors += finalErrors;
    if (record.textId) current.textIds.add(record.textId);
    fragments.set(fragment, current);
  }));
  return [...fragments.values()].map((pattern) => {
    const { textIds, ...values } = pattern;
    return { ...values, sourceTextCount: textIds.size, confidence: pattern.samples >= minimumWordSamples ? "supported" : "learning" };
  }).sort((left, right) => right.finalErrors - left.finalErrors || right.samples - left.samples);
}
