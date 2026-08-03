// Turning a finding into something you can actually type.
//
// Drill words come from the practice catalog rather than a bundled dictionary,
// so a drill is made of words the typist will meet again in real passages.
//
// The important rule comes from the measurement side: a pattern seen only at
// the start of words cannot be told apart from the cost of recognising the
// word. A drill built entirely of words *starting* with the pattern therefore
// can never confirm the pattern it is practising, so the generator deliberately
// mixes in words carrying it in the middle or at the end.

const DRILL_SECONDS = 30;
const TARGET_WORD_COUNT = 24;
const MINIMUM_CANDIDATES = 4;
const MINIMUM_INTERIOR = 2;

export function getCatalogVocabulary(catalog) {
  const words = new Set();
  catalog.forEach((text) => {
    [...text.body.toLowerCase().matchAll(/[a-z']+/g)].forEach((match) => {
      const word = match[0].replace(/^'+|'+$/g, "");
      if (word.length >= 3) words.add(word);
    });
  });
  return [...words].sort();
}

// Interior occurrences first: they are the ones that make the evidence
// separable from word recognition.
function orderCandidates(candidates, pattern) {
  return [...candidates].sort((left, right) => {
    const leftInterior = left.indexOf(pattern) > 0 ? 0 : 1;
    const rightInterior = right.indexOf(pattern) > 0 ? 0 : 1;
    if (leftInterior !== rightInterior) return leftInterior - rightInterior;
    if (left.length !== right.length) return left.length - right.length;
    return left.localeCompare(right);
  });
}

// Deterministic interleave, so the same finding always produces the same drill
// and a repeat is comparable with the one before it.
function fill(words, count) {
  if (!words.length) return [];
  return Array.from({ length: count }, (_, index) => words[index % words.length]);
}

function buildPatternDrill({ pattern, vocabulary, title, focus }) {
  const candidates = vocabulary.filter((word) => word.includes(pattern));
  if (candidates.length < MINIMUM_CANDIDATES) return null;

  const ordered = orderCandidates(candidates, pattern);
  const interior = ordered.filter((word) => word.indexOf(pattern) > 0);
  if (interior.length < MINIMUM_INTERIOR) return null;

  return {
    id: `drill:${focus.level}:${pattern}`,
    title,
    body: fill(ordered, TARGET_WORD_COUNT).join(" "),
    durationSeconds: DRILL_SECONDS,
    isDrill: true,
    focus,
    words: ordered.slice(0, 6),
    pattern,
  };
}

export function buildDrill(finding, catalog) {
  if (!finding || !finding.subject) return null;
  const vocabulary = getCatalogVocabulary(catalog);

  if (finding.level === "transition") {
    const pattern = finding.subject.value;
    return buildPatternDrill({
      pattern,
      vocabulary,
      title: `“${pattern}” movement`,
      focus: { level: "transition", pattern },
    });
  }

  if (finding.level === "character") {
    const pattern = finding.subject.value.toLowerCase();
    if (!/^[a-z]$/.test(pattern)) return null;
    return buildPatternDrill({
      pattern,
      vocabulary,
      title: `the “${pattern}” key`,
      focus: { level: "character", pattern },
    });
  }

  if (finding.level === "word") {
    const word = finding.subject.value.toLowerCase().replace(/[^a-z']/g, "");
    if (word.length < 3) return null;
    // The word itself, spaced out with its catalog neighbours so it is typed in
    // company rather than drilled in isolation.
    const neighbours = vocabulary.filter((candidate) => candidate !== word && candidate.length >= 4).slice(0, 3);
    if (!neighbours.length) return null;
    const pattern = [word, ...neighbours];
    return {
      id: `drill:word:${word}`,
      title: `the word “${word}”`,
      body: fill(pattern, TARGET_WORD_COUNT).join(" "),
      durationSeconds: DRILL_SECONDS,
      isDrill: true,
      focus: { level: "word", pattern: word },
      words: [word, ...neighbours],
      pattern: word,
    };
  }

  // Pauses, pace and run-only findings describe how the run went rather than a
  // pattern to isolate, so there is nothing honest to drill.
  return null;
}
