import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {installDataPortability} from '../src/data-portability.js';

const backup = data => ({format: 'typist-local-data', version: 1, data});

async function harness(t, page = 'index.html') {
  const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url: 'https://typist.test/'});
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const storage = dom.window.localStorage;
  const downloads = [];
  const alerts = [];
  let reloads = 0;
  let confirmations = 0;
  let accept = true;
  let failOn = null;
  const area = {
    get length() { return storage.length; },
    key: index => storage.key(index),
    getItem: key => storage.getItem(key),
    removeItem: key => storage.removeItem(key),
    setItem(key, value) {
      if (failOn === key) { failOn = null; throw new Error('Storage quota exceeded'); }
      storage.setItem(key, value);
    },
  };
  t.mock.method(URL, 'createObjectURL', blob => { downloads.push(blob); return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', () => {});
  installDataPortability({document, window: {
    localStorage: area,
    confirm() { confirmations++; return accept; },
    alert: message => alerts.push(message),
    location: {reload() { reloads++; }},
  }});
  return {
    storage, downloads, alerts,
    get reloads() { return reloads; },
    get confirmations() { return confirmations; },
    cancel() { accept = false; },
    failOn(key) { failOn = key; },
    export() { document.querySelector('#exportPracticeData').click(); },
    async import(value) {
      const input = document.querySelector('#importPracticeFile');
      Object.defineProperty(input, 'files', {configurable: true, value: [{text: async () => JSON.stringify(value)}]});
      input.dispatchEvent(new dom.window.Event('change'));
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

for (const page of ['index.html', 'reaction.html']) {
  test(`${page}: backup round trip preserves typing and reaction data`, async t => {
    const h = await harness(t, page);
    const records = {
      'typist-typing-runs-v2': '{"version":2,"runs":[]}',
      'typist-reaction-history': '[{"hits":4}]',
      'typist-typing-settings-v2': '{"selectedText":"calm-precision"}',
    };
    for (const [key, value] of Object.entries(records)) h.storage.setItem(key, value);
    h.storage.setItem('unrelated', 'leave this alone');
    h.export();
    const exported = JSON.parse(await h.downloads[0].text());
    assert.deepEqual(exported.data, records);
    h.storage.setItem('typist-typing-runs-v2', '{"version":2,"runs":[{"new":true}]}');
    h.storage.setItem('typist-extra', '[]');
    await h.import(exported);
    for (const [key, value] of Object.entries(records)) assert.equal(h.storage.getItem(key), value);
    assert.equal(h.storage.getItem('typist-extra'), null);
    assert.equal(h.storage.getItem('unrelated'), 'leave this alone');
    assert.equal(h.reloads, 1);
    assert.equal(h.alerts.length, 0);
    const previous = JSON.parse(await h.downloads[1].text());
    assert.equal(previous.data['typist-extra'], '[]');
    assert.equal(previous.data['typist-typing-runs-v2'], '{"version":2,"runs":[{"new":true}]}');
  });
}

for (const [label, value] of [
  ['wrong format', {format: 'another-app', version: 1, data: {}}],
  ['array instead of records', backup([])],
  ['unrelated key', backup({unrelated: '[]'})],
  ['invalid record JSON', backup({'typist-typing-runs-v2': 'invalid'})],
]) {
  test(`rejects ${label} before changing data`, async t => {
    const h = await harness(t);
    h.storage.setItem('typist-typing-runs-v2', '[1]');
    await h.import(value);
    assert.equal(h.storage.getItem('typist-typing-runs-v2'), '[1]');
    assert.equal(h.confirmations, 0);
    assert.equal(h.downloads.length, 0);
    assert.equal(h.alerts.length, 1);
    assert.equal(h.reloads, 0);
  });
}

test('cancelling import preserves current records', async t => {
  const h = await harness(t);
  h.storage.setItem('typist-typing-runs-v2', '[1]');
  h.cancel();
  await h.import(backup({'typist-typing-runs-v2': '[2]'}));
  assert.equal(h.storage.getItem('typist-typing-runs-v2'), '[1]');
  assert.equal(h.downloads.length, 0);
  assert.equal(h.reloads, 0);
});

test('storage failure rolls back partially imported data', async t => {
  const h = await harness(t);
  h.storage.setItem('typist-typing-runs-v2', '[1]');
  h.storage.setItem('typist-reaction-history', '[3]');
  h.storage.setItem('unrelated', 'untouched');
  h.failOn('typist-reaction-history');
  await h.import(backup({'typist-typing-runs-v2': '[2]', 'typist-reaction-history': '[4]'}));
  assert.equal(h.storage.getItem('typist-typing-runs-v2'), '[1]');
  assert.equal(h.storage.getItem('typist-reaction-history'), '[3]');
  assert.equal(h.storage.getItem('unrelated'), 'untouched');
  assert.equal(h.downloads.length, 1);
  assert.equal(h.reloads, 0);
  assert.match(h.alerts[0], /Storage quota exceeded/);
});
