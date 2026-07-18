// Prompt catalog for typing practice. Keeping the copy here makes the typing
// engine independent from the content and lets each prompt have its own stats.
const typingTexts = Object.freeze([
  Object.freeze({
    id: "calm-precision",
    title: "Calm precision",
    body: "Typing well is built from steady rhythm, careful attention, and relaxed hands.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "one-word",
    title: "One word at a time",
    body: "Focus on one word at a time. Let mistakes show you where to slow down, then keep moving with calm precision.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "clear-mind",
    title: "A clear mind",
    body: "A clear mind and consistent pace matter more than rushing through every sentence.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "deliberate-practice",
    title: "Deliberate practice",
    body: "Good practice feels deliberate. Keep your shoulders loose, return your eyes to the next letter, and trust the pattern under your fingers.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "cleaner-habits",
    title: "Cleaner habits",
    body: "When you miss a character, notice it quickly and continue. The goal is not perfection in every moment, but cleaner habits over the full minute.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "short-sessions",
    title: "Short sessions",
    body: "Short sessions make progress easier to see. Breathe, keep a steady rhythm, and finish the line in front of you.",
    durationSeconds: 60,
  }),
]);

// The explicit window reference also makes the catalog available to embedded
// harnesses that evaluate the two classic scripts separately.
window.typingTexts = typingTexts;
