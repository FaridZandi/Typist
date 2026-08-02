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

  const chartInstances = [];
  window.Chart = class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.data = config.data;
      this.options = config.options;
      chartInstances.push(this);
    }

    update() {}

    destroy() {}
  };
  window.__chartInstances = chartInstances;

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

test("typing test records a completed text-id run and renders its results", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(document.querySelector("#testView").hidden, true);
  assert.equal(document.querySelector("#resultsView").hidden, false);
  assert.equal(document.querySelector("#heatmapRuns").textContent, "1");
  assert.equal(input.disabled, true);
  assert.match(document.querySelector("#finalSpeed").textContent, /^\d+$/);
  assert.equal(document.querySelector("#accuracyLegendLowest").textContent, "100%");
  assert.equal(document.querySelector("#accuracyLegendHighest").textContent, "100%");
  const runs = JSON.parse(dom.window.localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(runs.runs[0].textId, "calm-precision");
});

test("typing caret starts at the beginning of the active word", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const activeWord = dom.window.document.querySelector(".active-word");
  assert.equal(activeWord.firstElementChild.classList.contains("typing-caret"), true);
  assert.equal(activeWord.querySelector(".current"), null);
});

test("typing renders the caret before deferred metric updates", async () => {
  const frames = [];
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
    beforeScripts(window) {
      window.requestAnimationFrame = (callback) => {
        frames.push(callback);
        return frames.length;
      };
    },
  });
  const { document } = dom.window;
  const input = document.querySelector("#typingInput");

  try {
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "T",
    }));

    const activeWord = document.querySelector(".active-word");
    const caret = activeWord.querySelector(".typing-caret");
    assert.equal(caret.previousElementSibling.textContent, "T");
    assert.equal(document.querySelector("#speedValue").textContent, "0");
    assert.equal(frames.length, 1);

    frames.shift()();
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.notEqual(document.querySelector("#speedValue").textContent, "0");
  } finally {
    document.querySelector("#restartButton").click();
    dom.window.close();
  }
});

test("typing consistency uses every key press, including mistakes", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document } = dom.window;

  try {
    dom.window.handleCharacter("x", 0);
    dom.window.handleCharacter("x", 100);
    dom.window.handleCharacter("x", 1000);

    assert.equal(document.querySelector("#consistencyValue").textContent, "20");
  } finally {
    document.querySelector("#restartButton").click();
    dom.window.close();
  }
});

test("typing stores bounded event records and separates corrected process errors from final text", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "short", chartScope: "text" } },
    beforeScripts(window) {
      window.typingTexts = [{ id: "short", title: "Short", body: "ab", durationSeconds: 30 }];
      window.setInterval = () => 1;
      window.clearInterval = () => {};
    },
  });
  try {
    dom.window.handleCharacter("x", 0);
    dom.window.handleBackspace(100);
    dom.window.handleCharacter("a", 200);
    dom.window.handleCharacter("b", 300);

    assert.equal(dom.window.document.querySelector("#finalAccuracyDetail").textContent, "100");
    assert.equal(dom.window.document.querySelector("#processAccuracy").textContent, "67");
    assert.match(dom.window.document.querySelector("#runObservation").textContent, /corrected error/);
    const analysis = JSON.parse(dom.window.localStorage.getItem("typist-typing-analysis-v3"));
    const stored = analysis.texts.short.runs[0];
    assert.deepEqual(stored.events.map((event) => event.type), ["character", "backspace", "character", "character"]);
    assert.equal(stored.summary.correctedErrors, 1);
    assert.equal(stored.summary.remainingErrors, 0);
    assert.equal(stored.derivationVersion, 1);
    assert.equal(stored.progressState.derivationVersion, 1);
    assert.match(dom.window.document.querySelector("#runNoteList").textContent, /Correction/);
    assert.match(dom.window.document.querySelector("#transitionDetailSummary").textContent, /1 key-to-key movement.*collecting examples/);
    assert.match(dom.window.document.querySelector("#transitionList").textContent, /“ab”/);
    assert.match(dom.window.document.querySelector("#wordList").textContent, /“ab”/);
  } finally {
    dom.window.close();
  }
});

