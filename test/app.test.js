// Browser-flow tests for the typing page. These boot the real document and
// drive it the way a typist would; anything that can be checked without a DOM
// lives in analysis.test.js, transitions.test.js, or finding.test.js.

import assert from "node:assert/strict";
import test from "node:test";

import { createTypingPage } from "./helpers/page.js";

const calmPrecision = { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } };
const shortText = [{ id: "short", title: "Short", body: "ab", durationSeconds: 30 }];
const shortSettings = { "typist-typing-settings-v2": { selectedText: "short", chartScope: "text" } };
const frozenTimer = (window) => {
  window.setInterval = () => 1;
  window.clearInterval = () => {};
};

const promptText = (document) => [...document.querySelectorAll("#textDisplay .char")]
  .map((character) => character.textContent)
  .join("");

const finish = (window, document, transform = (text) => text) => {
  const input = document.querySelector("#typingInput");
  input.value = transform(promptText(document));
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

test("typing test records a completed text-id run and shows the debrief", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  finish(window, document);

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(document.querySelector("#testView").hidden, true);
  assert.equal(document.querySelector("#resultsView").hidden, false);
  assert.equal(document.querySelector("#typingInput").disabled, true);
  assert.match(document.querySelector("#finalSpeed").textContent, /^\d+$/);
  assert.match(document.querySelector("#finalAccuracy").textContent, /^\d+$/);

  const runs = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(runs.runs[0].textId, "calm-precision");
});

test("accuracy is shown as filled cells rather than only a number", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  finish(window, document, (text) => text.replace("built", "biult"));

  const pips = [...document.querySelectorAll("#accuracyPips i")];
  assert.equal(pips.length, 20);
  assert.ok(pips.some((pip) => pip.classList.contains("on")));
  assert.match(document.querySelector("#accuracyPips").title, /characters correct/);
});

test("the rhythm strip places one mark per keystroke and marks the pauses", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd ef", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0); app.handleCharacter("b", 120); app.handleSpace(240);
    app.handleCharacter("c", 360); app.handleCharacter("d", 480); app.handleSpace(600);
    // A deliberate stop before the last word.
    app.handleCharacter("e", 2400); app.handleCharacter("f", 2520);

    assert.equal(document.querySelector("#rhythmSection").hidden, false);
    assert.ok(document.querySelectorAll("#rhythmStrip .beat").length >= 7);
    assert.equal(document.querySelectorAll("#rhythmStrip .gapmark").length, 1);
    assert.match(document.querySelector("#rhythmStrip .gapmark span").textContent, /^1\.8s$/);
  } finally {
    window.close();
  }
});

test("the finding names its own level and shows what the evidence ruled out", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0); app.handleCharacter("b", 120); app.handleSpace(240);
    app.handleCharacter("c", 2000); app.handleCharacter("d", 2120);

    assert.equal(document.querySelector("#findingBlock").hidden, false);
    assert.ok(document.querySelector("#findingLabel").textContent.length > 0);
    assert.ok(document.querySelectorAll("#findingBars .bar-row").length >= 1);
    // Every finding states how much evidence stands behind it.
    assert.ok([...document.querySelectorAll("#findingChips .chip")].some((chip) => chip.classList.contains("evidence")));
  } finally {
    window.close();
  }
});

test("a run-only finding is labelled as this run, never as a pattern", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd ef", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0); app.handleCharacter("b", 120); app.handleSpace(240);
    app.handleCharacter("c", 2000); app.handleSpace(2120);
    app.handleCharacter("e", 4000); app.handleCharacter("f", 4120);

    const evidence = [...document.querySelectorAll("#findingChips .chip")].find((chip) => chip.classList.contains("evidence"));
    assert.equal(evidence.textContent, "this run");
  } finally {
    window.close();
  }
});

test("a clean run offers no finding rather than inventing one", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0);
    app.handleCharacter("b", 120);

    assert.equal(document.querySelector("#findingBlock").hidden, true);
    assert.equal(document.querySelector("#drillBlock").hidden, true);
  } finally {
    window.close();
  }
});

