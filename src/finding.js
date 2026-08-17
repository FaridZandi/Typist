// Choosing the one thing to show.
//
// Findings sit on a ladder from most specific to least. We take the highest
// rung the evidence actually supports and stop there — so the app says
// something useful about every run without claiming more than it knows. A
// transition claim needs cross-run support; a pause claim only describes today
// and is labelled that way.

import { getMedian } from "./metrics.js";
import { getCharacterAggregate, getWordAggregate } from "./aggregates.js";
import { getPairTimeline, getSlowestSupportedTransition } from "./transitions.js";
import { MOTOR_CLASS_LABELS } from "./shared/keyboard-map.js";

export const FINDING_LEVELS = ["transition", "word", "character", "pause", "pace", "run", "none"];

// Where a finding can be pointed at inside the rendered passage.
function locateWords(words, predicate) {
  return words.flatMap((word, index) => (predicate(word.text) ? [index] : []));
}

function transitionFinding({ transitions, words, runPairs, transitionHistory = [], currentTransitions = null }) {
  const row = getSlowestSupportedTransition(transitions, { presentPairs: runPairs });
  if (!row) return null;

  // The history behind the median, so a claim about a movement can be checked
  // against the run it is shown beside rather than taken on faith.
  const timeline = getPairTimeline(transitionHistory, row.pair, {
    isCurrent: (entry) => entry === currentTransitions,
  });
  const thisRun = timeline.find((entry) => entry.current) ?? null;

  return {
    level: "transition",
    confidence: "supported",
    subject: { kind: "pair", value: row.pair },
    measure: {
      valueMs: row.medianIntervalMs,
      baselineMs: row.withinWordBaselineMs,
      runValueMs: thisRun?.medianMs ?? null,
      runBaselineMs: thisRun?.baselineMs ?? null,
      runSamples: thisRun?.samples.length ?? 0,
      slowdownPercent: row.slowdownPercent,
      motorClass: row.motorClass,
      motorClassLabel: MOTOR_CLASS_LABELS[row.motorClass],
    },
    history: { pair: row.pair, entries: timeline, currentTextId: currentTransitions?.textId ?? null },
    evidence: { samples: row.scoredSamples, distinctWords: row.distinctWords, distinctTexts: row.distinctTexts },
    ruledOut: row.ruledOut,
    accurate: true,
    locations: locateWords(words, (text) => text.toLowerCase().includes(row.pair)),
  };
}

function wordFinding({ wordRecords, words }) {
  const row = getWordAggregate(wordRecords)
    .filter((entry) => entry.confidence === "supported" && entry.finalErrors >= 2)
    .sort((left, right) => right.finalErrors - left.finalErrors)[0];
  if (!row) return null;

  const timed = getWordAggregate(wordRecords).filter((entry) => entry.durationPerCharacter > 0);
  const baseline = Math.round(getMedian(timed.map((entry) => entry.durationPerCharacter)));

  return {
    level: "word",
    confidence: "supported",
    subject: { kind: "word", value: row.word },
    measure: {
      valueMs: row.durationPerCharacter,
      baselineMs: baseline,
      slowdownPercent: baseline ? Math.round((row.durationPerCharacter / baseline - 1) * 100) : null,
      errors: row.finalErrors,
    },
    evidence: { samples: row.samples, distinctWords: 1, distinctTexts: row.sourceTextCount },
    ruledOut: row.sourceTextCount > 1 ? ["single-text"] : [],
    accurate: false,
    locations: locateWords(words, (text) => text.toLowerCase().replace(/[^a-z']/g, "") === row.word.toLowerCase().replace(/[^a-z']/g, "")),
  };
}

function characterFinding({ eventRecords, words }) {
  const row = getCharacterAggregate(eventRecords)
    .find((entry) => entry.confidence === "supported" && entry.accuracy <= 90 && entry.attempts - entry.correct >= 2);
  if (!row) return null;

  return {
    level: "character",
    confidence: "supported",
    subject: { kind: "character", value: row.character },
    measure: {
      accuracy: row.accuracy,
      attempts: row.attempts,
      wrong: row.attempts - row.correct,
      commonSubstitution: row.commonSubstitution,
    },
    evidence: { samples: row.attempts, distinctWords: null, distinctTexts: row.sourceTextCount },
    ruledOut: row.sourceTextCount > 1 ? ["single-text"] : [],
    accurate: false,
    locations: locateWords(words, (text) => text.toLowerCase().includes(row.character.toLowerCase())),
  };
}

// Pauses at the first keystroke of a word are the signature of reading ahead
// rather than of any movement, so they are reported as their own thing.
function pauseFinding({ summary, runEvents, words }) {
  if (summary.pauseCount < 2) return null;

  const pauses = [];
  runEvents.forEach((event, index) => {
    const previous = runEvents[index - 1];
    if (!previous) return;
    const gap = event.timestampMs - previous.timestampMs;
    if (gap >= summary.pauseThresholdMs) pauses.push({ gap, wordIndex: event.wordIndex, atWordStart: event.bufferOffset === 0 });
  });
  if (!pauses.length) return null;

  const beforeWords = pauses.filter((pause) => pause.atWordStart).length;
  const lookahead = beforeWords / pauses.length >= 0.6;

  return {
    level: "pause",
    confidence: "run-only",
    subject: { kind: "pause", value: lookahead ? "reading ahead" : "hesitation" },
    measure: {
      count: pauses.length,
      longestMs: Math.round(Math.max(...pauses.map((pause) => pause.gap))),
      totalMs: Math.round(pauses.reduce((total, pause) => total + pause.gap, 0)),
      thresholdMs: summary.pauseThresholdMs,
      beforeWords,
    },
    evidence: { samples: pauses.length, distinctWords: new Set(pauses.map((pause) => pause.wordIndex)).size, distinctTexts: 1 },
    ruledOut: [],
    accurate: false,
    locations: [...new Set(pauses.map((pause) => pause.wordIndex))].filter((index) => index < words.length),
  };
}

function paceFinding({ summary, words }) {
  if (!summary.earlyIntervalMs || !summary.lateIntervalMs || Math.abs(summary.fatiguePercent) < 20) return null;

  return {
    level: "pace",
    confidence: "run-only",
    subject: { kind: "pace", value: summary.fatiguePercent > 0 ? "slowed" : "quickened" },
    measure: {
      earlyMs: summary.earlyIntervalMs,
      lateMs: summary.lateIntervalMs,
      percent: Math.abs(summary.fatiguePercent),
    },
    evidence: { samples: 1, distinctWords: null, distinctTexts: 1 },
    ruledOut: [],
    accurate: false,
    locations: words.length ? [words.length - 1] : [],
  };
}

function runFinding({ summary }) {
  if (summary.remainingErrors < 1 && summary.correctedErrors < 2) return null;

  return {
    level: "run",
    confidence: "run-only",
    subject: { kind: "run", value: summary.remainingErrors >= 1 ? "errors left" : "corrections" },
    measure: { errorsLeft: summary.remainingErrors, corrected: summary.correctedErrors },
    evidence: { samples: summary.remainingErrors + summary.correctedErrors, distinctWords: null, distinctTexts: 1 },
    ruledOut: [],
    accurate: false,
    locations: [],
  };
}

export function selectFinding(context) {
  const rungs = [transitionFinding, wordFinding, characterFinding, pauseFinding, paceFinding, runFinding];
  for (const rung of rungs) {
    const finding = rung(context);
    if (finding) return finding;
  }
  return { level: "none", confidence: "run-only", subject: null, measure: {}, evidence: { samples: 0 }, ruledOut: [], locations: [] };
}
