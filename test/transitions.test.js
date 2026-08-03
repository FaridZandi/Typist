// The rival-explanation tests. Each one describes a way a naive timer would
// invent a weakness, and asserts that the measurement does not fall for it.

import assert from "node:assert/strict";
import test from "node:test";

import { measureTransitions, getSlowestSupportedTransition } from "../src/transitions.js";
import { getMotorClass } from "../src/shared/keyboard-map.js";

// Builds a run where every intra-word gap is `base` ms, except pairs named in
// `intervals`, which lets a test make exactly one movement expensive.
function buildRun({ textId = "first", completedAt = "2026-01-01T00:00:00.000Z", words }) {
  const events = [];
  const analyses = [];
  let time = 0;

  words.forEach((word, wordIndex) => {
    const characters = [...word.text];
    characters.forEach((character, offset) => {
      if (offset > 0) {
        const pair = `${characters[offset - 1]}${character}`;
        time += word.intervals?.[pair] ?? word.base ?? 150;
      }
      events.push({
        type: "character",
        key: character,
        expectedCharacter: character,
        wordIndex,
        bufferOffset: offset,
        timestampMs: time,
      });
    });
    analyses.push({ wordIndex, expected: word.text, finalCorrect: characters.length, categories: { insertion: 0 } });
    time += 500;
  });

  return { textId, completedAt, events, words: analyses };
}

const find = (rows, pair) => rows.find((row) => row.pair === pair);

test("a hard word does not make every one of its movements look like a weakness", () => {
  // "rhythm" is typed at double the pace of everything else — uniformly.
  const rows = measureTransitions([buildRun({
    words: [
      { text: "steady", base: 150 },
      { text: "rhythm", base: 300 },
      { text: "relaxed", base: 150 },
    ],
  })]);

  // Every movement inside the slow word is slow, so none of them stands out.
  ["rh", "hy", "yt", "th", "hm"].forEach((pair) => {
    const row = find(rows, pair);
    assert.ok(row, `expected a row for ${pair}`);
    assert.equal(row.relativeCost, 1, `${pair} should read as ordinary within its own word`);
    assert.equal(row.confidence, "learning");
  });
});

test("a movement slow in only one word stays unattributed", () => {
  const runs = Array.from({ length: 6 }, (_, index) => buildRun({
    completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    words: [{ text: "petrol", base: 150, intervals: { tr: 300 } }],
  }));
  const row = find(measureTransitions(runs), "tr");

  assert.equal(row.distinctWords, 1);
  assert.equal(row.confidence, "learning", "one word is not evidence about a movement");
  assert.ok(!row.ruledOut.includes("single-word"));
});

test("a movement slow across many words becomes supported", () => {
  const runs = Array.from({ length: 4 }, (_, index) => buildRun({
    completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "petrol", base: 150, intervals: { tr: 260 } },
      { text: "nitrate", base: 150, intervals: { tr: 260 } },
      { text: "extra", base: 150, intervals: { tr: 260 } },
      { text: "citrus", base: 150, intervals: { tr: 260 } },
    ],
  }));
  const row = find(measureTransitions(runs), "tr");

  assert.equal(row.distinctWords, 4);
  assert.ok(row.scoredSamples >= 12, `expected 12+ scored samples, got ${row.scoredSamples}`);
  assert.equal(row.confidence, "supported");
  assert.ok(row.slowdownPercent >= 20);
  assert.deepEqual(
    [...row.ruledOut].sort(),
    ["inconsistent", "single-word", "word-recognition"],
    "the rivals the evidence actually rules out",
  );
  assert.equal(getSlowestSupportedTransition(measureTransitions(runs)).pair, "tr");
});

test("a hesitation is thinking, not movement, and never reaches the average", () => {
  const clean = Array.from({ length: 3 }, (_, index) => buildRun({
    completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    words: [{ text: "petrol", base: 150 }, { text: "nitrate", base: 150 }, { text: "extra", base: 150 }],
  }));
  // One occurrence where the typist stopped to think for a second and a half.
  const distracted = buildRun({
    completedAt: "2026-01-09T00:00:00.000Z",
    words: [{ text: "petrol", base: 150, intervals: { tr: 1500 } }],
  });

  const row = find(measureTransitions([...clean, distracted], { pauseThresholdMs: 700 }), "tr");

  assert.equal(row.hesitationsExcluded, 1);
  assert.ok(row.ruledOut.includes("hesitation"));
  assert.equal(row.medianIntervalMs, 150, "the 1.5s pause must not move the estimate");
  assert.equal(row.slowdownPercent, 0);
});

test("a movement only ever seen at the start of words stays confounded with reading the word", () => {
  const runs = Array.from({ length: 4 }, (_, index) => buildRun({
    completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "tray", base: 150, intervals: { tr: 260 } },
      { text: "trim", base: 150, intervals: { tr: 260 } },
      { text: "trust", base: 150, intervals: { tr: 260 } },
    ],
  }));
  const row = find(measureTransitions(runs), "tr");

  assert.equal(row.wordStartShare, 1);
  assert.equal(row.confidence, "learning", "cannot separate the movement from recognising the word");
  assert.ok(!row.ruledOut.includes("word-recognition"));
});

