import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFontSize} from '../src/stream/cloud-sizing.js';
import {wordProbabilities} from '../src/stream/model.js';

test('cloud prominence follows the full probability curve as focus increases', () => {
  const summaries = new Map(['alpha', 'beta', 'gamma'].map(word => [word, {word, attempts: 3, recent: [{clean: false}, {clean: false}, {clean: false}]}]));
  const vocabulary = ['alpha', 'beta', 'gamma', 'unseen'];
  const sizes = [0, 50, 100].map(focus => wordProbabilities(vocabulary, summaries, [], focus).ranked.map(word => cloudFontSize(word.probability)));
  assert.equal(new Set(sizes[0]).size, 1);
  assert.ok(sizes[0][0] < sizes[1][0] && sizes[1][0] < sizes[2][0]);
  assert.ok(sizes[0][2] > sizes[1][2] && sizes[1][2] > sizes[2][2]);
  assert.ok(sizes[2][0] / sizes[2][2] > sizes[1][0] / sizes[1][2]);
  // No re-normalization among cloud words: a larger global probability matters.
  assert.ok(cloudFontSize(.2) > cloudFontSize(.1));
});

test('cloud size limits handle zero, a singleton, small probabilities and compact layouts', () => {
  for (const maximum of [42, 58]) {
    const sizes = [0, .0001, .001, .01, .1, .5, 1].map(probability => cloudFontSize(probability, maximum));
    assert.ok(sizes.every((size, i) => Number.isFinite(size) && size >= 13 && size <= maximum && (!i || size >= sizes[i - 1])));
    assert.equal(sizes.at(-1), maximum);
    assert.equal(cloudFontSize(NaN, maximum), 13);
  }
});
