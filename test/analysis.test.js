// Pure-logic tests. These import the analysis modules directly, with no DOM and
// no page boot, so the evidence rules can be exercised in isolation.

import assert from "node:assert/strict";
import test from "node:test";

import {
  getCharacterAggregate,
  getShiftMetrics,
  getTransitionAggregate,
  getWordAggregate,
  getWordFragmentAggregate,
} from "../src/aggregates.js";
import { choosePrimaryFeedback, formatBundleEvidence, getCoaching, getFeedbackBundles } from "../src/feedback.js";
import { getFluencyProgressState, getPatternProgressState, getProgressState } from "../src/progress.js";
import { getWordErrorAnnotations } from "../src/annotations.js";
import { getFluencyMetrics } from "../src/metrics.js";
import { getTextDifficulty } from "../src/text-model.js";

const day = 24 * 60 * 60 * 1000;

test("transition evidence remains learning until it reaches the coverage threshold", () => {
  const events = [
    { type: "character", key: "a", expectedCharacter: "a", wordIndex: 0, bufferOffset: 0, timestampMs: 0 },
    { type: "character", key: "b", expectedCharacter: "b", wordIndex: 0, bufferOffset: 1, timestampMs: 100 },
  ];
  const learning = getTransitionAggregate(Array.from({ length: 11 }, () => ({ events })))[0];
  const supported = getTransitionAggregate(Array.from({ length: 12 }, () => ({ events })))[0];
  assert.deepEqual({ samples: learning.samples, confidence: learning.confidence }, { samples: 11, confidence: "learning" });
  assert.deepEqual({ samples: supported.samples, confidence: supported.confidence }, { samples: 12, confidence: "supported" });
});

test("a supported high-impact transition becomes a focused practice recommendation", () => {
  const coaching = getCoaching({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [{ pair: "tr", samples: 18, slowdownPercent: 31, confidence: "supported" }] });
  assert.match(coaching.observation, /“tr”.*31% slower/);
  assert.match(coaching.recommendation, /“tr”/);
});

test("transition evidence keeps its cross-text coverage with the aggregate", () => {
  const events = [
    { type: "character", key: "t", expectedCharacter: "t", wordIndex: 0, bufferOffset: 0, timestampMs: 0 },
    { type: "character", key: "r", expectedCharacter: "r", wordIndex: 0, bufferOffset: 1, timestampMs: 200 },
  ];
  const transition = getTransitionAggregate([{ textId: "first", events }, { textId: "second", events }])[0];
  assert.equal(transition.sourceTextCount, 2);
  assert.equal(
    formatBundleEvidence({ kind: "transition", scope: "tr", sampleCount: transition.samples, confidence: "supported", sourceTextCount: transition.sourceTextCount }),
    "Evidence: 2 examples for “tr” across 2 texts · supported pattern",
  );
});

test("trigram evidence uses contiguous correct letters and cross-text coverage", () => {
  const events = ["s", "t", "r"].map((key, index) => ({ type: "character", key, expectedCharacter: key, wordIndex: 0, bufferOffset: index, timestampMs: index * 150 }));
  const trigram = getTransitionAggregate([{ textId: "first", events }, { textId: "second", events }], 3)[0];
  assert.deepEqual({ pair: trigram.pair, samples: trigram.samples, sourceTextCount: trigram.sourceTextCount }, { pair: "str", samples: 2, sourceTextCount: 2 });
  const bundle = getFeedbackBundles({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], trigrams: [{ ...trigram, confidence: "supported", slowdownPercent: 30 }] })[0];
  assert.equal(bundle.kind, "trigram");
  assert.match(bundle.recommendation, /“str”/);
});

test("feedback bundles rank their evidence and retain the supporting contract", () => {
  const bundles = getFeedbackBundles({ pauseCount: 2, pauseThresholdMs: 700, correctedErrors: 4, remainingErrors: 2, transitions: [] });
  assert.equal(bundles[0].kind, "corrections");
  assert.deepEqual(
    Object.keys(bundles[0]).filter((key) => ["scope", "sampleCount", "confidence", "impact", "stability", "actionability"].includes(key)).sort(),
    ["actionability", "confidence", "impact", "sampleCount", "scope", "stability"],
  );
  assert.deepEqual(Object.keys(bundles[0].evidence).sort(), ["confidence", "sampleCount", "scope", "sourceTextCount"]);
  assert.equal(bundles[0].interpretation, bundles[0].title);
  assert.equal(bundles[0].practice, bundles[0].recommendation);
});

