// Browser-flow tests for the typing page. These boot the real document and
// drive it the way a typist would; anything that can be checked without a DOM
// lives in analysis.test.js instead.

import assert from "node:assert/strict";
import test from "node:test";

import { createTypingPage } from "./helpers/page.js";
import { getFeedbackBundles } from "../src/feedback.js";
import { renderSecondaryFeedback } from "../src/view/results.js";

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

test("typing test records a completed text-id run and renders its results", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");

  input.value = promptText(document);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(document.querySelector("#testView").hidden, true);
  assert.equal(document.querySelector("#resultsView").hidden, false);
  assert.equal(document.querySelector("#heatmapRuns").textContent, "1 run");
  assert.equal(input.disabled, true);
  assert.match(document.querySelector("#finalSpeed").textContent, /^\d+$/);
  assert.equal(document.querySelector("#resultPassage").hidden, false);
  const runs = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(runs.runs[0].textId, "calm-precision");
});

test("typing caret starts at the beginning of the active word", async () => {
  const { document } = await createTypingPage({ storage: calmPrecision });
  const activeWord = document.querySelector(".active-word");
  assert.equal(activeWord.firstElementChild.classList.contains("typing-caret"), true);
  assert.equal(activeWord.querySelector(".current"), null);
});

test("typing renders the caret before deferred metric updates", async () => {
  const frames = [];
  const { window, document } = await createTypingPage({
    storage: calmPrecision,
    beforeInit(target) {
      target.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
      };
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
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.notEqual(document.querySelector("#speedValue").textContent, "0");
  } finally {
    document.querySelector("#restartButton").click();
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
    document.querySelector("#restartButton").click();
    window.close();
  }
});

test("typing stores bounded event records and separates corrected process errors from final text", async () => {
  const { window, document, app } = await createTypingPage({
    storage: shortSettings,
    catalog: shortText,
    beforeInit: frozenTimer,
  });

  try {
    app.handleCharacter("x", 0);
    app.handleBackspace(100);
    app.handleCharacter("a", 200);
    app.handleCharacter("b", 300);

    assert.equal(document.querySelector("#finalAccuracy").textContent, "100");
    assert.equal(document.querySelector("#processAccuracy").textContent, "67");
    assert.match(document.querySelector("#runObservation").textContent, /corrected error/);
    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    const stored = analysis.texts.short.runs[0];
    assert.deepEqual(stored.events.map((event) => event.type), ["character", "backspace", "character", "character"]);
    assert.equal(stored.summary.correctedErrors, 1);
    assert.equal(stored.summary.remainingErrors, 0);
    assert.equal(stored.derivationVersion, 1);
    assert.equal(stored.progressState.derivationVersion, 1);
    assert.match(document.querySelector("#runNoteList").textContent, /Correction/);
    assert.match(document.querySelector("#transitionDetailSummary").textContent, /1 key-to-key movement.*collecting examples/);
    assert.match(document.querySelector("#transitionList").textContent, /“ab”/);
    assert.match(document.querySelector("#wordList").textContent, /“ab”/);
  } finally {
    window.close();
  }
});

test("secondary feedback stays collapsed until a run has more than one useful bundle", async () => {
  const { window, document, app } = await createTypingPage();

  try {
    const bundles = getFeedbackBundles({ pauseCount: 2, pauseThresholdMs: 700, correctedErrors: 4, remainingErrors: 2, transitions: [] });
    const render = (list, primary) => renderSecondaryFeedback({ elements: app.elements, document, bundles: list, primaryBundle: primary ?? list[0] });

    render(bundles);
    assert.equal(document.querySelector("#secondaryFeedback").hidden, false);
    assert.equal(document.querySelector("#secondaryFeedback").open, false);
    assert.equal(document.querySelector("#secondaryFeedbackCount").textContent, "· 2");
    assert.equal(document.querySelectorAll("#secondaryFeedbackList .secondary-feedback-item").length, 2);
    assert.match(document.querySelector("#secondaryFeedbackList").textContent, /Practice:/);

    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    render(bundles, bundles[1]);
    assert.doesNotMatch(document.querySelector("#secondaryFeedbackList").textContent, new RegExp(escape(bundles[1].title)));
    assert.match(document.querySelector("#secondaryFeedbackList").textContent, new RegExp(escape(bundles[0].title)));

    render(bundles.slice(0, 1));
    assert.equal(document.querySelector("#secondaryFeedback").hidden, true);
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
  const { window, document, app, chartInstances } = await createTypingPage({ catalog: shortText });

  try {
    app.handleCharacter("b", 0);
    app.handleCharacter("a", 100);
    app.handleSpace(200);
    const analysis = JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3"));
    assert.equal(analysis.texts.short.runs[0].summary.categories.transposition, 1);
    assert.equal(document.querySelector("#finalAccuracy").textContent, "0");
    assert.match(document.querySelector("#errorDetailSummary").textContent, /2 final-text errors/);
    assert.equal(document.querySelector("#errorCategoryList").textContent, "Transpositions1");
    const rhythm = chartInstances.find((chart) => chart.data.datasets[0].label === "Inter-key speed");
    assert.equal(rhythm.data.datasets[0].data.length, 2);
  } finally {
    window.close();
  }
});

test("completed runs turn meaningful events into selectable passage notes", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "ab cd", durationSeconds: 30 }],
  });

  try {
    app.handleCharacter("b", 0);
    app.handleCharacter("a", 100);
    app.handleSpace(200);
    app.handleCharacter("c", 1300);
    app.handleCharacter("d", 1400);

    const notes = [...document.querySelectorAll("#runNoteList .run-note")];
    assert.equal(notes.length >= 2, true);
    assert.match(notes.map((note) => note.textContent).join(" "), /transposition.*Pause/);
    assert.match(notes[0].getAttribute("aria-label"), /committed|pause/i);
    assert.equal(document.querySelector("#resultPassage").hidden, false);
    notes[0].click();
    assert.equal(document.querySelectorAll("#resultTextDisplay .run-annotation-active").length, 1);
    assert.equal(document.querySelector("#runNoteDescription").hidden, false);
    assert.match(document.querySelector("#runNoteDescription").textContent, /committed|pause/i);
  } finally {
    window.close();
  }
});