test("transition evidence remains learning until it reaches the coverage threshold", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "ab", durationSeconds: 30 }]; },
  });
  try {
    const events = [{ type: "character", key: "a", expectedCharacter: "a", wordIndex: 0, bufferOffset: 0, timestampMs: 0 }, { type: "character", key: "b", expectedCharacter: "b", wordIndex: 0, bufferOffset: 1, timestampMs: 100 }];
    const learning = dom.window.getTransitionAggregate(Array.from({ length: 11 }, () => ({ events })))[0];
    const supported = dom.window.getTransitionAggregate(Array.from({ length: 12 }, () => ({ events })))[0];
    assert.deepEqual({ samples: learning.samples, confidence: learning.confidence }, { samples: 11, confidence: "learning" });
    assert.deepEqual({ samples: supported.samples, confidence: supported.confidence }, { samples: 12, confidence: "supported" });
  } finally {
    dom.window.close();
  }
});

test("a supported high-impact transition becomes a focused practice recommendation", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const coaching = dom.window.getCoaching({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [{ pair: "tr", samples: 18, slowdownPercent: 31, confidence: "supported" }] });
    assert.match(coaching.observation, /“tr”.*31% slower/);
    assert.match(coaching.recommendation, /“tr”/);
  } finally {
    dom.window.close();
  }
});

test("transition evidence keeps its cross-text coverage with the aggregate", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const events = [{ type: "character", key: "t", expectedCharacter: "t", wordIndex: 0, bufferOffset: 0, timestampMs: 0 }, { type: "character", key: "r", expectedCharacter: "r", wordIndex: 0, bufferOffset: 1, timestampMs: 200 }];
    const transition = dom.window.getTransitionAggregate([
      { textId: "first", events },
      { textId: "second", events },
    ])[0];
    assert.equal(transition.sourceTextCount, 2);
    assert.equal(dom.window.formatBundleEvidence({ kind: "transition", scope: "tr", sampleCount: transition.samples, confidence: "supported", sourceTextCount: transition.sourceTextCount }), "Evidence: 2 examples for “tr” across 2 texts · supported pattern");
  } finally { dom.window.close(); }
});

test("trigram evidence uses contiguous correct letters and cross-text coverage", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const events = ["s", "t", "r"].map((key, index) => ({ type: "character", key, expectedCharacter: key, wordIndex: 0, bufferOffset: index, timestampMs: index * 150 }));
    const trigram = dom.window.getTransitionAggregate([{ textId: "first", events }, { textId: "second", events }], 3)[0];
    assert.deepEqual({ pair: trigram.pair, samples: trigram.samples, sourceTextCount: trigram.sourceTextCount }, { pair: "str", samples: 2, sourceTextCount: 2 });
    const bundle = dom.window.getFeedbackBundles({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], trigrams: [{ ...trigram, confidence: "supported", slowdownPercent: 30 }] })[0];
    assert.equal(bundle.kind, "trigram");
    assert.match(bundle.recommendation, /“str”/);
  } finally { dom.window.close(); }
});

test("feedback bundles rank their evidence and retain the supporting contract", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({ pauseCount: 2, pauseThresholdMs: 700, correctedErrors: 4, remainingErrors: 2, transitions: [] });
    assert.equal(bundles[0].kind, "corrections");
    assert.deepEqual(Object.keys(bundles[0]).filter((key) => ["scope", "sampleCount", "confidence", "impact", "stability", "actionability"].includes(key)).sort(), ["actionability", "confidence", "impact", "sampleCount", "scope", "stability"]);
    assert.deepEqual(Object.keys(bundles[0].evidence).sort(), ["confidence", "sampleCount", "scope", "sourceTextCount"]);
    assert.equal(bundles[0].interpretation, bundles[0].title);
    assert.equal(bundles[0].practice, bundles[0].recommendation);
  } finally { dom.window.close(); }
});

test("no eligible pattern produces a neutral collect-more-evidence story", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const coaching = dom.window.getCoaching({ finalAccuracy: 100, correctedErrors: 0, pauseCount: 0, remainingErrors: 0, transitions: [] });
    assert.match(coaching.title, /Collect another/);
    assert.match(coaching.observation, /no repeated pattern/);
  } finally { dom.window.close(); }
});

test("a common supported pattern beats a rarer issue, and ranking is deterministic", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const summary = {
      pauseCount: 0, correctedErrors: 0, remainingErrors: 4,
      transitions: [{ pair: "tr", samples: 18, slowdownPercent: 31, confidence: "supported", sourceTextCount: 2 }],
      characters: [], wordPatterns: [], prefixPatterns: [], suffixPatterns: [],
    };
    const first = dom.window.getFeedbackBundles(summary);
    assert.equal(first[0].kind, "transition");
    assert.deepEqual(dom.window.getFeedbackBundles(summary), first);
  } finally { dom.window.close(); }
});

