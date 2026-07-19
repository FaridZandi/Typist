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
  Object.freeze({
    id: "quiet-interval",
    title: "The quiet interval",
    body: "Settle into the first sentence without trying to prove anything. Let each word arrive in order, and give the spaces the same calm attention as the letters. When your hands hesitate, release the urge to force the pace. A quiet interval can restore the rhythm, leaving you ready to continue with steadier movement and a clearer sense of where the next key belongs.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "patient-return",
    title: "A patient return",
    body: "Every return to the home row is a small reset. The movement may be quick, but it does not need to be rushed. Notice how a patient return gives the next word a reliable starting point. Over time, that simple habit makes difficult combinations feel less dramatic, because your fingers have somewhere familiar to rest before they begin again.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "reliable-motion",
    title: "Reliable motion",
    body: "Reliable typing is built from many ordinary motions performed with care. Keep your wrists light, your shoulders low, and your attention close to the word in progress. If a mistake appears, do not let it pull your focus across the whole line. Finish the current thought, recover your position, and let the next sequence show you what a more useful rhythm feels like.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "next-sentence",
    title: "The next sentence",
    body: "A long passage becomes manageable when you trust the next sentence instead of measuring the distance to the end. Read just far enough ahead to prepare your hands, then return your attention to the keys beneath them. This balance between anticipation and presence keeps the work moving. You do not need a perfect run to learn something valuable from a deliberate one.",
    durationSeconds: 60,
  }),
  Object.freeze({
    id: "practice-without-hurry",
    title: "Practice without hurry",
    body: "There is room for speed, but speed grows best from control. Begin at a pace that lets you notice each transition between letters, especially the combinations that usually make you tense. Keep breathing while you type, and allow a correction to be part of the process rather than a reason to abandon the rhythm. Consistent practice turns attention into confidence one small phrase at a time.",
    durationSeconds: 60,
  }),
]);

// The explicit window reference also makes the catalog available to embedded
// harnesses that evaluate the two classic scripts separately.
window.typingTexts = typingTexts;