test("result analysis exposes one plain-language tab at a time", async () => {
  const { window, document, app } = await createTypingPage();

  try {
    app.setResultAnalysisTab("errors");
    assert.equal(document.querySelector("#errorDetails").hidden, false);
    assert.equal(document.querySelector("#rhythmDetails").hidden, true);
    assert.equal(document.querySelector("#errorsTab").getAttribute("aria-selected"), "true");
    assert.equal(document.querySelector("#rhythmTab").getAttribute("aria-selected"), "false");
  } finally {
    window.close();
  }
});

test("a delayed aligned transition becomes a passage note", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "abc", durationSeconds: 30 }],
  });

  try {
    app.handleCharacter("a", 0);
    app.handleCharacter("b", 100);
    app.handleCharacter("c", 1500);
    assert.match(document.querySelector("#runNoteList").textContent, /Slow “bc”/);
    assert.match(document.querySelector(".run-annotation").title, /slower than this run/);
  } finally {
    window.close();
  }
});

test("an unusually slow word becomes a length-normalized passage note", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "a b ccc", durationSeconds: 30 }],
  });

  try {
    app.handleCharacter("a", 0); app.handleSpace(100);
    app.handleCharacter("b", 200); app.handleSpace(300);
    app.handleCharacter("c", 400); app.handleCharacter("c", 500); app.handleCharacter("c", 1700);
    assert.match(document.querySelector("#runNoteList").textContent, /Slow word “ccc”/);
  } finally {
    window.close();
  }
});

test("a meaningful late-run pace change becomes a passage note", async () => {
  const { window, document, app } = await createTypingPage({
    catalog: [{ id: "short", title: "Short", body: "a b c", durationSeconds: 30 }],
  });

  try {
    app.handleCharacter("a", 0); app.handleSpace(100);
    app.handleCharacter("b", 200); app.handleSpace(300);
    app.handleCharacter("c", 1300);
    assert.match(document.querySelector("#runNoteList").textContent, /Pace slowed near the end/);
  } finally {
    window.close();
  }
});

test("live performance metrics stay hidden while typing", async () => {
  const { window, document } = await createTypingPage();

  try {
    assert.equal(document.querySelector("#liveMetrics").hidden, true);
  } finally {
    window.close();
  }
});

