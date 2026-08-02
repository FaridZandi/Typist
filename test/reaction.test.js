// Reaction-test and Dvorak-schematic coverage. These boot the real pages and
// drive them through the DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { createDvorakPage, createReactionPage, dispatchKey } from "./helpers/page.js";
import { renderDvorakKeyboard } from "../src/shared/keyboard-layout.js";

const settle = () => new Promise((done) => setTimeout(done, 140));

test("Dvorak renderer creates all expected keys and supports a custom dataset", async () => {
  const { document } = await createDvorakPage();
  const container = document.querySelector("#dvorakKeyboard");

  renderDvorakKeyboard(container, { datasetName: "reactionKey" });

  const keys = [...container.querySelectorAll(".key")];
  assert.equal(keys.length, 47);
  assert.equal(keys[0].textContent, "`");
  assert.equal(keys[13].textContent, "'");
  assert.equal(keys[13].dataset.reactionKey, "'");
  assert.equal(keys.find((key) => key.textContent === "H").dataset.reactionKey, "h");
});

test("reaction test accepts warmup, records a hit, and completes on Escape", async () => {
  const { window, document } = await createReactionPage();

  document.querySelector("#startButton").click();
  assert.equal(document.querySelector("#targetLetter").textContent, "H");

  dispatchKey(window, "h");
  await settle();

  dispatchKey(window, document.querySelector("#targetLetter").textContent);
  assert.equal(document.querySelector("#hitValue").textContent, "1");

  dispatchKey(window, "Escape");
  assert.equal(document.querySelector("#reactionResultPanel").hidden, false);
  assert.equal(document.querySelector("#finalHits").textContent, "1");
});

test("reaction errors update both involved keys and persist with the completed run", async () => {
  const { window, document } = await createReactionPage();

  document.querySelector("#startButton").click();
  dispatchKey(window, "h");
  await settle();

  const target = document.querySelector("#targetLetter").textContent.toLowerCase();
  const wrongKey = target === "x" ? "q" : "x";
  dispatchKey(window, wrongKey);

  assert.equal(document.querySelector("#errorValue").textContent, "1");
  const keyStats = JSON.parse(window.localStorage.getItem("typist-reaction-key-stats"));
  assert.equal(keyStats[target].wrong, 1);
  assert.equal(keyStats[target].errors[wrongKey], 1);
  assert.equal(keyStats[wrongKey].wrong, 1);
  assert.equal(keyStats[wrongKey].errors[target], 1);

  dispatchKey(window, "Escape");
  const history = JSON.parse(window.localStorage.getItem("typist-reaction-history"));
  assert.equal(history.length, 1);
  assert.equal(history[0].errors, 1);
});

test("reaction warmup and unsupported keys do not affect run metrics", async () => {
  const { window, document } = await createReactionPage();

  document.querySelector("#startButton").click();
  dispatchKey(window, "x");
  assert.equal(document.querySelector("#errorValue").textContent, "0");
  assert.equal(document.querySelector("#hitValue").textContent, "0");

  dispatchKey(window, "h");
  await settle();
  dispatchKey(window, "ArrowLeft");
  dispatchKey(window, " ");

  assert.equal(document.querySelector("#errorValue").textContent, "0");
  assert.equal(document.querySelector("#hitValue").textContent, "0");
  dispatchKey(window, "Escape");
});

test("reaction can restrict targets to letters and never repeats a solved target", async () => {
  const { window, document } = await createReactionPage();
  const includeNonLetters = document.querySelector("#includeNonLetters");
  includeNonLetters.checked = false;
  includeNonLetters.dispatchEvent(new window.Event("change", { bubbles: true }));

  document.querySelector("#startButton").click();
  dispatchKey(window, "h");
  await settle();
  const firstTarget = document.querySelector("#targetLetter").textContent;
  assert.match(firstTarget, /^[A-Z]$/);
  dispatchKey(window, firstTarget);

  const secondTarget = document.querySelector("#targetLetter").textContent;
  assert.match(secondTarget, /^[A-Z]$/);
  assert.notEqual(secondTarget, firstTarget);
  dispatchKey(window, "Escape");
});