test("no drill is offered for a finding that has nothing honest to practise", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd ef", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0); app.handleSpace(120);
    app.handleCharacter("c", 2000); app.handleSpace(2120);
    app.handleCharacter("e", 4000); app.handleCharacter("f", 4120);

    assert.equal(document.querySelector("#drillBlock").hidden, true, "a pause finding has no drill");
  } finally {
    window.close();
  }
});

test("starting a drill swaps the prompt for generated practice material", async () => {
  const { window, document, app } = await createTypingPage({ storage: calmPrecision });
  finish(window, document);

  const drill = app.getPendingDrill();
  if (!drill) {
    // Nothing supported after one run, which is itself the honest outcome.
    assert.equal(document.querySelector("#drillBlock").hidden, true);
    return;
  }

  document.querySelector("#startDrillButton").click();
  assert.equal(app.getActiveText().isDrill, true);
  assert.equal(document.querySelector("#testView").hidden, false);
  assert.equal(document.querySelector("#resultPanel").hidden, true);
  assert.match(document.querySelector("#currentTextMeta").textContent, /practice/);
});

test("a drill never enters the per-text history it is meant to improve", async () => {
  const drill = { id: "drill:transition:tr", title: "“tr” movement", body: "extra nitrate", durationSeconds: 30, isDrill: true, focus: { level: "transition", pattern: "tr" }, words: ["extra"], pattern: "tr" };
  const { window, document, app } = await createTypingPage({ storage: shortSettings, catalog: shortText, beforeInit: frozenTimer });

  try {
    app.resetRun({ text: drill });
    finish(window, document);

    const runs = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2") ?? '{"runs":[]}');
    assert.equal(runs.runs.length, 0, "a drill is practice, not a measurement of the piece");

    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    const stored = analysis.texts["drill:transition:tr"].runs[0];
    assert.equal(stored.isDrill, true);
    assert.deepEqual(stored.drillFocus, { level: "transition", pattern: "tr" });
  } finally {
    window.close();
  }
});

test("the passage stays available as evidence, collapsed by default", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  finish(window, document, (text) => text.replace("built", "biult"));

  assert.equal(document.querySelector("#passageDetails").open, false);
  assert.ok(document.querySelectorAll("#resultTextDisplay .prompt-word").length > 0);
  assert.ok(document.querySelectorAll("#resultTextDisplay .char.incorrect").length > 0);
});

test("the finding is marked in the passage so the claim can be checked", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd", durationSeconds: 30 }],
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("a", 0); app.handleCharacter("b", 120); app.handleSpace(240);
    app.handleCharacter("c", 2000); app.handleCharacter("d", 2120);

    assert.ok(document.querySelectorAll("#resultTextDisplay .run-annotation-active").length >= 1);
  } finally {
    window.close();
  }
});

test("typing caret starts at the beginning of the active word", async () => {
  const { document } = await createTypingPage({ storage: calmPrecision });
  const activeWord = document.querySelector(".active-word");
  assert.equal(activeWord.firstElementChild.classList.contains("typing-caret"), true);
});

test("typing renders the caret before deferred metric updates", async () => {
  const frames = [];
  const { window, document } = await createTypingPage({
    storage: calmPrecision,
    beforeInit(target) {
      target.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    },
  });
  const input = document.querySelector("#typingInput");

  try {
    input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "T" }));

    const caret = document.querySelector(".active-word .typing-caret");
    assert.equal(caret.previousElementSibling.textContent, "T");
    assert.equal(document.querySelector("#speedValue").textContent, "0");
    assert.equal(frames.length, 1);

    frames.shift()();
    frames.shift()();
    assert.notEqual(document.querySelector("#speedValue").textContent, "0");
  } finally {
    window.close();
  }
});

