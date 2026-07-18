const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const root = resolve(__dirname, "..");

async function createPage(htmlFile, scripts, options = {}) {
  const { storage = {}, beforeScripts } = options;
  const html = await readFile(resolve(root, htmlFile), "utf8");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://typist.test/",
  });
  const { window } = dom;

  for (const [key, value] of Object.entries(storage)) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  beforeScripts?.(window);

  window.Chart = class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options;
    }

    update() {}

    destroy() {}
  };

  for (const script of scripts) {
    window.eval(await readFile(resolve(root, script), "utf8"));
  }

  return dom;
}

function dispatchKey(window, key) {
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
}

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

test("typing test records a completed prompt and renders its results", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(document.querySelector("#heatmapRuns").textContent, "1");
  assert.equal(input.disabled, true);
  assert.match(document.querySelector("#finalSpeed").textContent, /^\d+$/);
});

test("typing test preserves corrected mistakes and realigns at a space", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");

  try {
    input.value = "Tz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "Ty";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(
      document.querySelectorAll("#textDisplay .char")[1].classList.contains("corrected"),
      true,
    );

    input.value = "Tping ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const characters = document.querySelectorAll("#textDisplay .char");
    assert.equal(characters[1].classList.contains("incorrect"), true);
    assert.equal(characters[6].classList.contains("correct"), true);

    document.querySelector("#restartButton").click();
    assert.equal(input.value, "");
    assert.equal(document.querySelector("#speedValue").textContent, "0");
    assert.equal(document.querySelector("#resultPanel").hidden, true);
  } finally {
    document.querySelector("#restartButton").click();
    dom.window.close();
  }
});

test("typing history can be cleared after a completed run", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  const { document, Event, localStorage } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#clearHistoryButton").click();

  assert.equal(document.querySelector("#heatmapRuns").textContent, "0");
  const savedHistory = JSON.parse(localStorage.getItem("typist-heatmap:" + prompt));
  assert.equal(savedHistory.runs, 0);
  assert.deepEqual(savedHistory.runHistory, []);
});

test("typing test truncates oversized pasted input to the prompt length", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  input.value = `${prompt} trailing text that must not be counted`;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(input.value, prompt);
  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(document.querySelector("#heatmapRuns").textContent, "1");
});

test("typing timer completes and records an incomplete run when time expires", async () => {
  const intervalCallbacks = [];
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) {
      window.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
      window.clearInterval = () => {};
    },
  });
  const { document, Event, localStorage } = dom.window;
  const input = document.querySelector("#typingInput");

  input.value = "T";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(intervalCallbacks.length, 1);
  intervalCallbacks[0]();
  for (let second = 1; second < 60; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(input.disabled, true);
  const storageKey = Object.keys(localStorage).find((key) =>
    key.startsWith("typist-heatmap:"),
  );
  assert.equal(JSON.parse(localStorage.getItem(storageKey)).runs, 1);
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