test("no eligible pattern produces a neutral collect-more-evidence story", () => {
  const coaching = getCoaching({ finalAccuracy: 100, correctedErrors: 0, pauseCount: 0, remainingErrors: 0, transitions: [] });
  assert.match(coaching.title, /Collect another/);
  assert.match(coaching.observation, /no repeated pattern/);
});

test("a common supported pattern beats a rarer issue, and ranking is deterministic", () => {
  const summary = {
    pauseCount: 0, correctedErrors: 0, remainingErrors: 4,
    transitions: [{ pair: "tr", samples: 18, slowdownPercent: 31, confidence: "supported", sourceTextCount: 2 }],
    characters: [], wordPatterns: [], prefixPatterns: [], suffixPatterns: [],
  };
  const first = getFeedbackBundles(summary);
  assert.equal(first[0].kind, "transition");
  assert.deepEqual(getFeedbackBundles(summary), first);
});

test("a lower-actionability word pattern does not displace a similarly impactful key pattern", () => {
  const bundles = getFeedbackBundles({
    pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], prefixPatterns: [], suffixPatterns: [],
    characters: [{ character: "a", attempts: 18, correct: 13, accuracy: 72, confidence: "supported", sourceTextCount: 2 }],
    wordPatterns: [{ word: "steady", samples: 6, finalErrors: 5, confidence: "supported", sourceTextCount: 2 }],
  });
  assert.equal(bundles[0].kind, "character");
});

test("a previous supported recommendation remains primary when the new evidence is close", () => {
  const bundles = [
    { kind: "character", scope: "a", confidence: "supported", priority: 100 },
    { kind: "transition", scope: "tr", confidence: "supported", priority: 90 },
  ];
  assert.equal(choosePrimaryFeedback(bundles, { kind: "transition", scope: "tr", confidence: "supported" }).kind, "transition");
  assert.equal(choosePrimaryFeedback(bundles, { kind: "transition", scope: "tr", confidence: "supported", priority: 40 }).kind, "transition");
  assert.equal(choosePrimaryFeedback([{ ...bundles[0] }, { ...bundles[1], priority: 80 }], { kind: "transition", scope: "tr", confidence: "supported" }).kind, "character");
});

test("coaching evidence states the scope and confidence behind a bundle", () => {
  assert.equal(formatBundleEvidence({ kind: "transition", scope: "tr", sampleCount: 18, confidence: "supported" }), "Evidence: 18 examples for “tr” · supported pattern");
  assert.equal(formatBundleEvidence({ kind: "character", scope: "a", sampleCount: 16, confidence: "supported", sourceTextCount: 2 }), "Evidence: 16 examples for “a” across 2 texts · supported pattern");
  assert.equal(formatBundleEvidence({ kind: "pauses", scope: "run", sampleCount: 2, confidence: "run-only" }), "Evidence: 2 examples across the run · this run");
});

test("a supported weak character across texts becomes focused practice feedback", () => {
  const bundles = getFeedbackBundles({
    pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [],
    characters: [{ character: "a", attempts: 16, correct: 12, accuracy: 75, commonSubstitution: "s", confidence: "supported", sourceTextCount: 2 }],
  });
  assert.equal(bundles[0].kind, "character");
  assert.match(bundles[0].observation, /across 16 recorded attempts.*“s”/);
  assert.match(bundles[0].recommendation, /“a”/);
});

test("repeated committed word errors become focused practice feedback", () => {
  const bundles = getFeedbackBundles({
    pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [],
    wordPatterns: [{ word: "steady", samples: 5, finalErrors: 3, confidence: "supported", sourceTextCount: 2 }],
  });
  assert.equal(bundles[0].kind, "word");
  assert.match(bundles[0].observation, /3 committed errors across 5 recorded attempts/);
  assert.match(bundles[0].recommendation, /“steady”/);
  assert.equal(formatBundleEvidence(bundles[0]), "Evidence: 5 examples for “steady” across 2 texts · supported pattern");
});