test("typing commits one word, preserves a correction, and keeps extra letters local", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");
  const type = (key) => input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));

  try {
    type("T");
    type("z");
    type("Backspace");
    type("y");
    type(" ");
    assert.equal(document.querySelectorAll("#textDisplay .char")[1].classList.contains("corrected"), true);
    type("w"); type("e"); type("l"); type("l"); type("l");
    assert.equal(document.querySelectorAll("#textDisplay .extra-char").length, 1);
    type(" ");
    assert.equal(document.querySelector(".active-word").textContent.startsWith("is"), true);
    assert.equal(document.querySelectorAll("#textDisplay .extra-char").length, 1);
    assert.equal(Number(document.querySelector("#accuracyValue").textContent) < 100, true);

    document.querySelector("#restartButton").click();
    assert.equal(input.value, "");
    assert.equal(document.querySelector("#speedValue").textContent, "0");
    assert.equal(document.querySelector("#resultPanel").hidden, true);
  } finally {
    document.querySelector("#restartButton").click();
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
    document.querySelector("#restartButton").click();
    window.close();
  }
});

test("selected text duration controls WPM timing and progress semantics", async () => {
  const intervalCallbacks = [];
  const { window, document } = await createTypingPage({
    storage: shortSettings,
    catalog: [{ id: "short", title: "Short piece", body: "Typing practice.", durationSeconds: 30 }],
    beforeInit(target) {
      target.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
      target.clearInterval = () => {};
    },
  });
  const input = document.querySelector("#typingInput");

  input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "T" }));
  for (let second = 0; second < 15; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector(".timer-progress").getAttribute("aria-valuemax"), "30");
  assert.equal(document.querySelector("#speedValue").textContent, "1");
  document.querySelector("#restartButton").click();
  window.close();
});

test("text selection is locked during a run and restored after reset or completion", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");
  const select = document.querySelector("#textSelect");
  const prompt = promptText(document);

  assert.equal(select.disabled, false);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "T" }));
  assert.equal(select.disabled, true);

  document.querySelector("#restartButton").click();
  assert.equal(select.disabled, false);
  assert.equal(document.querySelector("#testView").hidden, false);
  assert.equal(document.querySelector("#resultsView").hidden, true);
  input.value = prompt;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(select.disabled, false);
});

test("typing history can be cleared across aggregate and detailed stores", async () => {
  const { window, document } = await createTypingPage();
  const input = document.querySelector("#typingInput");

  input.value = promptText(document);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.confirm = () => true;
  document.querySelector("#clearHistoryButton").click();

  assert.equal(document.querySelector("#heatmapRuns").textContent, "0 runs");
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-stats-v2")), { version: 2, texts: {} });
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-runs-v2")), { version: 2, runs: [] });
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-typing-analysis-v3")), { version: 3, texts: {} });
});

test("cancelling the clear-history confirmation preserves the completed run", async () => {
  const { window, document } = await createTypingPage();
  const input = document.querySelector("#typingInput");

  input.value = promptText(document);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.confirm = () => false;
  document.querySelector("#clearHistoryButton").click();

  assert.equal(document.querySelector("#heatmapRuns").textContent, "1 run");
});

test("typing commits omitted prompt characters as errors", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");

  input.value = "T ";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#resultPanel").hidden, true);
  assert.equal(Number(document.querySelector("#accuracyValue").textContent) < 100, true);
  document.querySelector("#restartButton").click();
});

test("typing timer completes and records an incomplete run when time expires", async () => {
  const intervalCallbacks = [];
  const { window, document } = await createTypingPage({
    storage: calmPrecision,
    beforeInit(target) {
      target.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
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
  const input = document.querySelector("#typingInput");

  input.value = promptText(document);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
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
    const input = document.querySelector("#typingInput");
    input.value = promptText(document);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));

    const runs = JSON.parse(window.localStorage.getItem("typist-typing-runs-v2"));
    assert.equal(runs.runs.length, 1);
    assert.notEqual(runs.runs[0].textId, "random");
    assert.equal(window.localStorage.getItem("typist-heatmap:old"), null);

    document.querySelector("#restartButton").click();
    assert.notEqual(document.querySelector("#currentTextLabel").textContent, "");
  } finally {
    Math.random = realRandom;
  }
});

test("chart scope switches from the active text to every stored text", async () => {
  const runs = [
    { textId: "calm-precision", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 40, accuracy: 95, consistency: 88, typingScore: 126 },
    { textId: "one-word", completedAt: "2026-07-02T10:00:00.000Z", wordsPerMinute: 55, accuracy: 92, consistency: 80, typingScore: 135 },
  ];
  const { window, document, chartInstances } = await createTypingPage({
    storage: {
      "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" },
      "typist-typing-runs-v2": { version: 2, runs },
    },
  });
  const progress = chartInstances.find((chart) => chart.canvas.id === "progressChart");
  const tradeoff = chartInstances.find((chart) => chart.canvas.id === "tradeoffChart");
  assert.equal(progress.data.datasets[0].data.length, 1);
  assert.equal(tradeoff.data.datasets[0].data.length, 1);

  const allScope = document.querySelector("#chartScopeAll");
  allScope.checked = true;
  allScope.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(progress.data.datasets[0].data.length, 2);
  assert.equal(tradeoff.data.datasets[0].data.length, 2);
  assert.equal(progress.data.datasets[0].data[1].textTitle, "One word at a time");
  assert.equal(tradeoff.data.datasets[0].data[1].textTitle, "One word at a time");
});

