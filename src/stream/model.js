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

export function compareDifficulty(a, b) {
  return troubleScore(b) - troubleScore(a) || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0);
}

export const DEFAULT_FOCUS = 50;
export const normalizeFocus = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : DEFAULT_FOCUS;

// Joint broad/targeted masses preserve source accounting while the plotted
// marginal probability includes BOTH ways of selecting each word.
export function wordProbabilities(vocabulary, summaries, recent = [], focus = DEFAULT_FOCUS) {
  const words = [...new Set(vocabulary)];
  const practiced = word => (summaries.get(word)?.attempts || 0) > 0;
  const ranked = words.filter(practiced).sort((a, b) => compareDifficulty({...summaries.get(a), word: a}, {...summaries.get(b), word: b}));
  const cooldown = recent.slice(-5);
  let pool = words.filter(word => !cooldown.includes(word));
  // Release the least recently drawn candidate only when constraints demand it.
  const oldest = candidates => [...candidates].sort((a, b) => cooldown.lastIndexOf(a) - cooldown.lastIndexOf(b))[0];
  if (!pool.length && words.length) pool = [oldest(words)];
  const unseen = words.filter(word => !practiced(word));
  let relaxed = false;
  if (unseen.length && !pool.some(word => !practiced(word))) {
    pool.push(oldest(unseen)); relaxed = true;
  }
  const eligible = new Set(pool);
  const targets = ranked.filter(word => eligible.has(word) && troubleScore(summaries.get(word)) > 0);
  const t = normalizeFocus(focus) / 100;
  const alpha = targets.length ? .6 * t : 0;
  const beta = .5 + 1.5 * t;
  const weights = targets.map((word, index) => (index + 1) ** -beta);
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const targetWeights = new Map(targets.map((word, i) => [word, weights[i] / weightTotal]));
  const newCount = pool.filter(word => !practiced(word)).length;
  const oldCount = pool.length - newCount;
  const newMass = newCount ? (oldCount ? .5 : 1) : 0;
  const entries = words.map(word => {
    const seen = practiced(word);
    const broad = eligible.has(word) ? (1 - alpha) * (seen ? (1 - newMass) / oldCount : newMass / newCount) : 0;
    const targeted = alpha * (targetWeights.get(word) || 0);
    return {word, broad, targeted, probability: broad + targeted, eligible: eligible.has(word)};
  });
  const byWord = new Map(entries.map(entry => [entry.word, entry]));
  return {entries, ranked: ranked.map((word, i) => ({...byWord.get(word), rank: i + 1, reliable: troubleScore(summaries.get(word)) > 0})),
    unseenProbability: entries.filter(entry => !practiced(entry.word)).reduce((sum, entry) => sum + entry.probability, 0),
    unseenCount: unseen.length, targetCount: targets.length, relaxed};
}

export function chooseWord(vocabulary, summaries, recent = [], random = Math.random, focus = DEFAULT_FOCUS) {
  const {entries} = wordProbabilities(vocabulary, summaries, recent, focus);
  let position = random();
  // Targeted intervals first retain the established source semantics.
  for (const source of ['targeted', 'broad']) {
    for (const entry of entries) {
      if (position < entry[source]) return {word: entry.word, source};
      position -= entry[source];
    }
  }
  const last = entries.findLast(entry => entry.probability > 0);
  return last ? {word: last.word, source: last.broad > 0 ? 'broad' : 'targeted'} : null;
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