test("a lower-actionability word pattern does not displace a similarly impactful key pattern", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({
      pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], prefixPatterns: [], suffixPatterns: [],
      characters: [{ character: "a", attempts: 18, correct: 13, accuracy: 72, confidence: "supported", sourceTextCount: 2 }],
      wordPatterns: [{ word: "steady", samples: 6, finalErrors: 5, confidence: "supported", sourceTextCount: 2 }],
    });
    assert.equal(bundles[0].kind, "character");
  } finally { dom.window.close(); }
});

test("a previous supported recommendation remains primary when the new evidence is close", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = [
      { kind: "character", scope: "a", confidence: "supported", priority: 100 },
      { kind: "transition", scope: "tr", confidence: "supported", priority: 90 },
    ];
    assert.equal(dom.window.choosePrimaryFeedback(bundles, { kind: "transition", scope: "tr", confidence: "supported" }).kind, "transition");
    assert.equal(dom.window.choosePrimaryFeedback(bundles, { kind: "transition", scope: "tr", confidence: "supported", priority: 40 }).kind, "transition");
    assert.equal(dom.window.choosePrimaryFeedback([{ ...bundles[0] }, { ...bundles[1], priority: 80 }], { kind: "transition", scope: "tr", confidence: "supported" }).kind, "character");
  } finally { dom.window.close(); }
});

test("secondary feedback stays collapsed until a run has more than one useful bundle", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({ pauseCount: 2, pauseThresholdMs: 700, correctedErrors: 4, remainingErrors: 2, transitions: [] });
    dom.window.renderSecondaryFeedback(bundles);
    const { document } = dom.window;
    assert.equal(document.querySelector("#secondaryFeedback").hidden, false);
    assert.equal(document.querySelector("#secondaryFeedback").open, false);
    assert.equal(document.querySelector("#secondaryFeedbackCount").textContent, "· 2");
    assert.equal(document.querySelectorAll("#secondaryFeedbackList .secondary-feedback-item").length, 2);
    assert.match(document.querySelector("#secondaryFeedbackList").textContent, /Practice:/);
    dom.window.renderSecondaryFeedback(bundles, bundles[1]);
    assert.doesNotMatch(document.querySelector("#secondaryFeedbackList").textContent, new RegExp(bundles[1].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(document.querySelector("#secondaryFeedbackList").textContent, new RegExp(bundles[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    dom.window.renderSecondaryFeedback(bundles.slice(0, 1));
    assert.equal(document.querySelector("#secondaryFeedback").hidden, true);
  } finally { dom.window.close(); }
});

test("coaching evidence states the scope and confidence behind a bundle", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    assert.equal(dom.window.formatBundleEvidence({ kind: "transition", scope: "tr", sampleCount: 18, confidence: "supported" }), "Evidence: 18 examples for “tr” · supported pattern");
    assert.equal(dom.window.formatBundleEvidence({ kind: "character", scope: "a", sampleCount: 16, confidence: "supported", sourceTextCount: 2 }), "Evidence: 16 examples for “a” across 2 texts · supported pattern");
    assert.equal(dom.window.formatBundleEvidence({ kind: "pauses", scope: "run", sampleCount: 2, confidence: "run-only" }), "Evidence: 2 examples across the run · this run");
  } finally { dom.window.close(); }
});

test("a supported weak character across texts becomes focused practice feedback", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({
      pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [],
      characters: [{ character: "a", attempts: 16, correct: 12, accuracy: 75, commonSubstitution: "s", confidence: "supported", sourceTextCount: 2 }],
    });
    assert.equal(bundles[0].kind, "character");
    assert.match(bundles[0].observation, /across 16 recorded attempts.*“s”/);
    assert.match(bundles[0].recommendation, /“a”/);
  } finally { dom.window.close(); }
});

test("repeated committed word errors become focused practice feedback", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({
      pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [],
      wordPatterns: [{ word: "steady", samples: 5, finalErrors: 3, confidence: "supported", sourceTextCount: 2 }],
    });
    assert.equal(bundles[0].kind, "word");
    assert.match(bundles[0].observation, /3 committed errors across 5 recorded attempts/);
    assert.match(bundles[0].recommendation, /“steady”/);
    assert.equal(dom.window.formatBundleEvidence(bundles[0]), "Evidence: 5 examples for “steady” across 2 texts · supported pattern");
  } finally { dom.window.close(); }
});

