// The ladder picks the highest rung the evidence supports, and the drill
// generator has to respect the same rule that governs the measurement.

import assert from "node:assert/strict";
import test from "node:test";

import { selectFinding } from "../src/finding.js";
import { buildDrill, getCatalogVocabulary } from "../src/drills.js";
import { measureTransitions } from "../src/transitions.js";
import { getWords } from "../src/text-model.js";

const catalog = [
  { id: "one", title: "One", body: "Petrol and citrus, extra nitrate, a steady rhythm and relaxed hands.", durationSeconds: 60 },
  { id: "two", title: "Two", body: "Control the extra strain, trust the pattern, and keep a calm attitude.", durationSeconds: 60 },
];

const quietSummary = {
  pauseCount: 0, pauseThresholdMs: 700, remainingErrors: 0, correctedErrors: 0,
  earlyIntervalMs: 150, lateIntervalMs: 150, fatiguePercent: 0,
};

function buildRun({ completedAt, words }) {
  const events = [];
  const analyses = [];
  let time = 0;
  words.forEach((word, wordIndex) => {
    const characters = [...word.text];
    characters.forEach((character, offset) => {
      if (offset > 0) time += word.intervals?.[`${characters[offset - 1]}${character}`] ?? word.base ?? 150;
      events.push({ type: "character", key: character, expectedCharacter: character, wordIndex, bufferOffset: offset, timestampMs: time });
    });
    analyses.push({ wordIndex, expected: word.text, finalCorrect: characters.length, categories: { insertion: 0 } });
    time += 500;
  });
  return { textId: "one", completedAt, events, words: analyses };
}

function slowTransitionRecords() {
  return Array.from({ length: 4 }, (_, index) => buildRun({
    completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "petrol", base: 150, intervals: { tr: 280 } },
      { text: "nitrate", base: 150, intervals: { tr: 280 } },
      { text: "extra", base: 150, intervals: { tr: 280 } },
      { text: "citrus", base: 150, intervals: { tr: 280 } },
    ],
  }));
}

test("a supported movement takes the top rung and carries what it ruled out", () => {
  const records = slowTransitionRecords();
  const finding = selectFinding({
    summary: quietSummary,
    words: getWords("petrol nitrate extra citrus"),
    runEvents: records.at(-1).events,
    transitions: measureTransitions(records, { pauseThresholdMs: 700 }),
    wordRecords: records,
    eventRecords: records,
  });

  assert.equal(finding.level, "transition");
  assert.equal(finding.confidence, "supported");
  assert.equal(finding.subject.value, "tr");
  assert.equal(finding.measure.motorClass, "same-hand-reach");
  assert.ok(finding.ruledOut.includes("single-word"));
  assert.ok(finding.locations.length > 0, "the finding must be locatable in the passage");
});

test("with no supported pattern the ladder falls to what this run alone shows", () => {
  const finding = selectFinding({
    summary: { ...quietSummary, pauseCount: 3, remainingErrors: 2 },
    words: getWords("a b c"),
    runEvents: [
      { type: "character", key: "a", wordIndex: 0, bufferOffset: 0, timestampMs: 0 },
      { type: "character", key: "b", wordIndex: 1, bufferOffset: 0, timestampMs: 1200 },
      { type: "character", key: "c", wordIndex: 2, bufferOffset: 0, timestampMs: 2600 },
    ],
    transitions: [],
    wordRecords: [],
    eventRecords: [],
  });

  assert.equal(finding.level, "pause");
  assert.equal(finding.confidence, "run-only", "a single run must not be dressed up as a pattern");
  assert.equal(finding.subject.value, "reading ahead");
  assert.equal(finding.measure.beforeWords, 2);
});

test("a clean run with nothing to single out says so rather than inventing a finding", () => {
  const finding = selectFinding({
    summary: quietSummary,
    words: getWords("a b"),
    runEvents: [],
    transitions: [],
    wordRecords: [],
    eventRecords: [],
  });

  assert.equal(finding.level, "none");
  assert.equal(finding.locations.length, 0);
});

test("the pace rung outranks a plain run summary", () => {
  const finding = selectFinding({
    summary: { ...quietSummary, remainingErrors: 3, earlyIntervalMs: 120, lateIntervalMs: 190, fatiguePercent: 58 },
    words: getWords("a b"),
    runEvents: [],
    transitions: [],
    wordRecords: [],
    eventRecords: [],
  });

  assert.equal(finding.level, "pace");
  assert.equal(finding.measure.percent, 58);
});

test("drill words come from the catalog, never from a bundled dictionary", () => {
  const vocabulary = getCatalogVocabulary(catalog);
  assert.ok(vocabulary.includes("petrol"));
  assert.ok(vocabulary.includes("citrus"));
  assert.ok(!vocabulary.includes("a"), "one and two letter words are not drill material");
});

test("a drill mixes interior occurrences so it can confirm the pattern it practises", () => {
  const drill = buildDrill({ level: "transition", subject: { kind: "pair", value: "tr" } }, catalog);

  assert.ok(drill, "expected a drill for a transition finding");
  assert.equal(drill.isDrill, true);
  assert.equal(drill.durationSeconds, 30);
  assert.deepEqual(drill.focus, { level: "transition", pattern: "tr" });
  assert.ok(drill.body.split(" ").every((word) => word.includes("tr")));

  // The measurement discounts a pattern only ever seen at the start of a word,
  // so a drill made purely of such words could never confirm itself.
  const interior = drill.words.filter((word) => word.indexOf("tr") > 0);
  assert.ok(interior.length >= 2, `expected interior occurrences, got ${JSON.stringify(drill.words)}`);
  assert.equal(drill.words[0].indexOf("tr") > 0, true, "interior words lead the drill");
});

test("no drill is offered when the catalog cannot supply honest material", () => {
  const thin = [{ id: "thin", title: "Thin", body: "calm hands only.", durationSeconds: 60 }];
  assert.equal(buildDrill({ level: "transition", subject: { kind: "pair", value: "zq" } }, thin), null);
});

test("pauses and pace describe the run, so they get no drill", () => {
  assert.equal(buildDrill({ level: "pause", subject: { kind: "pause", value: "reading ahead" } }, catalog), null);
  assert.equal(buildDrill({ level: "pace", subject: { kind: "pace", value: "slowed" } }, catalog), null);
  assert.equal(buildDrill({ level: "none", subject: null }, catalog), null);
});

test("the same finding always produces the same drill", () => {
  const first = buildDrill({ level: "transition", subject: { kind: "pair", value: "tr" } }, catalog);
  const second = buildDrill({ level: "transition", subject: { kind: "pair", value: "tr" } }, catalog);
  assert.equal(first.body, second.body);
});