test("typing consistency uses every key press, including mistakes", async () => {
  const { window, document, app } = await createTypingPage({ storage: calmPrecision });

  try {
    app.handleCharacter("x", 0);
    app.handleCharacter("x", 100);
    app.handleCharacter("x", 1000);
    assert.equal(document.querySelector("#consistencyValue").textContent, "20");
  } finally {
    window.close();
  }
});

test("typing stores bounded event records and separates corrected process errors from final text", async () => {
  const { window, document, app } = await createTypingPage({
    storage: shortSettings, catalog: shortText, beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("x", 0);
    app.handleBackspace(100);
    app.handleCharacter("a", 200);
    app.handleCharacter("b", 300);

    assert.equal(document.querySelector("#finalAccuracy").textContent, "100");
    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    const stored = analysis.texts.short.runs[0];
    assert.deepEqual(stored.events.map((event) => event.type), ["character", "backspace", "character", "character"]);
    assert.equal(stored.summary.correctedErrors, 1);
    assert.equal(stored.summary.remainingErrors, 0);
    assert.equal(stored.isDrill, false);
  } finally {
    window.close();
  }
});

test("typing event records preserve modifier state", async () => {
  const { window, document } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "A", durationSeconds: 30 }],
  });

  try {
    const input = document.querySelector("#typingInput");
    input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "A", shiftKey: true }));
    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    assert.equal(analysis.texts.short.runs[0].events[0].modifiers.shift, true);
  } finally {
    window.close();
  }
});

test("typing classifies an adjacent swapped pair as a transposition", async () => {
  const { window, document, app } = await createTypingPage({ catalog: shortText, beforeInit: frozenTimer });

  try {
    app.handleCharacter("b", 0);
    app.handleCharacter("a", 100);
    app.handleSpace(200);
    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    assert.equal(analysis.texts.short.runs[0].summary.categories.transposition, 1);
    assert.equal(document.querySelector("#finalAccuracy").textContent, "0");
  } finally {
    window.close();
  }
});

test("typing commits one word, preserves a correction, and keeps extra letters local", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");
  const type = (key) => input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));

  try {
    type("T"); type("z"); type("Backspace"); type("y"); type(" ");
    assert.equal(document.querySelectorAll("#textDisplay .char")[1].classList.contains("corrected"), true);
    type("w"); type("e"); type("l"); type("l"); type("l");
    assert.equal(document.querySelectorAll("#textDisplay .extra-char").length, 1);
    type(" ");
    assert.equal(document.querySelector(".active-word").textContent.startsWith("is"), true);
    assert.equal(Number(document.querySelector("#accuracyValue").textContent) < 100, true);

    document.querySelector("#restartButton").click();
    assert.equal(input.value, "");
    assert.equal(document.querySelector("#resultPanel").hidden, true);
  } finally {
    window.close();
  }
});

test("committed extra characters lower typing accuracy", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");
  const type = (key) => input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));

  try {
    for (const key of "Typingx") type(key);
    type(" ");
    assert.equal(document.querySelector("#accuracyValue").textContent, "88");
  } finally {
    window.close();
  }
});

test("selected text duration controls WPM timing and progress semantics", async () => {
  const intervalCallbacks = [];
  const { window, document } = await createTypingPage({
    storage: shortSettings,
    catalog: [{ id: "short", title: "Short piece", body: "Typing practice.", durationSeconds: 30 }],
    beforeInit(target) {
      target.setInterval = (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; };
      target.clearInterval = () => {};
    },
  });

  document.querySelector("#typingInput").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "T" }));
  for (let second = 0; second < 15; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector(".timer-progress").getAttribute("aria-valuemax"), "30");
  assert.equal(document.querySelector("#speedValue").textContent, "1");
  window.close();
});

test("text selection is locked during a run and restored after reset or completion", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const select = document.querySelector("#textSelect");

  assert.equal(select.disabled, false);
  document.querySelector("#typingInput").dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "T" }));
  assert.equal(select.disabled, true);

  document.querySelector("#restartButton").click();
  assert.equal(select.disabled, false);
  finish(window, document);
  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(select.disabled, false);
});