test("supported prefix and suffix patterns are described as cautious word-pattern evidence", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const record = { textId: "first", words: [{ expected: "steady", finalCorrect: 5, categories: { insertion: 0 } }] };
    const pattern = dom.window.getWordFragmentAggregate([record, record, { ...record, textId: "second" }, { ...record, textId: "second" }], "suffix")[0];
    assert.deepEqual({ fragment: pattern.fragment, samples: pattern.samples, finalErrors: pattern.finalErrors, sourceTextCount: pattern.sourceTextCount, confidence: pattern.confidence }, { fragment: "ady", samples: 4, finalErrors: 4, sourceTextCount: 2, confidence: "supported" });
    const bundle = dom.window.getFeedbackBundles({ pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [], wordPatterns: [], prefixPatterns: [], suffixPatterns: [pattern] })[0];
    assert.equal(bundle.kind, "suffix");
    assert.match(bundle.observation, /word-pattern signal, not proof/);
    assert.match(bundle.recommendation, /ending “ady”/);
  } finally { dom.window.close(); }
});

test("supported Shift timing produces a cautious technique hypothesis", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const bundles = dom.window.getFeedbackBundles({
      pauseCount: 0, correctedErrors: 0, remainingErrors: 0, transitions: [], characters: [], wordPatterns: [],
      shift: { supported: true, slowdownPercent: 42, shiftSamples: 12, sourceTextCount: 2 },
    });
    assert.equal(bundles[0].kind, "shift");
    assert.match(bundles[0].observation, /may be a timing pattern rather than a technique problem/);
    assert.equal(dom.window.formatBundleEvidence(bundles[0]), "Evidence: 12 examples for “capital letters” across 2 texts · supported pattern");
  } finally { dom.window.close(); }
});

test("character evidence tracks process accuracy, substitutions, and confidence", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const events = Array.from({ length: 12 }, (_, index) => ({ type: "character", key: index === 0 ? "x" : "a", expectedCharacter: "a", timestampMs: index * 100 }));
    const character = dom.window.getCharacterAggregate([{ events }])[0];
    assert.deepEqual({ attempts: character.attempts, accuracy: character.accuracy, commonSubstitution: character.commonSubstitution, confidence: character.confidence }, { attempts: 12, accuracy: 92, commonSubstitution: "x", confidence: "supported" });
  } finally {
    dom.window.close();
  }
});

test("word evidence requires repeated observations before it is supported", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const record = { events: [{ wordIndex: 0, timestampMs: 0 }, { wordIndex: 0, timestampMs: 200 }], words: [{ wordIndex: 0, expected: "test", finalCorrect: 4, categories: { insertion: 0 } }] };
    assert.equal(dom.window.getWordAggregate([record, record, record])[0].confidence, "learning");
    assert.equal(dom.window.getWordAggregate([record, record, record, record])[0].confidence, "supported");
  } finally {
    dom.window.close();
  }
});

test("fluency analysis measures recovery and first-to-last-third rhythm change", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const fluency = dom.window.getFluencyMetrics([
      { type: "character", key: "a", expectedCharacter: "a", timestampMs: 0 },
      { type: "character", key: "x", expectedCharacter: "b", timestampMs: 100 },
      { type: "character", key: "c", expectedCharacter: "c", timestampMs: 400 },
      { type: "character", key: "d", expectedCharacter: "d", timestampMs: 1000 },
    ]);
    assert.deepEqual({ recoveryMs: fluency.recoveryMs, recoverySamples: fluency.recoverySamples, fatiguePercent: fluency.fatiguePercent }, { recoveryMs: 300, recoverySamples: 1, fatiguePercent: 500 });
  } finally {
    dom.window.close();
  }
});

test("progress states require repeated and spaced evidence before calling improvement retained", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const day = 24 * 60 * 60 * 1000;
    const records = (speeds, days) => speeds.map((speed, index) => ({ completedAt: new Date(Date.UTC(2026, 0, 1) + days[index] * day).toISOString(), summary: { effectiveWordsPerMinute: speed } }));
    assert.equal(dom.window.getProgressState(records([70], [0])).state, "learning");
    assert.equal(dom.window.getProgressState(records([50, 50, 50, 60, 60, 60], [0, 1, 2, 3, 4, 5])).state, "recent-improvement");
    assert.equal(dom.window.getProgressState(records([50, 50, 50, 60, 60, 60, 60, 60, 60], [0, 1, 2, 3, 4, 5, 13, 14, 15])).state, "retained-improvement");
  } finally { dom.window.close(); }
});

