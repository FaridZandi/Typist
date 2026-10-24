import test from 'node:test';
import assert from 'node:assert/strict';
import {wordProbabilities, chooseWord} from '../src/stream/model.js';
import {readFocus, saveFocus, FOCUS_KEY} from '../src/stream/focus.js';
const summary = (misses = 3, count = 3) => ({attempts: count, recent: Array.from({length: count}, (_, i) => ({clean: i >= misses}))});
const vocabulary = ['alpha', 'beta', 'calm', 'new'];
const summaries = new Map([['alpha', summary()], ['beta', summary(2)], ['calm', summary(0)]]);
const probability = (d, word) => d.entries.find(e => e.word === word).probability;
function normalized(d) {
  assert.ok(d.entries.every(e => Number.isFinite(e.probability) && e.probability >= 0));
  assert.ok(Math.abs(d.entries.reduce((s, e) => s + e.probability, 0) - 1) < 1e-12);
}
test('low/default/high focus redistributes mass to hardest words and retains discovery', () => {
  const distributions = [0, 50, 100].map(f => wordProbabilities(vocabulary, summaries, [], f));
  distributions.forEach(d => { normalized(d); assert.ok(d.unseenProbability >= .2); });
  assert.deepEqual(distributions.map(d => d.unseenProbability), [.5, .35, .2]);
  assert.ok(probability(distributions[0], 'alpha') < probability(distributions[1], 'alpha'));
  assert.ok(probability(distributions[1], 'alpha') < probability(distributions[2], 'alpha'));
  assert.ok(probability(distributions[2], 'calm') > 0);
});
test('rank ties are alphabetical and independent of map/vocabulary order and cooldown', () => {
  const m = new Map([['beta', summary()], ['alpha', summary()], ['calm', summary(1, 1)]]);
  const d = wordProbabilities([...vocabulary].reverse(), m, ['alpha'], 100);
  assert.deepEqual(d.ranked.map(e => e.word), ['alpha', 'beta', 'calm']);
  assert.equal(d.ranked[0].probability, 0); assert.equal(d.ranked[0].rank, 1);
  assert.equal(d.ranked[2].reliable, false); normalized(d);
});
test('empty, singleton, exhausted, sparse and cooldown-constrained pools are honest', () => {
  assert.deepEqual(wordProbabilities([], new Map()).entries, []);
  assert.equal(chooseWord([], new Map()), null);
  for (const f of [0, 50, 100]) {
    const fresh = wordProbabilities(vocabulary, new Map(), [], f); normalized(fresh); assert.equal(fresh.unseenProbability, 1); assert.equal(fresh.ranked.length, 0);
    const one = wordProbabilities(['alpha'], summaries, ['alpha'], f); normalized(one); assert.equal(one.unseenProbability, 0);
    const sparse = wordProbabilities(['alpha'], new Map([['alpha', summary(1, 1)]]), [], f); normalized(sparse); assert.equal(sparse.targetCount, 0);
    const excluded = wordProbabilities(vocabulary, summaries, ['alpha', 'new'], f); normalized(excluded); assert.equal(probability(excluded, 'alpha'), 0); assert.ok(excluded.unseenProbability >= .2); assert.equal(excluded.relaxed, true);
    const small = wordProbabilities(['alpha', 'beta'], summaries, ['alpha', 'beta'], f); normalized(small); assert.equal(probability(small, 'beta'), 0);
  }
});
test('seeded frequencies agree with displayed marginal probabilities within six standard errors plus .001', () => {
  for (const focus of [0, 50, 100]) {
    let seed = 81237;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
    const d = wordProbabilities(vocabulary, summaries, [], focus), counts = new Map();
    const n = 60000;
    for (let i = 0; i < n; i++) { const draw = chooseWord(vocabulary, summaries, [], random, focus); counts.set(draw.word, (counts.get(draw.word) || 0) + 1); }
    for (const entry of d.entries) assert.ok(Math.abs((counts.get(entry.word) || 0) / n - entry.probability) < 6 * Math.sqrt(entry.probability * (1 - entry.probability) / n) + .001);
  }
});
test('preference persists separately, clamps malformed values and tolerates denied storage', () => {
  const values = new Map(); const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  assert.equal(readFocus(storage), 50); assert.equal(saveFocus(storage, 83), true); assert.equal(readFocus(storage), 83);
  assert.deepEqual([...values.keys()], [FOCUS_KEY]);
  values.set(FOCUS_KEY, 'broken'); assert.equal(readFocus(storage), 50);
  values.set(FOCUS_KEY, '200'); assert.equal(readFocus(storage), 100);
  const denied = {getItem() { throw Error(); }, setItem() { throw Error(); }};
  assert.equal(readFocus(denied), 50); assert.equal(saveFocus(denied, 90), false);
});
