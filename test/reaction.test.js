// Reaction-test and Dvorak-schematic coverage. These pages are still classic
// scripts, so they are evaluated inside JSDOM rather than imported as modules.

import assert from "node:assert/strict";
import test from "node:test";

import { createLegacyPage as createPage, dispatchKey } from "./helpers/page.js";

test("Dvorak renderer creates all expected keys and supports a custom dataset", async () => {
  const dom = await createPage("dvorak.html", ["keyboard-layout.js"]);
  const { document } = dom.window;
  const container = document.querySelector("#dvorakKeyboard");

  dom.window.renderDvorakKeyboard(container, { datasetName: "reactionKey" });

  const keys = [...container.querySelectorAll(".key")];
  assert.equal(keys.length, 47);
  assert.equal(keys[0].textContent, "`");
  assert.equal(keys[13].textContent, "'");
  assert.equal(keys[13].dataset.reactionKey, "'");
  assert.equal(keys.find((key) => key.textContent === "H").dataset.reactionKey, "h");
});

test("reaction test accepts warmup, records a hit, and completes on Escape", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document } = dom.window;

  document.querySelector("#startButton").click();
  assert.equal(document.querySelector("#targetLetter").textContent, "H");

  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));

  const target = document.querySelector("#targetLetter").textContent;
  dispatchKey(dom.window, target);
  assert.equal(document.querySelector("#hitValue").textContent, "1");

  dispatchKey(dom.window, "Escape");
  assert.equal(document.querySelector("#reactionResultPanel").hidden, false);
  assert.equal(document.querySelector("#finalHits").textContent, "1");
});

test("reaction errors update both involved keys and persist with the completed run", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document, localStorage } = dom.window;

  document.querySelector("#startButton").click();
  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));

  const target = document.querySelector("#targetLetter").textContent.toLowerCase();
  const wrongKey = target === "x" ? "q" : "x";
  dispatchKey(dom.window, wrongKey);

  assert.equal(document.querySelector("#errorValue").textContent, "1");
  const keyStats = JSON.parse(localStorage.getItem("typist-reaction-key-stats"));
  assert.equal(keyStats[target].wrong, 1);
  assert.equal(keyStats[target].errors[wrongKey], 1);
  assert.equal(keyStats[wrongKey].wrong, 1);
  assert.equal(keyStats[wrongKey].errors[target], 1);

  dispatchKey(dom.window, "Escape");
  const history = JSON.parse(localStorage.getItem("typist-reaction-history"));
  assert.equal(history.length, 1);
  assert.equal(history[0].errors, 1);
});

test("reaction warmup and unsupported keys do not affect run metrics", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document } = dom.window;

  document.querySelector("#startButton").click();
  dispatchKey(dom.window, "x");
  assert.equal(document.querySelector("#errorValue").textContent, "0");
  assert.equal(document.querySelector("#hitValue").textContent, "0");

  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));
  dispatchKey(dom.window, "ArrowLeft");
  dispatchKey(dom.window, " ");

  assert.equal(document.querySelector("#errorValue").textContent, "0");
  assert.equal(document.querySelector("#hitValue").textContent, "0");
  dispatchKey(dom.window, "Escape");
});

test("reaction can restrict targets to letters and never repeats a solved target", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document, Event } = dom.window;
  const includeNonLetters = document.querySelector("#includeNonLetters");
  includeNonLetters.checked = false;
  includeNonLetters.dispatchEvent(new Event("change", { bubbles: true }));

  document.querySelector("#startButton").click();
  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));
  const firstTarget = document.querySelector("#targetLetter").textContent;
  assert.match(firstTarget, /^[A-Z]$/);
  dispatchKey(dom.window, firstTarget);

  const secondTarget = document.querySelector("#targetLetter").textContent;
  assert.match(secondTarget, /^[A-Z]$/);
  assert.notEqual(secondTarget, firstTarget);
  dispatchKey(dom.window, "Escape");
});

test("reaction timer records a zero-attempt run when it expires", async () => {
  const intervalCallbacks = [];
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ], {
    beforeScripts(window) {
      window.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
      window.clearInterval = () => {};
    },
  });
  const { document, localStorage } = dom.window;

  document.querySelector("#startButton").click();
  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));
  assert.equal(intervalCallbacks.length, 1);
  for (let second = 0; second < 60; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector("#reactionResultPanel").hidden, false);
  const history = JSON.parse(localStorage.getItem("typist-reaction-history"));
  assert.deepEqual(
    { hits: history[0].hits, errors: history[0].errors, accuracy: history[0].accuracy },
    { hits: 0, errors: 0, accuracy: 100 },
  );
});