test("a spaced meaningful decline needs a refresh, while one poor run does not", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const day = 24 * 60 * 60 * 1000;
    const records = (speeds) => speeds.map((speed, index) => ({ completedAt: new Date(Date.UTC(2026, 0, 1) + [0, 1, 2, 3, 4, 5, 13, 14, 15][index] * day).toISOString(), summary: { effectiveWordsPerMinute: speed } }));
    assert.equal(dom.window.getProgressState(records([50, 50, 50, 60, 60, 60, 40, 40, 40])).state, "needs-refresh");
    assert.notEqual(dom.window.getProgressState(records([50, 50, 50, 60, 60, 60, 60, 60, 30])).state, "needs-refresh");
  } finally { dom.window.close(); }
});

test("pattern progress uses stored event evidence and requires a spaced follow-up", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const day = 24 * 60 * 60 * 1000;
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
    const progress = dom.window.getPatternProgressState(records, "tr");
    assert.equal(progress.state, "retained-improvement");
    assert.equal(progress.sampleCount, 9);
    assert.equal(progress.occurrences, 9);
    assert.deepEqual([...progress.sourceTextIds], ["first", "second"]);
  } finally { dom.window.close(); }
});

test("pattern progress leaves old runs without event records in the learning state", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const progress = dom.window.getPatternProgressState([
      { textId: "old", completedAt: "2026-01-01T00:00:00.000Z", summary: { effectiveWordsPerMinute: 60 } },
      { textId: "old", completedAt: "2026-01-02T00:00:00.000Z", events: [] },
    ], "tr");
    assert.equal(progress.state, "learning");
    assert.equal(progress.sampleCount, 0);
    assert.equal(progress.occurrences, 0);
  } finally { dom.window.close(); }
});

test("fluency progress requires repeated pacing evidence before it is retained", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const day = 24 * 60 * 60 * 1000;
    const records = [30, 30, 30, 10, 10, 10, 10, 10, 10].map((fatiguePercent, index) => ({
      textId: "first",
      completedAt: new Date(Date.UTC(2026, 0, 1) + [0, 1, 2, 3, 4, 5, 13, 14, 15][index] * day).toISOString(),
      summary: { fatiguePercent, earlyIntervalMs: 100, lateIntervalMs: 100 + fatiguePercent },
    }));
    const progress = dom.window.getFluencyProgressState(records);
    assert.equal(progress.state, "retained-improvement");
    assert.equal(progress.sampleCount, 9);
    assert.equal(dom.window.getFluencyProgressState(records.slice(0, 1)).state, "learning");
  } finally { dom.window.close(); }
});

test("typing event records preserve modifier state", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "A", durationSeconds: 30 }]; },
  });
  try {
    const input = dom.window.document.querySelector("#typingInput");
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "A", shiftKey: true }));
    const analysis = JSON.parse(dom.window.localStorage.getItem("typist-typing-analysis-v3"));
    assert.equal(analysis.texts.short.runs[0].events[0].modifiers.shift, true);
  } finally {
    dom.window.close();
  }
});

test("catalog difficulty is deterministic and increases for punctuation or capitals", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const plain = dom.window.getTextDifficulty({ body: "steady words only" });
    const complex = dom.window.getTextDifficulty({ body: "Steady, Words! Only?" });
    assert.equal(plain, 1);
    assert.equal(complex > plain, true);
  } finally { dom.window.close(); }
});

test("Shift timing is only supported with enough Shift and lowercase samples", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const events = [];
    for (let index = 0; index < 9; index += 1) { events.push({ type: "character", expectedCharacter: "a", modifiers: { shift: false }, timestampMs: index * 200 }); events.push({ type: "character", expectedCharacter: "A", modifiers: { shift: true }, timestampMs: index * 200 + 100 }); }
    const metrics = dom.window.getShiftMetrics([{ events }]);
    assert.equal(metrics.supported, true);
    assert.equal(metrics.shiftSamples, 9);
  } finally { dom.window.close(); }
});

test("typing classifies an adjacent swapped pair as a transposition", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "ab", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("b", 0);
    dom.window.handleCharacter("a", 100);
    dom.window.handleSpace(200);
    const analysis = JSON.parse(dom.window.localStorage.getItem("typist-typing-analysis-v3"));
    assert.equal(analysis.texts.short.runs[0].summary.categories.transposition, 1);
    assert.equal(dom.window.document.querySelector("#finalAccuracyDetail").textContent, "0");
    assert.match(dom.window.document.querySelector("#errorDetailSummary").textContent, /2 final-text errors/);
    assert.equal(dom.window.document.querySelector("#errorCategoryList").textContent, "Transpositions1");
    const rhythm = dom.window.__chartInstances.find((chart) => chart.data.datasets[0].label === "Inter-key speed");
    assert.equal(rhythm.data.datasets[0].data.length, 2);
  } finally {
    dom.window.close();
  }
});

