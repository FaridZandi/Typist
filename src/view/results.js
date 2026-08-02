// Result-screen rendering. Each panel states what it measured, how many samples
// it has, and whether that is enough to be treated as a supported pattern.

import { minimumTechniqueSamples, minimumTransitionSamples, minimumWordSamples, progressWindowSize } from "../config.js";
import { getCharacterAggregate, getShiftMetrics, getTransitionAggregate, getWordAggregate } from "../aggregates.js";
import { getFluencyProgressState, getPatternProgressState, getProgressState } from "../progress.js";
import { formatBundleEvidence } from "../feedback.js";

const errorCategoryLabels = {
  substitution: "Substitutions", omission: "Omissions", insertion: "Insertions", transposition: "Transpositions",
  duplication: "Duplications", capitalization: "Capitalization", punctuation: "Punctuation",
};

function appendDetailItem(list, document, labelText, valueText) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  const value = document.createElement("strong");
  label.textContent = labelText;
  value.textContent = valueText;
  item.append(label, value);
  list.append(item);
}

// Notes are the index to the passage: hovering one previews the word it refers
// to, selecting one pins it. Both point at the same passage rendered once.
export function renderRunNotes({ elements, document, annotations, activeAnnotationId, onSelect, onPreview }) {
  elements.runNoteList.replaceChildren();
  const active = annotations.find((annotation) => annotation.id === activeAnnotationId);
  elements.runNoteDescription.hidden = !active;
  elements.runNoteDescription.textContent = active ? active.message : "";

  annotations.slice(0, 5).forEach((annotation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-note";
    button.textContent = annotation.label;
    button.title = annotation.message;
    button.setAttribute("aria-label", `${annotation.label}: ${annotation.message}`);
    button.setAttribute("aria-controls", "runNoteDescription");
    button.setAttribute("aria-pressed", String(annotation.id === activeAnnotationId));
    button.addEventListener("click", () => onSelect(annotation.id));
    const preview = () => onPreview?.(annotation.wordIndex);
    const clear = () => onPreview?.(null);
    button.addEventListener("mouseenter", preview);
    button.addEventListener("focus", preview);
    button.addEventListener("mouseleave", clear);
    button.addEventListener("blur", clear);
    elements.runNoteList.append(button);
  });
}

export function renderSecondaryFeedback({ elements, document, bundles, primaryBundle = bundles[0] }) {
  const secondary = bundles.filter((bundle) => bundle !== primaryBundle).slice(0, 3);
  elements.secondaryFeedback.hidden = secondary.length === 0;
  elements.secondaryFeedback.open = false;
  elements.secondaryFeedbackCount.textContent = secondary.length ? `· ${secondary.length}` : "";
  elements.secondaryFeedbackList.replaceChildren();

  secondary.forEach((bundle) => {
    const item = document.createElement("article");
    item.className = "secondary-feedback-item";
    const title = document.createElement("h4");
    title.textContent = bundle.title;
    const observation = document.createElement("p");
    observation.textContent = bundle.observation;
    const evidence = document.createElement("p");
    evidence.textContent = formatBundleEvidence(bundle);
    const recommendation = document.createElement("p");
    recommendation.className = "recommendation";
    recommendation.textContent = `Practice: ${bundle.recommendation}`;
    item.append(title, observation, evidence, recommendation);
    elements.secondaryFeedbackList.append(item);
  });
}

export function renderRhythmDetails({ elements, summary, timeline }) {
  elements.rhythmDetailSummary.textContent = summary.pauseCount
    ? `${summary.pauseCount} pause${summary.pauseCount === 1 ? "" : "s"} over ${Math.round(summary.pauseThresholdMs / 100) / 10}s`
    : "No meaningful pauses detected";
  elements.rhythmDetailIntro.textContent = timeline.length
    ? `Each point is the instantaneous inter-key speed. ${summary.recoverySamples ? `After ${summary.recoverySamples} error${summary.recoverySamples === 1 ? "" : "s"}, the next key took ${summary.recoveryMs} ms on average.` : "No error-recovery interval was recorded."}${summary.earlyIntervalMs && summary.lateIntervalMs ? ` The final third was ${Math.abs(summary.fatiguePercent)}% ${summary.fatiguePercent > 0 ? "slower" : "faster"} than the first.` : ""}`
    : "There were not enough separately timed key presses to draw a rhythm trace.";
}

