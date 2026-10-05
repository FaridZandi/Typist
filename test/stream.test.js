import test from 'node:test';
import assert from 'node:assert/strict';
import {WordAttempt, addWord, addTotals, emptyTotals, chooseWord, troubleScore} from '../src/stream/model.js';
import {validateBackup, dayKey} from '../src/stream/storage.js';
import {WORDS} from '../src/stream/words.js';

function type(word, keys = word, times = []) {
  const engine = new WordAttempt({word, source: 'broad'}, 'test-vocab'); let record;
  [...keys, ' '].forEach((key, index) => { record = engine.key(key, times[index] ?? index * 100, 1720000000000); });
  return record;
}
function backup() {
  const record = {...type('word'), id: 'attempt-1'};
  return {format: 'typist-word-stream', version: 1, words: [addWord(null, record)], attempts: [record], days: [{day: dayKey(record.at), ...addTotals(emptyTotals(), record)}], totals: addTotals(emptyTotals(), record)};
}

test('word submissions count clean attempts and nonempty incomplete spellings', () => {
  assert.equal(type('word').clean, true);
  assert.equal(type('word', 'wo').clean, false);
  assert.equal(type('word', 'wo').remaining, 2);
  const engine = new WordAttempt({word: 'word', source: 'broad'}, 'v1');
  assert.equal(engine.key(' ', 0), null); assert.equal(engine.firstAt, null);
});
test('corrected typos remain troubled attempts', () => {
  const engine = new WordAttempt({word: 'word', source: 'broad'}, 'v1');
  ['w', 'o', 'x', 'Backspace', 'r', 'd'].forEach((key, i) => engine.key(key, i * 100));
  const result = engine.key(' ', 600);
  assert.equal(result.typed, 'word'); assert.equal(result.remaining, 0);
  assert.equal(result.errors, 1); assert.equal(result.corrections, 1); assert.equal(result.clean, false);
});
test('long pauses exclude speed comparisons without inventing errors', () => {
  const result = type('word', 'word', [0, 100, 10100, 10200, 10300]);
  assert.equal(result.executionMs, null); assert.equal(result.activeMs, 300); assert.equal(result.clean, true);
});
test('leaving the page excludes an interrupted word from timings', () => {
  const engine = new WordAttempt({word: 'it', source: 'broad'}, 'v1');
  engine.key('i', 0); engine.suspend(); engine.key('t', 10000); const result = engine.key(' ', 10100);
  assert.equal(result.executionMs, null); assert.equal(result.activeMs, 100);
});
test('input and histories remain bounded during a long stream', () => {
  const engine = new WordAttempt({word: 'word', source: 'broad'}, 'v1');
  for (let i = 0; i < 1000; i++) engine.key('a', i);
  assert.equal(engine.typed.length, 64);
  let word;
  for (let i = 0; i < 100; i++) word = addWord(word, type('word'));
  assert.equal(word.attempts, 100); assert.equal(word.recent.length, 20);
});
test('one mistake is not a repeated weakness; clean practice retires it', () => {
  let summary = addWord(null, type('word', 'wrod'));
  assert.equal(troubleScore(summary), 0);
  summary = addWord(summary, type('word')); summary = addWord(summary, type('word', 'wrod'));
  assert.ok(troubleScore(summary) > 0);
  for (let i = 0; i < 20; i++) summary = addWord(summary, type('word'));
  assert.equal(troubleScore(summary), 0);
});
test('selection preserves broad draws, targets supported trouble, and avoids repetition', () => {
  let summary;
  for (const keys of ['wrod', 'wrod', 'word']) summary = addWord(summary, type('word', keys));
  const vocabulary = ['word', 'calm', 'light']; const summaries = new Map([['word', summary]]);
  assert.deepEqual(chooseWord(vocabulary, summaries, [], () => 0), {word: 'word', source: 'targeted'});
  assert.equal(chooseWord(vocabulary, summaries, [], () => .9).source, 'broad');
  assert.notEqual(chooseWord(vocabulary, summaries, ['word'], () => 0).word, 'word');
});
test('neutral vocabulary is unique, lowercase, local and sufficient for variety', () => {
  assert.ok(WORDS.length > 300); assert.equal(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.every(word => /^[a-z]+$/.test(word)));
});
test('broad and targeted outcome counts remain distinguishable', () => {
  const broad = type('word'); const targeted = {...type('word', 'wrod'), source: 'targeted'};
  const totals = addTotals(addTotals(emptyTotals(), broad), targeted);
  assert.equal(totals.broadClean, 1); assert.equal(totals.targetedClean, 0);
  assert.equal(totals.attempts, 2); assert.equal(totals.clean, 1);
});
test('valid stream backup retains both summaries and audit records', () => {
  const data = backup(); assert.equal(validateBackup(data), data);
});
test('malformed and incompatible backups are rejected before replacement', () => {
  for (const mutate of [data => data.version = 2, data => data.words[0].recent = null, data => data.totals.attempts++, data => data.attempts.push(data.attempts[0]), data => data.attempts[0].clean = false, data => data.words[0].clean = 10, data => data.days[0].day = '2026-99-20', data => data.attempts[0].typed = null]) {
    const data = backup(); mutate(data); assert.throws(() => validateBackup(data));
  }
});
