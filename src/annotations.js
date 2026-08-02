// Derived annotations that can be placed on the rendered passage. Each one is
// scoped to a word so the result screen can move a reader from "this was a
// problem" to the exact place it happened.

import { getMedian } from "./metrics.js";

const categoryLabels = {
  substitution: "substitution",
  omission: "omission",
  insertion: "insertion",
  transposition: "transposition",
  duplication: "duplication",
  capitalization: "capitalization error",
  punctuation: "punctuation error",
};

export function getWordErrorAnnotations(analysis) {
  return Object.entries(analysis.categories || {}).filter(([, count]) => count > 0).map(([kind, count]) => ({
    kind,
    count,
    label: `${count} ${categoryLabels[kind]}${count === 1 ? "" : "s"} in “${analysis.expected}”`,
    message: `The word was committed with ${count} ${categoryLabels[kind]}${count === 1 ? "" : "s"}.`,
    severity: count > 1 ? "high" : "medium",
  }));
}

export function deriveRunAnnotations({ summary, words, runEvents, completedWordAnalyses }) {
  const annotations = [];
  let id = 0;
  const add = (kind, wordIndex, label, message, severity = "medium", evidence = null, confidence = "run-only") => {
    if (!Number.isInteger(wordIndex)) return;
    annotations.push({ id: `${kind}-${id += 1}`, kind, wordIndex, scope: { type: "word", wordIndex }, label, message, severity, evidence, confidence });
  };

  completedWordAnalyses.forEach((analysis) => {
    const errors = [...analysis.expected].length - analysis.finalCorrect + analysis.categories.insertion;
    const categoryAnnotations = getWordErrorAnnotations(analysis);
    if (categoryAnnotations.length) categoryAnnotations.forEach((annotation) => add(annotation.kind, analysis.wordIndex, annotation.label, annotation.message, annotation.severity, { count: annotation.count }));
    else if (errors) add("error", analysis.wordIndex, `${errors} error${errors === 1 ? "" : "s"} in “${analysis.expected}”`, `Committed with ${errors} remaining error${errors === 1 ? "" : "s"}.`, errors > 1 ? "high" : "medium", { count: errors });
  });

  runEvents.forEach((event, index) => {
    const previous = runEvents[index - 1];
    if (previous && event.timestampMs > previous.timestampMs && event.timestampMs - previous.timestampMs >= summary.pauseThresholdMs) {
      const durationMs = event.timestampMs - previous.timestampMs;
      add("pause", event.wordIndex, `Pause before “${words[event.wordIndex]?.text || "this word"}”`, `${Math.round(durationMs / 100) / 10}s pause before this word.`, "medium", { durationMs });
    }
    if (event.type === "backspace" && previous?.type === "character" && previous.key !== previous.expectedCharacter) {
      add("correction", event.wordIndex, `Correction in “${words[event.wordIndex]?.text || "this word"}”`, "An incorrect key was removed before the word was committed.", "low", { count: 1 });
    }
  });

  // Slow transitions and slow words are judged against this run's own median, so
  // the threshold adapts to the pace the typist actually held today.
  const transitions = [];
  runEvents.forEach((event, index) => {
    const previous = runEvents[index - 1];
    const isAlignedCharacter = event.type === "character" && event.key === event.expectedCharacter;
    const followsAlignedCharacter = previous?.type === "character" && previous.key === previous.expectedCharacter;
    if (!isAlignedCharacter || !followsAlignedCharacter || event.wordIndex !== previous.wordIndex || event.bufferOffset !== previous.bufferOffset + 1) return;
    const interval = event.timestampMs - previous.timestampMs;
    if (interval > 0) transitions.push({ event, previous, interval });
  });
  const transitionMedian = getMedian(transitions.map((transition) => transition.interval));
  const slowTransitionThreshold = Math.max(300, transitionMedian * 1.75);
  transitions.filter((transition) => transition.interval >= slowTransitionThreshold).forEach((transition) => {
    const pair = `${transition.previous.key}${transition.event.key}`;
    add("slow-transition", transition.event.wordIndex, `Slow “${pair}” in “${words[transition.event.wordIndex]?.text || "this word"}”`, `${Math.round(transition.interval)}ms between “${pair[0]}” and “${pair[1]}”, slower than this run’s usual transitions.`, "medium", { pair, intervalMs: Math.round(transition.interval) });
  });

  const wordTimings = completedWordAnalyses.map((analysis) => {
    const timestamps = runEvents.filter((event) => event.wordIndex === analysis.wordIndex).map((event) => event.timestampMs);
    const duration = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
    return { analysis, durationPerCharacter: duration / Math.max(1, [...analysis.expected].length) };
  }).filter((timing) => timing.durationPerCharacter > 0);
  const wordMedian = getMedian(wordTimings.map((timing) => timing.durationPerCharacter));
  wordTimings.filter((timing) => wordTimings.length >= 3 && timing.durationPerCharacter >= Math.max(250, wordMedian * 1.75)).forEach((timing) => {
    add("slow-word", timing.analysis.wordIndex, `Slow word “${timing.analysis.expected}”`, `${Math.round(timing.durationPerCharacter)}ms per character, slower than this run’s usual words.`, "medium", { durationPerCharacter: Math.round(timing.durationPerCharacter) });
  });

  if (summary.earlyIntervalMs && summary.lateIntervalMs && Math.abs(summary.fatiguePercent) >= 20) {
    const lateEvent = [...runEvents].reverse().find((event) => Number.isInteger(event.wordIndex));
    const slower = summary.fatiguePercent > 0;
    add("pace-change", lateEvent?.wordIndex, slower ? "Pace slowed near the end" : "Pace picked up near the end", `The final third was ${Math.abs(summary.fatiguePercent)}% ${slower ? "slower" : "faster"} than the opening third.`, "medium", { percent: Math.abs(summary.fatiguePercent) });
  }

  return annotations;
}
