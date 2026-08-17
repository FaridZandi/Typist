// Tunable constants for the typing test. Keeping them in one module makes the
// thresholds that decide confidence and feedback easy to find and adjust.

export const runLengthSeconds = 60;
export const minimumCoverageRatio = 0.5;
export const speedSmoothingPreviousLetters = 5;

export const typingStatsKey = "typist-typing-stats-v2";
export const typingRunsKey = "typist-typing-runs-v2";
export const typingSettingsKey = "typist-typing-settings-v2";
export const typingAnalysisKey = "typist-typing-analysis-v3";
export const typingTransitionsKey = "typist-typing-transitions-v1";

// Detailed event records are large, so only the recent ones are kept — they are
// what the confidence machinery re-derives from. The transition history beside
// them is a few hundred bytes a run and is never trimmed, because a picture of
// progress is worth nothing if it forgets where the movement started.
export const maxDetailedRunsPerText = 12;
export const minimumTransitionSamples = 12;
export const minimumWordSamples = 4;
export const minimumTechniqueSamples = 8;

export const pauseFloorMs = 700;
export const pauseMedianMultiplier = 2.5;

export const progressWindowSize = 3;
export const retainedImprovementSpacingMs = 7 * 24 * 60 * 60 * 1000;
export const feedbackDerivationVersion = 1;