test("committed error categories become distinct, evidence-bearing run annotations", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    const annotations = dom.window.getWordErrorAnnotations({
      expected: "word",
      categories: { substitution: 1, omission: 1, insertion: 1, transposition: 1, duplication: 1, capitalization: 1, punctuation: 1 },
    });
    assert.deepEqual([...annotations.map((annotation) => annotation.kind)], ["substitution", "omission", "insertion", "transposition", "duplication", "capitalization", "punctuation"]);
    assert.equal(annotations.every((annotation) => annotation.count === 1 && annotation.message.includes("committed")), true);
  } finally { dom.window.close(); }
});

test("completed runs turn meaningful events into selectable passage notes", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "ab cd", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("b", 0);
    dom.window.handleCharacter("a", 100);
    dom.window.handleSpace(200);
    dom.window.handleCharacter("c", 1300);
    dom.window.handleCharacter("d", 1400);

    const notes = [...dom.window.document.querySelectorAll("#runNoteList .run-note")];
    assert.equal(notes.length >= 2, true);
    assert.match(notes.map((note) => note.textContent).join(" "), /transposition.*Pause/);
    assert.match(notes[0].getAttribute("aria-label"), /committed|pause/i);
    assert.equal(dom.window.document.querySelector("#resultPassage").hidden, false);
    notes[0].click();
    assert.equal(dom.window.document.querySelectorAll(".run-annotation-active").length, 2);
    assert.equal(dom.window.document.querySelectorAll("#resultTextDisplay .run-annotation-active").length, 1);
    assert.equal(dom.window.document.querySelector("#runNoteDescription").hidden, false);
    assert.match(dom.window.document.querySelector("#runNoteDescription").textContent, /committed|pause/i);
  } finally { dom.window.close(); }
});

test("result analysis exposes one plain-language tab at a time", async () => {
  const dom = await createPage("index.html", ["script.js"]);
  try {
    dom.window.setResultAnalysisTab("errors");
    const { document } = dom.window;
    assert.equal(document.querySelector("#errorDetails").hidden, false);
    assert.equal(document.querySelector("#rhythmDetails").hidden, true);
    assert.equal(document.querySelector("#errorsTab").getAttribute("aria-selected"), "true");
    assert.equal(document.querySelector("#rhythmTab").getAttribute("aria-selected"), "false");
  } finally { dom.window.close(); }
});

test("a delayed aligned transition becomes a passage note", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "abc", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("a", 0);
    dom.window.handleCharacter("b", 100);
    dom.window.handleCharacter("c", 1500);
    assert.match(dom.window.document.querySelector("#runNoteList").textContent, /Slow “bc”/);
    assert.match(dom.window.document.querySelector(".run-annotation").title, /slower than this run/);
  } finally { dom.window.close(); }
});

test("an unusually slow word becomes a length-normalized passage note", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "a b ccc", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("a", 0); dom.window.handleSpace(100);
    dom.window.handleCharacter("b", 200); dom.window.handleSpace(300);
    dom.window.handleCharacter("c", 400); dom.window.handleCharacter("c", 500); dom.window.handleCharacter("c", 1700);
    assert.match(dom.window.document.querySelector("#runNoteList").textContent, /Slow word “ccc”/);
  } finally { dom.window.close(); }
});

test("a meaningful late-run pace change becomes a passage note", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "a b c", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("a", 0); dom.window.handleSpace(100);
    dom.window.handleCharacter("b", 200); dom.window.handleSpace(300);
    dom.window.handleCharacter("c", 1300);
    assert.match(dom.window.document.querySelector("#runNoteList").textContent, /Pace slowed near the end/);
  } finally { dom.window.close(); }
});

test("live performance metrics stay hidden while typing", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  try {
    assert.equal(dom.window.document.querySelector("#liveMetrics").hidden, true);
  } finally {
    dom.window.close();
  }
});

test("typing commits one word, preserves a correction, and keeps extra letters local", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document } = dom.window;
  const input = document.querySelector("#typingInput");
  const type = (key) => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));

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
    dom.window.close();
  }
});

