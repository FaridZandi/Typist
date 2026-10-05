import {analyzeWordAlignment} from '../alignment.js';

export const RULES_VERSION = 1;
export const PAUSE_MS = 5000;
export const RECENT_LIMIT = 20;
export const emptyTotals = () => ({attempts: 0, clean: 0, characters: 0, activeMs: 0, broad: 0, broadClean: 0, targeted: 0, targetedClean: 0});

export function addTotals(previous = emptyTotals(), attempt) {
  const totals = {...previous};
  totals.attempts++;
  totals.clean += Number(attempt.clean);
  totals.characters += attempt.word.length + 1;
  totals.activeMs += attempt.activeMs;
  totals[attempt.source]++;
  totals[`${attempt.source}Clean`] += Number(attempt.clean);
  return totals;
}

export function addWord(previous, attempt) {
  const word = previous || {word: attempt.word, attempts: 0, clean: 0, errors: 0, corrections: 0, timed: 0, executionMs: 0, broad: 0, broadClean: 0, targeted: 0, targetedClean: 0, recent: []};
  return {...word, attempts: word.attempts + 1, clean: word.clean + Number(attempt.clean),
    errors: word.errors + attempt.errors, corrections: word.corrections + attempt.corrections,
    timed: word.timed + Number(attempt.executionMs !== null), executionMs: word.executionMs + (attempt.executionMs || 0),
    [attempt.source]: word[attempt.source] + 1, [`${attempt.source}Clean`]: word[`${attempt.source}Clean`] + Number(attempt.clean),
    lastAt: attempt.at, recent: [...word.recent, {clean: attempt.clean, at: attempt.at, source: attempt.source, executionMs: attempt.executionMs}].slice(-RECENT_LIMIT)};
}

export function troubleScore(word) {
  if (!word || word.attempts < 3) return 0;
  const misses = word.recent.filter(sample => !sample.clean).length;
  if (misses < 2) return 0;
  return (misses + 1) / (word.recent.length + 4);
}

export function chooseWord(vocabulary, summaries, recent = [], random = Math.random) {
  let pool = vocabulary.filter(word => !recent.slice(-5).includes(word));
  if (!pool.length) pool = vocabulary;
  const targets = pool.filter(word => troubleScore(summaries.get(word)) > 0);
  if (targets.length && random() < 0.3) {
    const total = targets.reduce((sum, word) => sum + troubleScore(summaries.get(word)), 0);
    let position = random() * total;
    for (const word of targets) { position -= troubleScore(summaries.get(word)); if (position <= 0) return {word, source: 'targeted'}; }
    return {word: targets.at(-1), source: 'targeted'};
  }
  return {word: pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))], source: 'broad'};
}

export class WordAttempt {
  constructor(prompt, vocabularyVersion) {
    this.prompt = prompt; this.vocabularyVersion = vocabularyVersion;
    this.typed = ''; this.errors = 0; this.corrections = 0; this.activeMs = 0;
    this.firstAt = null; this.lastAt = null; this.interrupted = false;
  }
  suspend() { if (this.firstAt !== null) this.interrupted = true; this.lastAt = null; }
  key(key, timestamp, wallTime = Date.now()) {
    if (key === ' ' && !this.typed) return null;
    if (key !== ' ' && key !== 'Backspace' && !/^[a-zA-Z]$/.test(key)) return null;
    if (key === 'Backspace' && !this.typed) return null;
    if (key !== ' ' && key !== 'Backspace' && this.typed.length >= 64) return null;
    if (this.lastAt !== null) {
      const gap = timestamp - this.lastAt;
      if (gap > PAUSE_MS || gap < 0) this.interrupted = true;
      else this.activeMs += gap;
    }
    this.lastAt = timestamp;
    if (this.firstAt === null) this.firstAt = timestamp;
    if (key === 'Backspace') { this.typed = this.typed.slice(0, -1); this.corrections++; return null; }
    if (key !== ' ') {
      if (key !== this.prompt.word[this.typed.length]) this.errors++;
      this.typed += key; return null;
    }
    const alignment = analyzeWordAlignment(this.prompt.word, this.typed);
    const remaining = Object.entries(alignment.categories).filter(([category]) => category !== 'duplication').reduce((sum, [, count]) => sum + count, 0);
    return {word: this.prompt.word, typed: this.typed, source: this.prompt.source, at: wallTime,
      clean: this.errors === 0 && this.corrections === 0 && remaining === 0,
      errors: this.errors, remaining, corrections: this.corrections, activeMs: Math.round(this.activeMs),
      executionMs: this.interrupted ? null : Math.round(timestamp - this.firstAt),
      rules: RULES_VERSION, vocabulary: this.vocabularyVersion};
  }
}