export function renderErrorDetails({ elements, document, summary }) {
  const displayed = Object.entries(summary.categories).filter(([, count]) => count > 0);
  const categoryCount = displayed.reduce((sum, [, count]) => sum + count, 0);
  const total = summary.remainingErrors;
  elements.errorDetailSummary.textContent = total ? `${total} final-text error${total === 1 ? "" : "s"}` : "No final-text errors";
  elements.errorDetailIntro.textContent = categoryCount
    ? "Categories describe what remained when each word was committed; corrected mistakes are kept separately in the session summary."
    : "Committed text aligned cleanly. Any corrected mistakes remain visible in the headline correction count.";
  elements.errorCategoryList.replaceChildren();
  (displayed.length ? displayed : [["clean", 0]]).forEach(([category, count]) => {
    appendDetailItem(
      elements.errorCategoryList,
      document,
      category === "clean" ? "Final text" : errorCategoryLabels[category],
      category === "clean" ? "Clean" : count,
    );
  });
}

export function renderTransitionDetails({ elements, document, records }) {
  const transitions = getTransitionAggregate(records);
  const characters = getCharacterAggregate(records);
  const shift = getShiftMetrics(records);
  const supported = transitions.filter((transition) => transition.confidence === "supported");

  elements.transitionDetailSummary.textContent = transitions.length
    ? `${transitions.length} key-to-key movement${transitions.length === 1 ? "" : "s"} · ${supported.length ? `${supported.length} recurring pattern${supported.length === 1 ? "" : "s"}` : "still collecting examples"}`
    : "No timed key-to-key movements yet";
  elements.transitionDetailIntro.textContent = transitions.length
    ? supported.length
      ? `Supported patterns have at least ${minimumTransitionSamples} samples across recent runs for this text. Slowdown is relative to your other recorded transitions.`
      : `These observations need ${minimumTransitionSamples} samples per transition before they become supported practice advice.`
    : "Type at least two correctly aligned letters with distinct timing to start building transition evidence.";

  elements.transitionList.replaceChildren();
  const rows = transitions.slice(0, 3).map((transition) => ({ kind: "transition", ...transition }))
    .concat(characters.slice(0, 2).map((character) => ({ kind: "character", ...character })));

  (rows.length ? rows : [{ pair: "—", samples: 0 }]).forEach((row) => {
    if (row.kind === "character") {
      const confidence = row.confidence === "supported" ? "Supported" : `Learning · ${row.attempts}/${minimumTransitionSamples}`;
      const substitution = row.commonSubstitution ? ` · often “${row.commonSubstitution}”` : "";
      appendDetailItem(elements.transitionList, document, `Key “${row.character}” · ${row.attempts} attempts`, `${row.accuracy}% process accuracy${row.speed ? ` · ${row.speed} WPM` : ""}${substitution} · ${confidence}`);
      return;
    }
    const confidence = row.confidence === "supported" ? "Supported" : `Learning · ${row.samples}/${minimumTransitionSamples}`;
    appendDetailItem(
      elements.transitionList,
      document,
      row.samples ? `“${row.pair}” · ${row.samples} sample${row.samples === 1 ? "" : "s"}` : "No timed transition",
      row.samples ? `${row.speed} WPM · ${confidence}` : "Learning",
    );
  });

  if (shift.shiftSamples || shift.lowerSamples) {
    appendDetailItem(
      elements.transitionList,
      document,
      `Shift combinations · ${shift.shiftSamples} sample${shift.shiftSamples === 1 ? "" : "s"}`,
      shift.supported ? `${shift.slowdownPercent}% ${shift.slowdownPercent > 0 ? "slower" : "faster"} than lowercase · Supported` : `Learning · ${shift.shiftSamples}/${minimumTechniqueSamples} Shift samples`,
    );
  }
}