test("an erratic movement is not a motor difficulty", () => {
  const runs = [220, 150, 480, 160, 500, 145, 260, 470, 150, 380, 155, 420].map((interval, index) => buildRun({
    completedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    words: [{ text: "petrol", base: 150, intervals: { tr: interval } }, { text: "nitrate", base: 150, intervals: { tr: interval } }, { text: "extra", base: 150, intervals: { tr: interval } }],
  }));
  const row = find(measureTransitions(runs), "tr");

  assert.ok(row.dispersion > 0.9, `expected a wide spread, got ${row.dispersion}`);
  assert.equal(row.confidence, "learning");
  assert.ok(!row.ruledOut.includes("inconsistent"));
});

test("movements are classified by what the hands actually have to do", () => {
  assert.equal(getMotorClass("t", "r"), "same-hand-reach");
  assert.equal(getMotorClass("h", "t"), "same-hand-row");
  assert.equal(getMotorClass("e", "h"), "alternating");
  assert.equal(getMotorClass("c", "r"), "same-hand-row");
  assert.equal(getMotorClass("n", "c"), "same-hand-reach");
  assert.equal(getMotorClass("p", "y"), "same-finger");
  assert.equal(getMotorClass("1", "2"), "unmapped");
});

test("each movement is judged against its own physical class", () => {
  const run = buildRun({
    words: [
      // Same-finger hops are slower for everyone; that must not read as a fault.
      { text: "python", base: 150, intervals: { py: 250 } },
      { text: "typing", base: 150 },
      { text: "steady", base: 150 },
      { text: "relaxed", base: 150 },
    ],
  });
  const rows = measureTransitions([run]);
  const sameFinger = find(rows, "py");

  assert.equal(sameFinger.motorClass, "same-finger");
  assert.ok(sameFinger.classBaselineMs === null || sameFinger.classBaselineMs > 0);
});

test("a doubled letter is not a movement and cannot lead the debrief", () => {
  // "ss" in sessions, progress and across: real samples, but no travel between
  // keys, and its only same-class company is itself.
  const runs = Array.from({ length: 5 }, (_, index) => buildRun({
    completedAt: `2026-02-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "sessions", base: 150, intervals: { ss: 260 } },
      { text: "progress", base: 150, intervals: { ss: 260 } },
      { text: "across", base: 150, intervals: { ss: 260 } },
    ],
  }));
  const rows = measureTransitions(runs, { pauseThresholdMs: 700 });
  const doubled = find(rows, "ss");

  assert.equal(doubled.motorClass, "same-key");
  assert.equal(doubled.confidence, "supported", "the measurement is still real");
  assert.equal(getSlowestSupportedTransition(rows), null, "but it is not a movement finding");
});

test("a movement is never compared against its own samples", () => {
  const runs = Array.from({ length: 5 }, (_, index) => buildRun({
    completedAt: `2026-03-0${index + 1}T00:00:00.000Z`,
    words: [{ text: "sessions", base: 150, intervals: { ss: 260 } }, { text: "across", base: 150, intervals: { ss: 260 } }],
  }));
  const doubled = find(measureTransitions(runs, { pauseThresholdMs: 700 }), "ss");

  // "ss" is the only same-key pair here, so it has no honest class baseline —
  // reporting one would mean comparing it with itself.
  assert.equal(doubled.classBaselineMs, null);
});

test("the reported comparison is the one that ranked the movement", () => {
  const rows = measureTransitions(Array.from({ length: 4 }, (_, index) => buildRun({
    completedAt: `2026-04-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "petrol", base: 150, intervals: { tr: 300 } },
      { text: "nitrate", base: 150, intervals: { tr: 300 } },
      { text: "extra", base: 150, intervals: { tr: 300 } },
    ],
  })), { pauseThresholdMs: 700 });
  const row = find(rows, "tr");

  assert.equal(row.medianIntervalMs, 300);
  assert.equal(row.withinWordBaselineMs, 150, "the baseline shown must be the within-word one");
  assert.equal(Math.round(row.medianIntervalMs / row.withinWordBaselineMs * 100) - 100, row.slowdownPercent);
});

test("a pattern absent from this run does not lead its debrief", () => {
  const rows = measureTransitions(Array.from({ length: 4 }, (_, index) => buildRun({
    completedAt: `2026-05-0${index + 1}T00:00:00.000Z`,
    words: [
      { text: "petrol", base: 150, intervals: { tr: 300 } },
      { text: "nitrate", base: 150, intervals: { tr: 300 } },
      { text: "extra", base: 150, intervals: { tr: 300 } },
    ],
  })), { pauseThresholdMs: 700 });

  assert.equal(getSlowestSupportedTransition(rows, { presentPairs: new Set(["tr"]) }).pair, "tr");
  assert.equal(getSlowestSupportedTransition(rows, { presentPairs: new Set(["ab", "cd"]) }), null);
});
