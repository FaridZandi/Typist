// Local persistence for the reaction test. Malformed records are discarded on
// load rather than allowed to reach the rest of the app.

import { reactionHistoryStorageKey, reactionKeyStatsStorageKey, reactionSettingsStorageKey } from "./config.js";
import { createEmptyKeyStats } from "./key-stats.js";

export function createReactionStorage(targetLetters, storageArea = globalThis.localStorage) {
  return {
    loadHistory() {
      try {
        const saved = JSON.parse(storageArea.getItem(reactionHistoryStorageKey));
        if (!Array.isArray(saved)) return [];
        return saved.filter((run) =>
          typeof run.completedAt === "string" &&
          Number.isFinite(run.hits) &&
          Number.isFinite(run.errors) &&
          Number.isFinite(run.averageReaction) &&
          Number.isFinite(run.accuracy) &&
          Number.isFinite(run.bestReaction) &&
          Number.isFinite(run.medianReaction) &&
          Number.isFinite(run.p90Reaction));
      } catch {
        return [];
      }
    },

    saveHistory(history) {
      try {
        storageArea.setItem(reactionHistoryStorageKey, JSON.stringify(history));
      } catch {
        // The current run still works if browser storage is unavailable.
      }
    },

    loadKeyStats() {
      const empty = createEmptyKeyStats(targetLetters);
      try {
        const saved = JSON.parse(storageArea.getItem(reactionKeyStatsStorageKey));
        if (!saved || typeof saved !== "object") return empty;

        targetLetters.forEach((letter) => {
          const record = saved[letter];
          if (!record || typeof record !== "object") return;
          empty[letter] = {
            correct: Number.isFinite(record.correct) ? record.correct : 0,
            wrong: Number.isFinite(record.wrong) ? record.wrong : 0,
            errors: record.errors && typeof record.errors === "object" ? record.errors : {},
            reactionSamples: Number.isFinite(record.reactionSamples) ? record.reactionSamples : 0,
            totalReaction: Number.isFinite(record.totalReaction) ? record.totalReaction : 0,
            emaAccuracy: Number.isFinite(record.emaAccuracy) || record.emaAccuracy === null ? record.emaAccuracy : null,
            emaReaction: Number.isFinite(record.emaReaction) || record.emaReaction === null ? record.emaReaction : null,
          };
        });
        return empty;
      } catch {
        return createEmptyKeyStats(targetLetters);
      }
    },

    saveKeyStats(keyStats) {
      try {
        storageArea.setItem(reactionKeyStatsStorageKey, JSON.stringify(keyStats));
      } catch {
        // The live test still works if browser storage is unavailable.
      }
    },

    loadSettings() {
      try {
        const saved = JSON.parse(storageArea.getItem(reactionSettingsStorageKey));
        return saved && typeof saved === "object" ? saved : null;
      } catch {
        return null;
      }
    },

    saveSettings(settings) {
      try {
        storageArea.setItem(reactionSettingsStorageKey, JSON.stringify(settings));
      } catch {
        // The test still works if browser storage is unavailable.
      }
    },
  };
}