test("supported prefix and suffix patterns are described as cautious word-pattern evidence", () => {
  const record = { textId: "first", words: [{ expected: "steady", finalCorrect: 5, categories: { insertion: 0 } }] };
  const pattern = getWordFragmentAggregate([record, record, { ...record, textId: "second" }, { ...record, textId: "second" }], "suffix")[0];
  assert.deepEqual(
    { fragment: pattern.fragment, samples: pattern.samples, finalErrors: pattern.finalErrors, sourceTextCount: pattern.sourceTextCount, confidence: pattern.confidence },
    { fragment: "ady", samples: 4, finalErrors: 4, sourceTextCount: 2, confidence: "supported" },
  );
  const bundle = getFeedbackBundles({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [], wordPatterns: [], prefixPatterns: [], suffixPatterns: [pattern] })[0];
  assert.equal(bundle.kind, "suffix");
  assert.match(bundle.observation, /word-pattern signal, not proof/);
  assert.match(bundle.recommendation, /ending “ady”/);
});

test("supported Shift timing produces a cautious technique hypothesis", () => {
  const bundles = getFeedbackBundles({
    pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [], wordPatterns: [],
    shift: { supported: true, slowdownPercent: 42, shiftSamples: 12, sourceTextCount: 2 },
  });
  assert.equal(bundles[0].kind, "shift");
  assert.match(bundles[0].observation, /may be a timing pattern rather than a technique problem/);
  assert.equal(formatBundleEvidence(bundles[0]), "Evidence: 12 examples for “capital letters” across 2 texts · supported pattern");
});

test("character evidence tracks process accuracy, substitutions, and confidence", () => {
  const events = Array.from({ length: 12 }, (_, index) => ({ type: "character", key: index === 0 ? "x" : "a", expectedCharacter: "a", timestampMs: index * 100 }));
  const character = getCharacterAggregate([{ events }])[0];
  assert.deepEqual(
    { attempts: character.attempts, accuracy: character.accuracy, commonSubstitution: character.commonSubstitution, confidence: character.confidence },
    { attempts: 12, accuracy: 92, commonSubstitution: "x", confidence: "supported" },
  );
});

test("word evidence requires repeated observations before it is supported", () => {
  const record = { events: [{ wordIndex: 0, timestampMs: 0 }, { wordIndex: 0, timestampMs: 200 }], words: [{ wordIndex: 0, expected: "test", finalCorrect: 4, categories: { insertion: 0 } }] };
  assert.equal(getWordAggregate([record, record, record])[0].confidence, "learning");
  assert.equal(getWordAggregate([record, record, record, record])[0].confidence, "supported");
});

test("fluency analysis measures recovery and first-to-last-third rhythm change", () => {
  const fluency = getFluencyMetrics([
    { type: "character", key: "a", expectedCharacter: "a", timestampMs: 0 },
    { type: "character", key: "x", expectedCharacter: "b", timestampMs: 100 },
    { type: "character", key: "c", expectedCharacter: "c", timestampMs: 400 },
    { type: "character", key: "d", expectedCharacter: "d", timestampMs: 1000 },
  ]);
  assert.deepEqual({ recoveryMs: fluency.recoveryMs, recoverySamples: fluency.recoverySamples, fatiguePercent: fluency.fatiguePercent }, { recoveryMs: 300, recoverySamples: 1, fatiguePercent: 500 });
});

test("progress states require repeated and spaced evidence before calling improvement retained", () => {
  const records = (speeds, days) => speeds.map((speed, index) => ({ completedAt: new Date(Date.UTC(2026, 0, 1) + days[index] * day).toISOString(), summary: { effectiveWordsPerMinute: speed } }));
  assert.equal(getProgressState(records([70], [0])).state, "learning");
  assert.equal(getProgressState(records([50, 50, 50, 60, 60, 60], [0, 1, 2, 3, 4, 5])).state, "recent-improvement");
  assert.equal(getProgressState(records([50, 50, 50, 60, 60, 60, 60, 60, 60], [0, 1, 2, 3, 4, 5, 13, 14, 15])).state, "retained-improvement");
});

