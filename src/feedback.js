// Candidate observations for the result screen, ranked so exactly one can lead.
// A candidate only appears when its evidence clears a threshold, and each one
// carries the sample count and confidence that justify it.

export function getFeedbackBundles(summary) {
  const candidates = [];
  if (summary.pauseCount >= 2) candidates.push({
    kind: "pauses", scope: "run", sampleCount: summary.pauseCount, confidence: "run-only", impact: summary.pauseCount * 10, stability: 1, actionability: 1,
    title: "Pauses interrupted your rhythm",
    observation: `${summary.pauseCount} pauses exceeded ${Math.round(summary.pauseThresholdMs / 100) / 10}s, so your speed came in bursts rather than a steady flow.`,
    recommendation: "Practice one short phrase at a comfortable pace, leaving a deliberate but even beat between words.",
  });
  const slowTransition = summary.transitions?.find((transition) => transition.confidence === "supported" && transition.slowdownPercent >= 20);
  if (slowTransition) candidates.push({
    kind: "transition", scope: slowTransition.pair, sampleCount: slowTransition.samples, confidence: "supported", impact: slowTransition.samples * slowTransition.slowdownPercent / 10, stability: 1, actionability: 1,
    sourceTextCount: slowTransition.sourceTextCount,
    title: `“${slowTransition.pair}” is disrupting your rhythm`,
    observation: `Across ${slowTransition.samples} recent occurrences, “${slowTransition.pair}” is ${slowTransition.slowdownPercent}% slower than your typical recorded transition${slowTransition.sourceTextCount > 1 ? " across your saved texts" : ""}.`,
    recommendation: `Practice a small group of words containing “${slowTransition.pair}” slowly, then repeat at a comfortable pace.`,
  });
  const slowTrigram = summary.trigrams?.find((transition) => transition.confidence === "supported" && transition.slowdownPercent >= 20);
  if (slowTrigram && !slowTransition) candidates.push({
    kind: "trigram", scope: slowTrigram.pair, sampleCount: slowTrigram.samples, confidence: "supported", sourceTextCount: slowTrigram.sourceTextCount,
    impact: slowTrigram.samples * slowTrigram.slowdownPercent / 10, stability: slowTrigram.sourceTextCount > 1 ? 1 : 0.8, actionability: 1,
    title: `“${slowTrigram.pair}” is disrupting your rhythm`,
    observation: `Across ${slowTrigram.samples} recent occurrences, “${slowTrigram.pair}” is ${slowTrigram.slowdownPercent}% slower than your typical recorded three-letter sequence${slowTrigram.sourceTextCount > 1 ? " across your saved texts" : ""}.`,
    recommendation: `Practice a small group of words containing “${slowTrigram.pair}” slowly, then repeat at a comfortable pace.`,
  });
  const weakCharacter = summary.characters?.find((character) => character.confidence === "supported" && character.accuracy <= 90 && character.attempts - character.correct >= 2);
  if (weakCharacter) candidates.push({
    kind: "character", scope: weakCharacter.character, sampleCount: weakCharacter.attempts, confidence: "supported", sourceTextCount: weakCharacter.sourceTextCount,
    impact: (weakCharacter.attempts - weakCharacter.correct) * 8, stability: weakCharacter.sourceTextCount > 1 ? 1 : 0.8, actionability: 1,
    title: `“${weakCharacter.character}” needs more reliable control`,
    observation: `“${weakCharacter.character}” was correct ${weakCharacter.accuracy}% of the time across ${weakCharacter.attempts} recorded attempts${weakCharacter.commonSubstitution ? `, most often becoming “${weakCharacter.commonSubstitution}”` : ""}.`,
    recommendation: `Practice a short set of words with “${weakCharacter.character}”, prioritizing clean presses over speed.`,
  });
  const repeatedWordError = summary.wordPatterns?.find((word) => word.confidence === "supported" && word.finalErrors >= 2);
  if (repeatedWordError) candidates.push({
    kind: "word", scope: repeatedWordError.word, sampleCount: repeatedWordError.samples, confidence: "supported", sourceTextCount: repeatedWordError.sourceTextCount,
    impact: repeatedWordError.finalErrors * 7, stability: repeatedWordError.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.9,
    title: `“${repeatedWordError.word}” is not yet reliable`,
    observation: `“${repeatedWordError.word}” accumulated ${repeatedWordError.finalErrors} committed error${repeatedWordError.finalErrors === 1 ? "" : "s"} across ${repeatedWordError.samples} recorded attempts.`,
    recommendation: `Repeat “${repeatedWordError.word}” slowly in a few short phrases, then return to normal text.`,
  });
  const fragmentPattern = [...(summary.prefixPatterns || []), ...(summary.suffixPatterns || [])]
    .filter((pattern) => pattern.confidence === "supported" && pattern.finalErrors >= 3)
    .sort((left, right) => right.finalErrors - left.finalErrors || right.samples - left.samples)[0];
  if (fragmentPattern) candidates.push({
    kind: fragmentPattern.kind, scope: fragmentPattern.fragment, sampleCount: fragmentPattern.samples, confidence: "supported", sourceTextCount: fragmentPattern.sourceTextCount,
    impact: fragmentPattern.finalErrors * 5, stability: fragmentPattern.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.8,
    title: `Words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}” need more reliable control`,
    observation: `${fragmentPattern.finalErrors} committed errors appeared across ${fragmentPattern.samples} recorded words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}”. This is a word-pattern signal, not proof that one key is the cause.`,
    recommendation: `Practice a small group of words ${fragmentPattern.kind === "prefix" ? "starting" : "ending"} “${fragmentPattern.fragment}” at a controlled pace.`,
  });
  if (summary.shift?.supported && summary.shift.slowdownPercent >= 30) candidates.push({
    kind: "shift", scope: "capital letters", sampleCount: summary.shift.shiftSamples, confidence: "supported", sourceTextCount: summary.shift.sourceTextCount,
    impact: summary.shift.shiftSamples * summary.shift.slowdownPercent / 12, stability: summary.shift.sourceTextCount > 1 ? 1 : 0.8, actionability: 0.85,
    title: "Capital letters may be interrupting your rhythm",
    observation: `Capital-letter presses took ${summary.shift.slowdownPercent}% longer than lowercase presses across ${summary.shift.shiftSamples} recorded capital letters. This may be a timing pattern rather than a technique problem.`,
    recommendation: "Practice a small mixed-case phrase at an even pace, pausing only between repetitions.",
  });
  if (summary.correctedErrors >= 2) candidates.push({
    kind: "corrections", scope: "run", sampleCount: summary.correctedErrors, confidence: "run-only", impact: summary.correctedErrors * 6, stability: 1, actionability: 1,
    title: "Recovery was doing extra work",
    observation: `${summary.correctedErrors} incorrect key${summary.correctedErrors === 1 ? " was" : "s were"} removed before committing the word. Your final text recovered, but the process was less smooth.`,
    recommendation: "Slow down slightly for the next run and aim to keep process accuracy above 95%.",
  });
  if (summary.remainingErrors >= 2) candidates.push({
    kind: "remaining-errors", scope: "run", sampleCount: summary.remainingErrors, confidence: "run-only", impact: summary.remainingErrors * 5, stability: 1, actionability: 1,
    title: "A few errors remained in the text",
    observation: `${summary.remainingErrors} character${summary.remainingErrors === 1 ? " was" : "s were"} still misaligned when words were committed.`,
    recommendation: "Use the visible word feedback to correct the current word before pressing Space.",
  });
  return candidates.map((candidate) => ({
    ...candidate,
    interpretation: candidate.title,
    evidence: { sampleCount: candidate.sampleCount, scope: candidate.scope, confidence: candidate.confidence, sourceTextCount: candidate.sourceTextCount || 1 },
    practice: candidate.recommendation,
    priority: candidate.impact * candidate.stability * candidate.actionability,
  }))
    .sort((left, right) => right.priority - left.priority);
}