export function renderWordDetails({ elements, document, records }) {
  const summaries = getWordAggregate(records);
  const affected = summaries.filter((word) => word.finalErrors || word.durationPerCharacter > 0);

  elements.wordDetailSummary.textContent = affected.length
    ? `${affected.length} word observation${affected.length === 1 ? "" : "s"} · ${affected.some((word) => word.confidence === "supported") ? "some patterns repeat" : "still collecting examples"}`
    : "No completed words to compare";
  elements.wordDetailIntro.textContent = affected.length
    ? `Word timing is normalized by length. Repeated words need ${minimumWordSamples} observations before they are treated as supported patterns.`
    : "Commit a word to see its final alignment and timing here.";

  elements.wordList.replaceChildren();
  const rows = affected.slice(0, 4);
  (rows.length ? rows : [{ word: "—", finalErrors: 0, durationPerCharacter: 0 }]).forEach((word) => {
    const detail = word.word === "—"
      ? "Learning"
      : [
        word.finalErrors ? `${word.finalErrors} error${word.finalErrors === 1 ? "" : "s"}` : "Clean",
        word.durationPerCharacter ? `${word.durationPerCharacter} ms/char` : null,
        word.confidence === "supported" ? "Supported" : `Learning · ${word.samples}/${minimumWordSamples}`,
      ].filter(Boolean).join(" · ");
    appendDetailItem(elements.wordList, document, word.word === "—" ? "No completed word" : `“${word.word}”`, detail);
  });
}

const progressStateLabels = {
  learning: "no clear change yet",
  "recent-improvement": "recent improvement",
  "retained-improvement": "improvement holding",
  "needs-refresh": "worth refreshing",
};

// Progress compares runs of the same text, so passage difficulty never leaks
// into a speed claim. Pattern and pacing trends are appended as extra context.
export function renderProgressDetail({ elements, records, currentSummary, patternRecords, fluencyRecords }) {
  const progress = getProgressState(records);
  elements.progressDetailSummary.textContent = `${progress.sampleCount} run${progress.sampleCount === 1 ? "" : "s"} · ${progressStateLabels[progress.state]}`;

  if (progress.state === "recent-improvement") {
    elements.progressDetailIntro.textContent = `Recent raw speed is ${progress.recentSpeed} WPM versus an earlier ${progress.baselineSpeed} WPM window for this text. This is a supported recent improvement; check again after a week before treating it as retained.`;
  } else if (progress.state === "retained-improvement") {
    elements.progressDetailIntro.textContent = `Recent raw speed is ${progress.recentSpeed} WPM versus an earlier ${progress.baselineSpeed} WPM window for this text, and the gain reappeared after at least a week. This improvement looks retained.`;
  } else if (progress.state === "needs-refresh") {
    elements.progressDetailIntro.textContent = `A formerly stronger ${progress.baselineSpeed} WPM window is now followed by ${progress.recentSpeed} WPM after a spaced check. Treat this as a cue to refresh the skill, not a verdict on one bad run.`;
  } else {
    elements.progressDetailIntro.textContent = progress.sampleCount < progressWindowSize * 2
      ? "Complete more runs of this same piece before the app makes a progress claim. Raw per-text history remains available without mixing passage difficulty."
      : `The recent ${progress.recentSpeed} WPM window does not yet show a reliable improvement over the earlier ${progress.baselineSpeed} WPM window.`;
  }

  const primaryTransition = currentSummary?.transitions?.find((transition) => transition.confidence === "supported");
  if (primaryTransition) {
    const patternProgress = getPatternProgressState(patternRecords, primaryTransition.pair);
    if (patternProgress.state === "recent-improvement" || patternProgress.state === "retained-improvement") {
      elements.progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, ${patternProgress.state === "retained-improvement" ? "the faster pattern also held after a spaced follow-up" : "the faster pattern is recent and still needs a spaced follow-up"}.`;
    } else if (patternProgress.state === "needs-refresh") {
      elements.progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, a later spaced check suggests the pattern needs a refresh.`;
    } else if (patternProgress.sampleCount < progressWindowSize * 2) {
      elements.progressDetailIntro.textContent += ` For “${primaryTransition.pair}”, there are not yet enough event-recorded runs to make a progress claim.`;
    }
  }

  const fluencyProgress = getFluencyProgressState(fluencyRecords);
  if (fluencyProgress.state === "recent-improvement" || fluencyProgress.state === "retained-improvement") {
    elements.progressDetailIntro.textContent += ` Your first-to-last-third pacing is ${fluencyProgress.state === "retained-improvement" ? "steadier across a spaced follow-up" : "recently steadier; check again after a week"}.`;
  } else if (fluencyProgress.state === "needs-refresh") {
    elements.progressDetailIntro.textContent += " Your first-to-last-third pacing has become less even in a spaced follow-up, so a short controlled repeat may help.";
  }
}