test("a spaced meaningful decline needs a refresh, while one poor run does not", () => {
  const records = (speeds) => speeds.map((speed, index) => ({ completedAt: new Date(Date.UTC(2026, 0, 1) + [0, 1, 2, 3, 4, 5, 13, 14, 15][index] * day).toISOString(), summary: { effectiveWordsPerMinute: speed } }));
  assert.equal(getProgressState(records([50, 50, 50, 60, 60, 60, 40, 40, 40])).state, "needs-refresh");
  assert.notEqual(getProgressState(records([50, 50, 50, 60, 60, 60, 60, 60, 30])).state, "needs-refresh");
});

test("pattern progress uses stored event evidence and requires a spaced follow-up", () => {
  const days = [0, 1, 2, 3, 4, 5, 13, 14, 15];
  const intervals = [200, 200, 200, 150, 150, 150, 150, 150, 150];
  const records = intervals.map((interval, index) => ({
    textId: index < 6 ? "first" : "second",
    completedAt: new Date(Date.UTC(2026, 0, 1) + days[index] * day).toISOString(),
    events: [
      { type: "character", key: "t", expectedCharacter: "t", wordIndex: 0, bufferOffset: 0, timestampMs: 0 },
      { type: "character", key: "r", expectedCharacter: "r", wordIndex: 0, bufferOffset: 1, timestampMs: interval },
    ],
  }));
  const progress = getPatternProgressState(records, "tr");
  assert.equal(progress.state, "retained-improvement");
  assert.equal(progress.sampleCount, 9);
  assert.equal(progress.occurrences, 9);
  assert.deepEqual([...progress.sourceTextIds], ["first", "second"]);
});

test("pattern progress leaves old runs without event records in the learning state", () => {
  const progress = getPatternProgressState([
    { textId: "old", completedAt: "2026-01-01T00:00:00.000Z", summary: { effectiveWordsPerMinute: 60 } },
    { textId: "old", completedAt: "2026-01-02T00:00:00.000Z", events: [] },
  ], "tr");
  assert.equal(progress.state, "learning");
  assert.equal(progress.sampleCount, 0);
  assert.equal(progress.occurrences, 0);
});

test("fluency progress requires repeated pacing evidence before it is retained", () => {
  const records = [30, 30, 30, 10, 10, 10, 10, 10, 10].map((fatiguePercent, index) => ({
    textId: "first",
    completedAt: new Date(Date.UTC(2026, 0, 1) + [0, 1, 2, 3, 4, 5, 13, 14, 15][index] * day).toISOString(),
    summary: { fatiguePercent, earlyIntervalMs: 100, lateIntervalMs: 100 + fatiguePercent },
  }));
  const progress = getFluencyProgressState(records);
  assert.equal(progress.state, "retained-improvement");
  assert.equal(progress.sampleCount, 9);
  assert.equal(getFluencyProgressState(records.slice(0, 1)).state, "learning");
});

test("catalog difficulty is deterministic and increases for punctuation or capitals", () => {
  const plain = getTextDifficulty({ body: "steady words only" });
  const complex = getTextDifficulty({ body: "Steady, Words! Only?" });
  assert.equal(plain, 1);
  assert.equal(complex > plain, true);
});

test("Shift timing is only supported with enough Shift and lowercase samples", () => {
  const events = [];
  for (let index = 0; index < 9; index += 1) {
    events.push({ type: "character", expectedCharacter: "a", modifiers: { shift: false }, timestampMs: index * 200 });
    events.push({ type: "character", expectedCharacter: "A", modifiers: { shift: true }, timestampMs: index * 200 + 100 });
  }
  const metrics = getShiftMetrics([{ events }]);
  assert.equal(metrics.supported, true);
  assert.equal(metrics.shiftSamples, 9);
});

test("committed error categories become distinct, evidence-bearing run annotations", () => {
  const annotations = getWordErrorAnnotations({
    expected: "word",
    categories: { substitution: 1, omission: 1, insertion: 1, transposition: 1, duplication: 1, capitalization: 1, punctuation: 1 },
  });
  assert.deepEqual([...annotations.map((annotation) => annotation.kind)], ["substitution", "omission", "insertion", "transposition", "duplication", "capitalization", "punctuation"]);
  assert.equal(annotations.every((annotation) => annotation.count === 1 && annotation.message.includes("committed")), true);
});