test("reaction recovers from malformed persisted history and key statistics", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ], {
    storage: {
      "typist-reaction-history": { invalid: true },
      "typist-reaction-key-stats": { h: { correct: "not a number" } },
    },
  });
  const { document } = dom.window;

  assert.equal(document.querySelectorAll("#reactionAccuracyKeyboard .key").length, 47);
  assert.match(
    document.querySelector('#reactionAccuracyKeyboard [data-key="h"]').title,
    /no attempts yet/,
  );
  document.querySelector("#startButton").click();
  assert.equal(document.querySelector("#targetLetter").textContent, "H");
  dispatchKey(dom.window, "Escape");
});

test("reaction metric mode updates keyboard labels and confirmed clearing resets history", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document, Event, localStorage } = dom.window;

  document.querySelector("#startButton").click();
  dispatchKey(dom.window, "h");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 140));
  const target = document.querySelector("#targetLetter").textContent.toLowerCase();
  dispatchKey(dom.window, target);
  const accuracyKey = document.querySelector(
    `#reactionAccuracyKeyboard [data-key="${target}"]`,
  );
  assert.match(accuracyKey.title, /EMA accuracy/);

  const lifetime = document.querySelector('[value="lifetime"]');
  lifetime.checked = true;
  lifetime.dispatchEvent(new Event("change", { bubbles: true }));
  assert.match(accuracyKey.title, /lifetime accuracy/);

  dispatchKey(dom.window, "Escape");
  dom.window.confirm = () => false;
  document.querySelector("#clearReactionHistoryButton").click();
  assert.equal(JSON.parse(localStorage.getItem("typist-reaction-history")).length, 1);

  dom.window.confirm = () => true;
  document.querySelector("#clearReactionHistoryButton").click();
  assert.deepEqual(JSON.parse(localStorage.getItem("typist-reaction-history")), []);
  assert.match(accuracyKey.title, /no attempts yet/);
});

test("reaction settings persist and restore across page loads", async () => {
  const firstPage = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document, Event, localStorage } = firstPage.window;

  const focus = document.querySelector("#focusExponent");
  focus.value = "2.5";
  focus.dispatchEvent(new Event("input", { bubbles: true }));
  const includeNonLetters = document.querySelector("#includeNonLetters");
  includeNonLetters.checked = false;
  includeNonLetters.dispatchEvent(new Event("change", { bubbles: true }));
  const lifetime = document.querySelector('[value="lifetime"]');
  lifetime.checked = true;
  lifetime.dispatchEvent(new Event("change", { bubbles: true }));

  const settings = JSON.parse(localStorage.getItem("typist-reaction-settings"));
  const restoredPage = await createPage(
    "reaction.html",
    ["keyboard-layout.js", "reaction.js"],
    { storage: { "typist-reaction-settings": settings } },
  );
  const restoredDocument = restoredPage.window.document;

  assert.equal(restoredDocument.querySelector("#focusExponent").value, "2.5");
  assert.equal(restoredDocument.querySelector("#focusExponentValue").value, "2.5");
  assert.equal(restoredDocument.querySelector("#includeNonLetters").checked, false);
  assert.equal(restoredDocument.querySelector('[value="lifetime"]').checked, true);
});

test("reaction metronome controls update labels and persist their settings", async () => {
  const dom = await createPage("reaction.html", [
    "keyboard-layout.js",
    "reaction.js",
  ]);
  const { document, Event, localStorage } = dom.window;

  const duration = document.querySelector("#metronomeDuration");
  duration.value = "75";
  duration.dispatchEvent(new Event("input", { bubbles: true }));
  const interval = document.querySelector("#metronomeInterval");
  interval.value = "300";
  interval.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#metronomeDurationValue").value, "75 ms");
  assert.equal(document.querySelector("#metronomeIntervalValue").value, "300 ms");
  const settings = JSON.parse(localStorage.getItem("typist-reaction-settings"));
  assert.equal(settings.metronomeDuration, 75);
  assert.equal(settings.metronomeInterval, 300);
  dom.window.close();
});