// Prefer to keep coaching on the same theme across runs, so practice advice does
// not swing between topics while a supported pattern is still close to the top.
export function choosePrimaryFeedback(bundles, previousFeedback) {
  const top = bundles[0];
  if (!top || previousFeedback?.confidence !== "supported") return top;
  const continuing = bundles.find((bundle) => bundle.kind === previousFeedback.kind && bundle.scope === previousFeedback.scope && bundle.confidence === "supported");
  return continuing && continuing.priority >= top.priority * 0.85 ? continuing : top;
}

export function getCoaching(summary) {
  const primary = getFeedbackBundles(summary)[0];
  if (primary) return primary;
  return {
    title: "Collect another calm baseline",
    observation: `${summary.finalAccuracy}% final accuracy with ${summary.correctedErrors} corrected error${summary.correctedErrors === 1 ? "" : "s"} recorded, but no repeated pattern is ready to direct practice yet.`,
    recommendation: "Repeat this piece once at the same relaxed pace so the next recommendation has stronger evidence.",
  };
}

export function formatBundleEvidence(bundle) {
  if (!bundle?.kind) return "";
  const confidence = bundle.confidence === "supported" ? "supported pattern" : "this run";
  const scope = bundle.scope === "run"
    ? "across the run"
    : bundle.sourceTextCount > 1
      ? `for “${bundle.scope}” across ${bundle.sourceTextCount} texts`
      : `for “${bundle.scope}”`;
  return `Evidence: ${bundle.sampleCount} example${bundle.sampleCount === 1 ? "" : "s"} ${scope} · ${confidence}`;
}
