// Everything that turns a catalog entry into something the run engine can use:
// word boundaries, run length, and the difficulty estimate behind the
// deliberately approximate cross-text speed comparison.

import { runLengthSeconds } from "./config.js";

export function createTextIndex(catalog) {
  return new Map(catalog.map((text) => [text.id, text]));
}

export function resolveText(catalog, textById, selection) {
  if (selection !== "random" && textById.has(selection)) return textById.get(selection);
  return catalog[Math.floor(Math.random() * catalog.length)];
}

export function getRunLengthSeconds(text) {
  return text.durationSeconds || runLengthSeconds;
}

export function getTextDifficulty(text) {
  const characters = [...text.body];
  const letters = characters.filter((character) => /\p{L}/u.test(character));
  const punctuation = characters.filter((character) => /[^\p{L}\p{N}\s]/u.test(character)).length;
  const capitals = letters.filter((character) => character === character.toUpperCase() && character !== character.toLowerCase()).length;
  const punctuationDensity = punctuation / Math.max(1, characters.length);
  const capitalRate = capitals / Math.max(1, letters.length);
  return Number((1 + punctuationDensity * 2 + capitalRate * 0.4 + Math.max(0, characters.length - 400) / 2000).toFixed(3));
}

export function getWords(body) {
  return [...body.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function getPromptIndex(word, offset) {
  return word.start + offset;
}
