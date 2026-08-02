// Tunable constants for the reaction test.

export const reactionRunLengthSeconds = 60;

export const reactionHistoryStorageKey = "typist-reaction-history";
export const reactionKeyStatsStorageKey = "typist-reaction-key-stats";
export const reactionSettingsStorageKey = "typist-reaction-settings";

// Every key keeps a baseline chance to appear; worse recent accuracy or slower
// recent reactions add weight on top of it.
export const baselineTargetWeight = 1;
export const accuracyPenaltyWeight = 3;
export const reactionTimePenaltyWeight = 2;
export const targetWeightConfidenceSamples = 8;

// Exponential moving average factor, so recent runs matter more than old ones.
export const keyMetricAlpha = 0.2;

export const warmupStartKey = "h";
