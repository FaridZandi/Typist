// Versioned local persistence. Every load revalidates its record shape so a
// malformed or outdated entry degrades to an empty store instead of breaking
// the session, and every write is allowed to fail silently.

import { typingAnalysisKey, typingRunsKey, typingSettingsKey, typingStatsKey, typingTransitionsKey } from "./config.js";

function safeRead(storageArea, key, fallback) {
  try {
    const value = JSON.parse(storageArea.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function createStorage(textById, storageArea = globalThis.localStorage) {
  const isValidRun = (run) => Boolean(
    run &&
      textById.has(run.textId) &&
      typeof run.completedAt === "string" &&
      Number.isFinite(run.wordsPerMinute) &&
      Number.isFinite(run.accuracy) &&
      Number.isFinite(run.consistency) &&
      Number.isFinite(run.typingScore),
  );

  const loadSettings = () => {
    const saved = safeRead(storageArea, typingSettingsKey, {});
    return {
      selectedText: saved.selectedText === "random" || textById.has(saved.selectedText) ? saved.selectedText : "random",
      chartScope: saved.chartScope === "all" ? "all" : "text",
    };
  };

  const loadStatsStore = () => {
    const saved = safeRead(storageArea, typingStatsKey, {});
    return saved?.version === 2 && saved.texts && typeof saved.texts === "object"
      ? { version: 2, texts: saved.texts }
      : { version: 2, texts: {} };
  };

  const loadRunsStore = () => {
    const saved = safeRead(storageArea, typingRunsKey, {});
    return saved?.version === 2 && Array.isArray(saved.runs)
      ? { version: 2, runs: saved.runs.filter(isValidRun) }
      : { version: 2, runs: [] };
  };

  const loadAnalysisStore = () => {
    const saved = safeRead(storageArea, typingAnalysisKey, {});
    return saved?.version === 3 && saved.texts && typeof saved.texts === "object"
      ? { version: 3, texts: saved.texts }
      : { version: 3, texts: {} };
  };

  // Kept apart from the detailed records precisely so it can be kept whole: it
  // is the only store with no cap, and the only one small enough to deserve one.
  const loadTransitionsStore = () => {
    const saved = safeRead(storageArea, typingTransitionsKey, {});
    return saved?.version === 1 && Array.isArray(saved.runs)
      ? { version: 1, runs: saved.runs.filter((run) => run && typeof run.completedAt === "string" && run.pairs) }
      : { version: 1, runs: [] };
  };

  const state = {
    settings: loadSettings(),
    statsStore: loadStatsStore(),
    runsStore: loadRunsStore(),
    analysisStore: loadAnalysisStore(),
    transitionsStore: loadTransitionsStore(),
  };

  const createTextStats = (text) => ({
    textId: text.id,
    runs: 0,
    characters: [...text.body].map(() => ({
      attempts: 0,
      mistakes: 0,
      intervalSamples: 0,
      totalIntervalMs: 0,
    })),
  });

  return {
    get settings() { return state.settings; },
    get statsStore() { return state.statsStore; },
    get runsStore() { return state.runsStore; },
    get analysisStore() { return state.analysisStore; },
    get transitionsStore() { return state.transitionsStore; },

    saveSettings() {
      try {
        storageArea.setItem(typingSettingsKey, JSON.stringify(state.settings));
      } catch {
        // The session remains usable when local storage is unavailable.
      }
    },

    saveStores() {
      try {
        storageArea.setItem(typingStatsKey, JSON.stringify(state.statsStore));
        storageArea.setItem(typingRunsKey, JSON.stringify(state.runsStore));
        storageArea.setItem(typingAnalysisKey, JSON.stringify(state.analysisStore));
        storageArea.setItem(typingTransitionsKey, JSON.stringify(state.transitionsStore));
      } catch {
        // The current run still renders when persistence fails.
      }
    },

    // A stats record is rebuilt whenever it no longer lines up with the text it
    // describes, so an edited prompt cannot corrupt its own heatmap.
    getTextStats(text) {
      const saved = state.statsStore.texts[text.id];
      if (!saved || !Array.isArray(saved.characters) || saved.characters.length !== text.body.length) {
        state.statsStore.texts[text.id] = createTextStats(text);
      }
      const stats = state.statsStore.texts[text.id];
      stats.runs = Number.isInteger(stats.runs) ? stats.runs : 0;
      stats.characters = stats.characters.map((character) => ({
        attempts: Number.isFinite(character.attempts) ? character.attempts : 0,
        mistakes: Number.isFinite(character.mistakes) ? character.mistakes : 0,
        intervalSamples: Number.isFinite(character.intervalSamples) ? character.intervalSamples : 0,
        totalIntervalMs: Number.isFinite(character.totalIntervalMs) ? character.totalIntervalMs : 0,
      }));
      return stats;
    },

    getStoredAnalysisRecords() {
      return Object.entries(state.analysisStore.texts).flatMap(([textId, text]) => (text.runs || []).map((run) => ({ ...run, textId })));
    },

    clearAll() {
      state.statsStore = { version: 2, texts: {} };
      state.runsStore = { version: 2, runs: [] };
      state.analysisStore = { version: 3, texts: {} };
      state.transitionsStore = { version: 1, runs: [] };
      this.saveStores();
    },

    removeLegacyStorage() {
      try {
        [...Array.from({ length: storageArea.length }, (_, index) => storageArea.key(index))]
          .filter((key) => key?.startsWith("typist-heatmap:"))
          .forEach((key) => storageArea.removeItem(key));
      } catch {
        // Ignore storage restrictions.
      }
    },
  };
}
