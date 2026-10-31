import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFontSize} from '../src/stream/cloud-sizing.js';
import {wordProbabilities} from '../src/stream/model.js';

function distributions(count) {
  const summaries = new Map(Array.from({length: count}, (_, i) => ['word' + i, {word: 'word' + i, attempts: 3, recent: [{clean: false}, {clean: false}, {clean: false}]}]));
  return [0, 50, 100].map(focus => wordProbabilities([...summaries.keys(), 'unseen'], summaries, [], focus));
}
test('cloud concentration substantially enlarges the head and shrinks the tail at small and large pool sizes', () => {
  for (const count of [3, 30, 100, 470]) for (const compact of [false, true]) {
    const d = distributions(count);
    const sizes = d.map(distribution => distribution.ranked.map(word => cloudFontSize(word.probability, word.baselineProbability, compact, distribution.ranked[0].probability)));
    assert.equal(new Set(sizes[0]).size, 1);
    // Dense pools used to saturate the first several ranks to the same size.
    assert.ok(sizes[1][0] > sizes[1][1] * 1.2);
    assert.ok(sizes[2][0] > sizes[2][1] * 1.5);
    assert.ok(sizes[2][0] > sizes[0][0] * 1.6);
    assert.ok(sizes[2].at(-1) < sizes[0].at(-1) * .75);
    assert.ok(sizes[2].at(-1) < sizes[1].at(-1) * .85);
    assert.ok(sizes[2][0] / sizes[2].at(-1) > 3);
    d[0].entries.forEach((word, i) => {
      assert.equal(word.probability, word.baselineProbability);
      assert.equal(word.baselineProbability, d[2].entries[i].baselineProbability);
    });
  }
});

test('contrast mapping stays bounded and equal-probability words keep equal sizes', () => {
  for (const compact of [false, true]) {
    const maximum = compact ? 64 : 84;
    const sizes = [0, .0001, .001, .01, .1, .5, 1].map(p => cloudFontSize(p, .01, compact));
    assert.ok(sizes.every((size, i) => Number.isFinite(size) && size >= 9 && size <= maximum && (!i || size >= sizes[i - 1])));
    assert.equal(cloudFontSize(.001, .001, compact), compact ? 22 : 28);
    assert.equal(cloudFontSize(.1, .1, compact), compact ? 22 : 28);
    assert.equal(cloudFontSize(NaN, .01, compact), 9);
    assert.equal(cloudFontSize(.1, 0, compact), 9);
    const peaked = [0, .0001, .001, .01, .1, .5, 1].map(p => cloudFontSize(p, .01, compact, 1));
    assert.ok(peaked.every((size, i) => Number.isFinite(size) && size >= 9 && size <= maximum && (!i || size >= peaked[i - 1])));
    assert.ok(Math.abs(cloudFontSize(.010001, .01, compact, .010002) - cloudFontSize(.01, .01, compact, .01)) < .01);
  }
});