test("all-text progress offers an explicitly approximate normalized-speed series", async () => {
  const { window, chartInstances } = await createTypingPage({
    storage: {
      "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "all" },
      "typist-typing-runs-v2": { version: 2, runs: [{ textId: "calm-precision", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 40, accuracy: 95, consistency: 88, typingScore: 126, approximateNormalizedWpm: 36 }] },
    },
  });

  try {
    const chart = chartInstances.find((instance) => instance.canvas.id === "progressChart");
    assert.equal(chart.data.datasets.some((dataset) => dataset.label === "Approx. normalized WPM"), true);
  } finally {
    window.close();
  }
});

test("result progress detail compares only runs from the active text", async () => {
  const { window, document, app } = await createTypingPage({
    storage: {
      "typist-typing-settings-v2": { selectedText: "short", chartScope: "text" },
      "typist-typing-runs-v2": { version: 2, runs: [
        { textId: "short", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 20, accuracy: 90, consistency: 80, typingScore: 98 },
        { textId: "other", completedAt: "2026-07-02T10:00:00.000Z", wordsPerMinute: 90, accuracy: 99, consistency: 90, typingScore: 179 },
      ] },
    },
    catalog: [
      { id: "short", title: "Short", body: "a", durationSeconds: 30 },
      { id: "other", title: "Other", body: "b", durationSeconds: 30 },
    ],
  });

  try {
    app.handleCharacter("a", 0);
    assert.match(document.querySelector("#progressDetailIntro").textContent, /same piece/);
    assert.doesNotMatch(document.querySelector("#progressDetailIntro").textContent, /90 WPM/);
  } finally {
    window.close();
  }
});

test("trend tabs reveal one chart at a time", async () => {
  const { document } = await createTypingPage();

  assert.equal(document.querySelector("#progressPanel").hidden, false);
  assert.equal(document.querySelector("#tradeoffPanel").hidden, true);
  document.querySelector("#tradeoffTab").click();
  assert.equal(document.querySelector("#progressPanel").hidden, true);
  assert.equal(document.querySelector("#tradeoffPanel").hidden, false);
  assert.equal(document.querySelector("#tradeoffTab").getAttribute("aria-selected"), "true");
});

test("the passage shows one lens at a time and each states its own scope", async () => {
  const { window, document, app } = await createTypingPage({ catalog: shortText });

  try {
    app.handleCharacter("a", 0);
    app.handleCharacter("b", 100);

    // Notes lead: the chips are the index into the passage.
    assert.equal(document.querySelector("#lensNotes").getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector("#passageLegend").hidden, true);
    assert.equal(document.querySelector("#allSpeedScope").textContent, "1 run");

    document.querySelector("#lensAllAccuracy").click();
    assert.equal(document.querySelector("#lensAllAccuracy").getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector("#lensNotes").getAttribute("aria-pressed"), "false");
    assert.equal(document.querySelector("#runNoteList").hidden, true);
    assert.equal(document.querySelector("#passageLegend").hidden, false);
    assert.match(document.querySelector("#passageLensHint").textContent, /across every recorded run/);
    assert.equal(document.querySelectorAll("#resultTextDisplay .heatmap-char").length, 2);
    assert.equal(document.querySelectorAll("#resultTextDisplay .prompt-word").length, 0);

    document.querySelector("#lensNotes").click();
    assert.equal(document.querySelector("#passageLegend").hidden, true);
    assert.equal(document.querySelectorAll("#resultTextDisplay .prompt-word").length, 1);
  } finally {
    window.close();
  }
});

test("only one passage is rendered on the result screen", async () => {
  const { window, document } = await createTypingPage({ storage: calmPrecision });
  const input = document.querySelector("#typingInput");

  try {
    input.value = promptText(document);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));

    // The live prompt plus exactly one result passage — no duplicated copies.
    assert.equal(document.querySelectorAll("#resultsView .text-display").length, 1);
    assert.equal(document.querySelector("#heatmapDisplay"), null);
    assert.equal(document.querySelector("#lastRunHeatmap"), null);
  } finally {
    window.close();
  }
});