test("reaction timer records a zero-attempt run when it expires", async () => {
  const intervalCallbacks = [];
  const { window, document } = await createReactionPage({
    beforeInit(target) {
      target.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
      target.clearInterval = () => {};
    },
  });

  document.querySelector("#startButton").click();
  dispatchKey(window, "h");
  await settle();
  assert.equal(intervalCallbacks.length, 1);
  for (let second = 0; second < 60; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector("#reactionResultPanel").hidden, false);
  const history = JSON.parse(window.localStorage.getItem("typist-reaction-history"));
  assert.deepEqual(
    { hits: history[0].hits, errors: history[0].errors, accuracy: history[0].accuracy },
    { hits: 0, errors: 0, accuracy: 100 },
  );
});

test("reaction recovers from malformed persisted history and key statistics", async () => {
  const { window, document } = await createReactionPage({
    storage: {
      "typist-reaction-history": { invalid: true },
      "typist-reaction-key-stats": { h: { correct: "not a number" } },
    },
  });

  assert.equal(document.querySelectorAll("#reactionAccuracyKeyboard .key").length, 47);
  assert.match(document.querySelector('#reactionAccuracyKeyboard [data-key="h"]').title, /no attempts yet/);
  document.querySelector("#startButton").click();
  assert.equal(document.querySelector("#targetLetter").textContent, "H");
  dispatchKey(window, "Escape");
});

test("reaction metric mode updates keyboard labels and confirmed clearing resets history", async () => {
  const { window, document } = await createReactionPage();

  document.querySelector("#startButton").click();
  dispatchKey(window, "h");
  await settle();
  const target = document.querySelector("#targetLetter").textContent.toLowerCase();
  dispatchKey(window, target);
  const accuracyKey = document.querySelector(`#reactionAccuracyKeyboard [data-key="${target}"]`);
  assert.match(accuracyKey.title, /EMA accuracy/);

  const lifetime = document.querySelector('[value="lifetime"]');
  lifetime.checked = true;
  lifetime.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(accuracyKey.title, /lifetime accuracy/);

  dispatchKey(window, "Escape");
  window.confirm = () => false;
  document.querySelector("#clearReactionHistoryButton").click();
  assert.equal(JSON.parse(window.localStorage.getItem("typist-reaction-history")).length, 1);

  window.confirm = () => true;
  document.querySelector("#clearReactionHistoryButton").click();
  assert.deepEqual(JSON.parse(window.localStorage.getItem("typist-reaction-history")), []);
  assert.match(accuracyKey.title, /no attempts yet/);
});

test("reaction settings persist and restore across page loads", async () => {
  const { window, document } = await createReactionPage();

  const focus = document.querySelector("#focusExponent");
  focus.value = "2.5";
  focus.dispatchEvent(new window.Event("input", { bubbles: true }));
  const includeNonLetters = document.querySelector("#includeNonLetters");
  includeNonLetters.checked = false;
  includeNonLetters.dispatchEvent(new window.Event("change", { bubbles: true }));
  const lifetime = document.querySelector('[value="lifetime"]');
  lifetime.checked = true;
  lifetime.dispatchEvent(new window.Event("change", { bubbles: true }));

  const settings = JSON.parse(window.localStorage.getItem("typist-reaction-settings"));
  const restored = await createReactionPage({ storage: { "typist-reaction-settings": settings } });

  assert.equal(restored.document.querySelector("#focusExponent").value, "2.5");
  assert.equal(restored.document.querySelector("#focusExponentValue").value, "2.5");
  assert.equal(restored.document.querySelector("#includeNonLetters").checked, false);
  assert.equal(restored.document.querySelector('[value="lifetime"]').checked, true);
});

test("reaction metronome controls update labels and persist their settings", async () => {
  const { window, document } = await createReactionPage();

  const duration = document.querySelector("#metronomeDuration");
  duration.value = "75";
  duration.dispatchEvent(new window.Event("input", { bubbles: true }));
  const interval = document.querySelector("#metronomeInterval");
  interval.value = "300";
  interval.dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#metronomeDurationValue").value, "75 ms");
  assert.equal(document.querySelector("#metronomeIntervalValue").value, "300 ms");
  const settings = JSON.parse(window.localStorage.getItem("typist-reaction-settings"));
  assert.equal(settings.metronomeDuration, 75);
  assert.equal(settings.metronomeInterval, 300);
  window.close();
});
