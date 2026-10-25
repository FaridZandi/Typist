import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudLayoutCache, CLOUD_LAYOUT_KEY} from '../src/stream/cloud-layout-cache.js';

test('visual cloud anchors survive reload with a bounded viewport cache', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)};
  const cache = new CloudLayoutCache(storage);
  const words = Array.from({length: 60}, (_, i) => ({text: 'word', x: i, y: 20}));
  for (const width of [300, 400, 500, 600]) cache.set(`${width}x240`, words);
  const saved = JSON.parse(values.get(CLOUD_LAYOUT_KEY));
  assert.equal(saved.layouts.length, 3); assert.ok(saved.layouts.every(([, words]) => words.length === 48));
  cache.set('600x240', [{text: 'practice', x: 100, y: 80}]);
  const restored = new CloudLayoutCache(storage);
  assert.deepEqual(restored.get('600x240').get('practice'), {text: 'practice', x: 100, y: 80});
  assert.equal(restored.get('300x240').size, 0);
});

test('corrupt, out-of-bounds and denied optional cloud cache never block layout', () => {
  for (const raw of ['broken', '{"version":2}', '{"version":1,"layouts":[null]}']) {
    assert.equal(new CloudLayoutCache({getItem: () => raw}).get('300x240').size, 0);
  }
  const raw = JSON.stringify({version: 1, layouts: [['300x240', [{text: 'valid', x: 100, y: 100}, {text: 'outside', x: 999, y: 20}, {text: 'invalid', x: null, y: 20}]]]});
  assert.deepEqual([...new CloudLayoutCache({getItem: () => raw}).get('300x240').keys()], ['valid']);
  const cache = new CloudLayoutCache({getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }});
  cache.set('300x240', [{text: 'practice', x: 100, y: 80}]);
  assert.equal(cache.get('300x240').get('practice').x, 100);
});