test("committed extra characters lower typing accuracy", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document } = dom.window;
  const input = document.querySelector("#typingInput");
  const type = (key) => input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );

  try {
    for (const key of "Typingx") type(key);
    type(" ");

    assert.equal(document.querySelector("#accuracyValue").textContent, "88");
  } finally {
    document.querySelector("#restartButton").click();
    dom.window.close();
  }
});

test("selected text duration controls WPM timing and progress semantics", async () => {
  const intervalCallbacks = [];
  const dom = await createPage("index.html", ["script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "short", chartScope: "text" } },
    beforeScripts(window) {
      window.typingTexts = [{
        id: "short",
        title: "Short piece",
        body: "Typing practice.",
        durationSeconds: 30,
      }];
      window.setInterval = (callback) => {
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      };
      window.clearInterval = () => {};
    },
  });
  const { document } = dom.window;
  const input = document.querySelector("#typingInput");

  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "T",
  }));
  for (let second = 0; second < 15; second += 1) intervalCallbacks[0]();

  assert.equal(document.querySelector(".timer-progress").getAttribute("aria-valuemax"), "30");
  assert.equal(document.querySelector("#speedValue").textContent, "1");
  document.querySelector("#restartButton").click();
  dom.window.close();
});

test("text selection is locked during a run and restored after reset or completion", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const select = document.querySelector("#textSelect");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  assert.equal(select.disabled, false);
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "T",
  }));
  assert.equal(select.disabled, true);

  document.querySelector("#restartButton").click();
  assert.equal(select.disabled, false);
  assert.equal(document.querySelector("#testView").hidden, false);
  assert.equal(document.querySelector("#resultsView").hidden, true);
  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(document.querySelector("#resultPanel").hidden, false);
  assert.equal(select.disabled, false);
});

test("typing history can be cleared across aggregate and detailed stores", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  const { document, Event, localStorage } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")]
    .map((character) => character.textContent)
    .join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  dom.window.confirm = () => true;
  document.querySelector("#clearHistoryButton").click();

  assert.equal(document.querySelector("#heatmapRuns").textContent, "0");
  const savedStats = JSON.parse(localStorage.getItem("typist-typing-stats-v2"));
  const savedRuns = JSON.parse(localStorage.getItem("typist-typing-runs-v2"));
  const savedAnalysis = JSON.parse(localStorage.getItem("typist-typing-analysis-v3"));
  assert.deepEqual(savedStats, { version: 2, texts: {} });
  assert.deepEqual(savedRuns, { version: 2, runs: [] });
  assert.deepEqual(savedAnalysis, { version: 3, texts: {} });
});

test("cancelling the clear-history confirmation preserves the completed run", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")].map((character) => character.textContent).join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  dom.window.confirm = () => false;
  document.querySelector("#clearHistoryButton").click();

  assert.equal(document.querySelector("#heatmapRuns").textContent, "1");
});

test("typing commits omitted prompt characters as errors", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
  });
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");

  input.value = "T ";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  assert.equal(document.querySelector("#resultPanel").hidden, true);
  assert.equal(Number(document.querySelector("#accuracyValue").textContent) < 100, true);
  document.querySelector("#restartButton").click();
});

test("typing timer completes and records an incomplete run when time expires", async () => {
  const intervalCallbacks = [];
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: { "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" } },
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
  const savedRuns = JSON.parse(localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(savedRuns.runs.length, 1);
  assert.equal(savedRuns.runs[0].textId, "calm-precision");
});

test("the first Tab after a run focuses Restart", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  const { document, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")].map((character) => character.textContent).join("");

  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));

  assert.equal(document.activeElement, document.querySelector("#restartButton"));
});

test("Space does not scroll the page outside an active control", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  const space = new dom.window.KeyboardEvent("keydown", {
    key: " ",
    bubbles: true,
    cancelable: true,
  });

  dom.window.document.dispatchEvent(space);

  assert.equal(space.defaultPrevented, true);
});

test("random practice resolves to a concrete text and removes legacy typing keys", async () => {
  const randomValues = [0, 0.99];
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: {
      "typist-typing-settings-v2": { selectedText: "random", chartScope: "text" },
      "typist-heatmap:old": { runs: 99 },
    },
    beforeScripts(window) {
      window.Math.random = () => randomValues.shift() ?? 0;
    },
  });
  const { document, localStorage, Event } = dom.window;
  const input = document.querySelector("#typingInput");
  const prompt = [...document.querySelectorAll("#textDisplay .char")].map((character) => character.textContent).join("");
  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));

  const runs = JSON.parse(localStorage.getItem("typist-typing-runs-v2"));
  assert.equal(runs.runs.length, 1);
  assert.notEqual(runs.runs[0].textId, "random");
  assert.equal(localStorage.getItem("typist-heatmap:old"), null);

  document.querySelector("#restartButton").click();
  assert.notEqual(document.querySelector("#currentTextLabel").textContent, "");
});

