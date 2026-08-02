// The typing state machine. It owns every piece of mutable run state and knows
// nothing about the DOM: callers feed it keystrokes and read the resulting
// counters, events, and summary back out.
//
// Backspace edits only the active word; space commits it and moves to the next
// prompt word. Handlers return `{ complete }` so the caller decides when the
// run ends rather than the engine reaching out to finish it.

import { pauseFloorMs, pauseMedianMultiplier } from "./config.js";
import { getPromptIndex } from "./text-model.js";
import { analyzeWordAlignment } from "./alignment.js";
import { getFluencyMetrics, getMedian } from "./metrics.js";
import {
  getCharacterAggregate,
  getShiftMetrics,
  getTransitionAggregate,
  getWordAggregate,
  getWordFragmentAggregate,
} from "./aggregates.js";

export function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export class TypingRun {
  constructor({ words, onStart = () => {} }) {
    this.words = words;
    this.onStart = onStart;
    this.started = false;
    this.finished = false;

    this.currentWordIndex = 0;
    this.currentWordBuffer = "";
    this.currentWordKeys = [];
    this.currentWordLastKeyTimes = new Map();
    this.currentWordMistakeOffsets = new Set();
    this.currentWordDeletedExtraErrors = 0;
    this.committedWords = [];

    this.promptAttempts = new Set();
    this.mistakes = new Set();
    this.intervals = new Map();
    this.expectedAttempts = 0;
    this.correctCharacters = 0;
    this.mistakeCount = 0;
    this.extraErrors = 0;

    this.previousMatchedTime = null;
    this.previousKeyTime = null;
    this.keyIntervals = [];
    this.events = [];
    this.completedWordAnalyses = [];

    this.printableKeyCount = 0;
    this.committedSpaces = 0;
    this.processErrors = 0;
    this.correctedErrors = 0;
    this.startTimestamp = null;
  }

  start() {
    if (this.started || this.finished) return;
    this.started = true;
    this.onStart();
  }

  recordEvent(type, key, timestamp, offset, expectedCharacter = null, modifiers = {}) {
    if (!Number.isFinite(timestamp)) return;
    if (this.startTimestamp === null) this.startTimestamp = timestamp;
    this.events.push({
      type,
      key,
      timestampMs: Math.max(0, timestamp - this.startTimestamp),
      wordIndex: this.currentWordIndex,
      bufferOffset: offset,
      expectedCharacter,
      modifiers: { shift: Boolean(modifiers.shift), alt: Boolean(modifiers.alt), ctrl: Boolean(modifiers.ctrl), meta: Boolean(modifiers.meta) },
    });
  }

  recordMatchedTiming(promptIndex, timestamp) {
    if (!Number.isFinite(timestamp)) return;
    if (this.previousMatchedTime !== null && timestamp > this.previousMatchedTime) this.intervals.set(promptIndex, timestamp - this.previousMatchedTime);
    this.previousMatchedTime = timestamp;
  }

  recordKeyTiming(timestamp) {
    if (!Number.isFinite(timestamp)) return;
    if (this.previousKeyTime !== null && timestamp > this.previousKeyTime) {
      this.keyIntervals.push(timestamp - this.previousKeyTime);
    }
    this.previousKeyTime = timestamp;
  }

  handleCharacter(character, timestamp = now(), modifiers = {}) {
    if (this.finished || character === " " || this.currentWordIndex >= this.words.length) return { complete: false };
    this.start();
    this.recordKeyTiming(timestamp);
    const offset = this.currentWordBuffer.length;
    const expected = this.words[this.currentWordIndex].text[offset];
    this.recordEvent("character", character, timestamp, offset, expected ?? null, modifiers);
    this.printableKeyCount += 1;
    if (character !== expected) this.processErrors += 1;
    this.currentWordBuffer += character;
    this.currentWordKeys.push({ character, offset, timestamp });
    this.currentWordLastKeyTimes.set(offset, timestamp);
    if (expected !== character) this.currentWordMistakeOffsets.add(offset);

    // Finishing the last word correctly ends the run without waiting for a space.
    const word = this.words[this.currentWordIndex];
    const isFinalWord = this.currentWordIndex === this.words.length - 1;
    if (isFinalWord && this.currentWordBuffer.length >= word.text.length && [...this.currentWordBuffer].every((value, index) => value === word.text[index])) {
      this.commitCurrentWord(timestamp, false);
      return { complete: true };
    }
    return { complete: false };
  }

  handleBackspace(timestamp = now(), modifiers = {}) {
    if (this.finished || this.currentWordBuffer.length === 0) return { complete: false };
    this.start();
    this.recordKeyTiming(timestamp);
    const removedOffset = this.currentWordBuffer.length - 1;
    const removedCharacter = [...this.currentWordBuffer][removedOffset];
    const expected = this.words[this.currentWordIndex].text[removedOffset];
    this.recordEvent("backspace", "Backspace", timestamp, removedOffset, expected ?? null, modifiers);
    if (removedCharacter !== expected) this.correctedErrors += 1;
    if (removedOffset >= this.words[this.currentWordIndex].text.length) this.currentWordDeletedExtraErrors += 1;
    this.currentWordBuffer = [...this.currentWordBuffer].slice(0, -1).join("");
    this.currentWordKeys.push({ character: "Backspace", offset: removedOffset, timestamp });
    return { complete: false };
  }

  handleSpace(timestamp = now(), modifiers = {}) {
    if (this.finished) return { complete: false };
    this.start();
    this.recordKeyTiming(timestamp);
    this.recordEvent("space", " ", timestamp, this.currentWordBuffer.length, null, modifiers);
    this.printableKeyCount += 1;
    this.commitCurrentWord(timestamp, true);
    return { complete: this.currentWordIndex >= this.words.length };
  }

  // Typed characters that arrive as a block (IME, paste, autocomplete) replace
  // the active word rather than appending to whatever is already buffered.
  applyExternalInput(value, clock = now) {
    if (!/[\s]/.test(value) && this.currentWordIndex < this.words.length) {
      this.currentWordBuffer = "";
      this.currentWordKeys = [];
      this.currentWordLastKeyTimes = new Map();
    }
    let complete = false;
    [...value].forEach((character) => {
      const result = character === " " || character === "\n" || character === "\r" || character === "\t"
        ? this.handleSpace(clock())
        : this.handleCharacter(character, clock());
      complete = complete || result.complete;
    });
    return { complete };
  }

  commitCurrentWord(separatorTimestamp = now(), includeSeparator = false) {
    if (this.finished || this.currentWordIndex >= this.words.length) return;
    const word = this.words[this.currentWordIndex];
    const typedCharacters = [...this.currentWordBuffer];
    const mistakeOffsets = new Set(this.currentWordMistakeOffsets);
    const committed = { typedCharacters, mistakeOffsets: [...mistakeOffsets], separatorCommitted: Boolean(includeSeparator) };
    this.completedWordAnalyses.push({ ...analyzeWordAlignment(word.text, typedCharacters), wordIndex: this.currentWordIndex });
    let wordMistakes = 0;

    // A character only counts as correct if it was never wrong at this offset,
    // so a corrected key still records the mistake it started as.
    [...word.text].forEach((expectedCharacter, offset) => {
      const promptIndex = getPromptIndex(word, offset);
      this.promptAttempts.add(promptIndex);
      this.expectedAttempts += 1;
      const isCorrect = typedCharacters[offset] === expectedCharacter && !mistakeOffsets.has(offset);
      if (isCorrect) {
        this.correctCharacters += 1;
        this.recordMatchedTiming(promptIndex, this.currentWordLastKeyTimes.get(offset));
      } else {
        wordMistakes += 1;
        this.mistakes.add(promptIndex);
      }
    });
    const extraErrors = this.currentWordDeletedExtraErrors + Math.max(0, typedCharacters.length - word.text.length);
    this.extraErrors += extraErrors;
    this.mistakeCount += wordMistakes + extraErrors;

    if (includeSeparator && this.currentWordIndex < this.words.length - 1) {
      const separatorIndex = word.end;
      this.promptAttempts.add(separatorIndex);
      this.expectedAttempts += 1;
      this.correctCharacters += 1;
      this.recordMatchedTiming(separatorIndex, separatorTimestamp);
      this.committedSpaces += 1;
    }

    this.committedWords[this.currentWordIndex] = committed;
    this.currentWordIndex = includeSeparator ? this.currentWordIndex + 1 : this.words.length;
    this.currentWordBuffer = "";
    this.currentWordKeys = [];
    this.currentWordLastKeyTimes = new Map();
    this.currentWordMistakeOffsets = new Set();
    this.currentWordDeletedExtraErrors = 0;
  }

  finish(timestamp = now()) {
    if (this.finished) return;
    if (this.currentWordIndex < this.words.length) this.commitCurrentWord(timestamp, false);
    this.finished = true;
  }

  // The active word is scored provisionally so live metrics update mid-word
  // without committing anything the typist can still correct.
  getProvisionalCounts() {
    let attempts = this.expectedAttempts;
    let correct = this.correctCharacters;
    let mistakes = this.mistakeCount;
    if (!this.finished && this.currentWordIndex < this.words.length) {
      const expected = [...this.words[this.currentWordIndex].text];
      const typed = [...this.currentWordBuffer];
      attempts += typed.length;
      typed.forEach((character, index) => {
        if (character === expected[index] && !this.currentWordMistakeOffsets.has(index)) correct += 1;
        else mistakes += 1;
      });
    }
    return { attempts, correct, mistakes };
  }

  getMetrics(elapsedSeconds) {
    const counts = this.getProvisionalCounts();
    const minutesElapsed = Math.max(elapsedSeconds / 60, 1 / 60);
    const wordsPerMinute = Math.round(counts.correct / 5 / minutesElapsed);
    const attempts = counts.attempts + this.extraErrors;
    const accuracy = attempts === 0 ? 100 : Math.round((counts.correct / attempts) * 100);
    return { wordsPerMinute, accuracy };
  }

  // The completed-run record: headline numbers plus the aggregates that pool
  // this run with previously stored ones.
  buildSummary({ storedRecords = [], textId }) {
    const categories = { substitution: 0, omission: 0, insertion: 0, transposition: 0, duplication: 0, capitalization: 0, punctuation: 0 };
    let finalCorrect = 0;
    let expectedCharacters = 0;
    let insertions = 0;
    this.completedWordAnalyses.forEach((word) => {
      finalCorrect += word.finalCorrect;
      expectedCharacters += [...word.expected].length;
      insertions += word.categories.insertion;
      Object.keys(categories).forEach((category) => { categories[category] += word.categories[category]; });
    });
    finalCorrect += this.committedSpaces;
    expectedCharacters += this.committedSpaces;

    const intervals = this.keyIntervals.filter((interval) => interval > 0);
    const medianInterval = getMedian(intervals);
    const pauseThreshold = Math.max(pauseFloorMs, medianInterval * pauseMedianMultiplier);
    const pauses = intervals.filter((interval) => interval >= pauseThreshold);
    const lastTimestamp = this.events.at(-1)?.timestampMs ?? 0;
    const fluency = getFluencyMetrics(this.events);
    const durationMs = Math.max(lastTimestamp, 1000);
    const minutes = durationMs / 60000;
    const finalAttempts = expectedCharacters + insertions;
    const processAttempts = this.printableKeyCount;

    const eventRecords = [...storedRecords, { events: this.events, textId }];
    const wordRecords = [...storedRecords, { events: this.events, words: this.completedWordAnalyses, textId }];
    const fragmentRecords = [...storedRecords, { words: this.completedWordAnalyses, textId }];

    return {
      grossWordsPerMinute: Math.round((this.printableKeyCount / 5) / minutes),
      effectiveWordsPerMinute: Math.round((finalCorrect / 5) / minutes),
      finalAccuracy: finalAttempts ? Math.round((finalCorrect / finalAttempts) * 100) : 100,
      processAccuracy: processAttempts ? Math.round(((processAttempts - this.processErrors) / processAttempts) * 100) : 100,
      correctedErrors: this.correctedErrors,
      remainingErrors: Math.max(0, finalAttempts - finalCorrect),
      completionMs: lastTimestamp,
      pauseCount: pauses.length,
      pauseDurationMs: pauses.reduce((total, pause) => total + pause, 0),
      pauseThresholdMs: Math.round(pauseThreshold),
      categories,
      transitions: getTransitionAggregate(eventRecords),
      trigrams: getTransitionAggregate(eventRecords, 3),
      characters: getCharacterAggregate(eventRecords),
      wordPatterns: getWordAggregate(wordRecords),
      prefixPatterns: getWordFragmentAggregate(fragmentRecords, "prefix"),
      suffixPatterns: getWordFragmentAggregate(fragmentRecords, "suffix"),
      shift: getShiftMetrics(eventRecords),
      ...fluency,
    };
  }
}