test("typing history can be cleared across aggregate and detailed stores", async () => {
  const { window, document } = await createTypingPage();
  finish(window, document);
  window.confirm = () => true;
  document.querySelector("#clearHistoryButton").click();

  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-stats-v2")), { version: 2, texts: {} });
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-runs-v2")), { version: 2, runs: [] });
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3")), { version: 3, texts: {} });
});

test("cancelling the clear-history confirmation preserves the completed run", async () => {
  const { window, document } = await createTypingPage();
  finish(window, document);
  window.confirm = () => false;
  document.querySelector("#clearHistoryButton").click();

  assert.equal(JSON.parse(window.localStorage.getItem("typist-typing-runs-v2")).runs.length, 1);
});

test("typing timer completes and records an incomplete run when time expires", async () => {
  const intervalCallbacks = [];
  const { window, document } = await createTypingPage({
    storage: calmPrecision,
    beforeInit(target) {
      target.setInterval = (callback) => { intervalCallbacks.push(callback); return intervalCallbacks.length; };
      target.clearInterval = () => {};
    },
  });
  const input = document.querySelector("#typingInput");

  input.value = "T";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(intervalCallbacks.length, 1);
  for (let second = 0; second < 60; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(input.disabled, true);
  const savedRuns = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(savedRuns.runs.length, 1);
  assert.equal(savedRuns.runs[0].textId, "calm-precision");
});

test("the first Tab after a run focuses Restart", async () => {
  const { window, document } = await createTypingPage();
  finish(window, document);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

  assert.equal(document.activeElement, document.querySelector("#restartButton"));
});

test("Space does not scroll the page outside an active control", async () => {
  const { window, document } = await createTypingPage();
  const space = new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  document.dispatchEvent(space);

  assert.equal(space.defaultPrevented, true);
});

test("random practice resolves to a concrete text and removes legacy typing keys", async () => {
  const randomValues = [0, 0.99];
  const realRandom = Math.random;
  Math.random = () => randomValues.shift() ?? 0;

  try {
    const { window, document } = await createTypingPage({
      storage: {
        "typist-typing-settings-v2": { selectedText: "random", chartScope: "text" },
        "typist-heatmap:old": { runs: 99 },
      },
    });
    finish(window, document);

    const runs = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2"));
    assert.equal(runs.runs.length, 1);
    assert.notEqual(runs.runs[0].textId, "random");
    assert.equal(window.localStorage.getItem("typist-heatmap:old"), null);
    assert.notEqual(document.querySelector("#currentTextLabel").textContent, "");
  } finally {
    Math.random = realRandom;
  }
});

test("speed is placed against the range this typist has produced on this piece", async () => {
  const { window, document } = await createTypingPage({
    storage: {
      ...calmPrecision,
      "typist-typing-runs-v2": { version: 2, runs: [
        { textId: "calm-precision", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 40, accuracy: 95, consistency: 88, typingScore: 126 },
        { textId: "calm-precision", completedAt: "2026-07-02T10:00:00.000Z", wordsPerMinute: 52, accuracy: 96, consistency: 90, typingScore: 140 },
      ] },
    },
  });
  finish(window, document);

  assert.equal(document.querySelector("#speedRange").hidden, false);
  assert.equal(document.querySelectorAll("#speedRange .tick").length, 1);
  assert.equal(document.querySelectorAll("#speedRange .ghost").length, 1, "the previous run stays visible behind this one");
  assert.equal(document.querySelector("#deltaStat").hidden, false);
  assert.match(document.querySelector("#speedDelta").textContent, /[▲▼=]/);
});

test("the first run on a piece has no range to compare against", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  finish(window, document);

  assert.equal(document.querySelector("#speedRange").hidden, true);
  assert.equal(document.querySelector("#deltaStat").hidden, true);
});