test("chart scope switches from the active text to every stored text", async () => {
  const runs = [
    { textId: "calm-precision", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 40, accuracy: 95, consistency: 88, typingScore: 126 },
    { textId: "one-word", completedAt: "2026-07-02T10:00:00.000Z", wordsPerMinute: 55, accuracy: 92, consistency: 80, typingScore: 135 },
  ];
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: {
      "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "text" },
      "typist-typing-runs-v2": { version: 2, runs },
    },
  });
  const { document } = dom.window;
  const progress = dom.window.__chartInstances.find((chart) => chart.canvas.id === "progressChart");
  const tradeoff = dom.window.__chartInstances.find((chart) => chart.canvas.id === "tradeoffChart");
  assert.equal(progress.data.datasets[0].data.length, 1);
  assert.equal(tradeoff.data.datasets[0].data.length, 1);

  const allScope = document.querySelector("#chartScopeAll");
  allScope.checked = true;
  allScope.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.equal(progress.data.datasets[0].data.length, 2);
  assert.equal(tradeoff.data.datasets[0].data.length, 2);
  assert.equal(progress.data.datasets[0].data[1].textTitle, "One word at a time");
  assert.equal(tradeoff.data.datasets[0].data[1].textTitle, "One word at a time");
});

test("all-text progress offers an explicitly approximate normalized-speed series", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"], {
    storage: {
      "typist-typing-settings-v2": { selectedText: "calm-precision", chartScope: "all" },
      "typist-typing-runs-v2": { version: 2, runs: [{ textId: "calm-precision", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 40, accuracy: 95, consistency: 88, typingScore: 126, approximateNormalizedWpm: 36 }] },
    },
  });
  try {
    const chart = dom.window.__chartInstances.find((instance) => instance.canvas.id === "progressChart");
    assert.equal(chart.data.datasets.some((dataset) => dataset.label === "Approx. normalized WPM"), true);
  } finally { dom.window.close(); }
});

test("result progress detail compares only runs from the active text", async () => {
  const dom = await createPage("index.html", ["script.js"], {
    storage: {
      "typist-typing-settings-v2": { selectedText: "short", chartScope: "text" },
      "typist-typing-runs-v2": { version: 2, runs: [
        { textId: "short", completedAt: "2026-07-01T10:00:00.000Z", wordsPerMinute: 20, accuracy: 90, consistency: 80, typingScore: 98 },
        { textId: "other", completedAt: "2026-07-02T10:00:00.000Z", wordsPerMinute: 90, accuracy: 99, consistency: 90, typingScore: 179 },
      ] },
    },
    beforeScripts(window) { window.typingTexts = [{ id: "short", title: "Short", body: "a", durationSeconds: 30 }, { id: "other", title: "Other", body: "b", durationSeconds: 30 }]; },
  });
  try {
    dom.window.handleCharacter("a", 0);
    assert.match(dom.window.document.querySelector("#progressDetailIntro").textContent, /same piece/);
    assert.doesNotMatch(dom.window.document.querySelector("#progressDetailIntro").textContent, /90 WPM/);
  } finally { dom.window.close(); }
});

test("analytics tabs reveal one heatmap and one trend chart at a time", async () => {
  const dom = await createPage("index.html", ["texts.js", "script.js"]);
  const { document } = dom.window;

  assert.equal(document.querySelector("#accuracyPanel").hidden, false);
  assert.equal(document.querySelector("#speedPanel").hidden, true);
  document.querySelector("#speedTab").click();
  assert.equal(document.querySelector("#accuracyPanel").hidden, true);
  assert.equal(document.querySelector("#speedPanel").hidden, false);
  assert.equal(document.querySelector("#speedTab").getAttribute("aria-selected"), "true");

  assert.equal(document.querySelector("#progressPanel").hidden, false);
  document.querySelector("#tradeoffTab").click();
  assert.equal(document.querySelector("#progressPanel").hidden, true);
  assert.equal(document.querySelector("#tradeoffPanel").hidden, false);
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
