import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname} from 'node:path';
import {chromium} from '@playwright/test';

let server, browser, origin;
const root = fileURLToPath(new URL('../../', import.meta.url));
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = resolve(root, '.' + new URL(req.url, 'http://local.test').pathname);
      if (!path.startsWith(root)) throw new Error('Outside test root');
      const type = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}[extname(path)] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': type}); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true});
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function page(t, viewport = {width: 1280, height: 900}) {
  const context = await browser.newContext({viewport}); t.after(() => context.close());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + '/stream.html'); await page.locator('#streamInput').waitFor({state: 'visible'});
  await page.waitForFunction(() => !document.getElementById('streamInput').disabled);
  return page;
}
async function word(page, corrected = false) {
  const expected = await page.locator('#currentWordAccessible').textContent();
  await page.locator('#streamInput').focus();
  if (corrected) { await page.keyboard.type(expected[0] === 'x' ? 'z' : 'x'); await page.keyboard.press('Backspace'); }
  await page.keyboard.type(expected); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  return expected;
}
async function data(page) { return page.evaluate(async () => { const {StreamStore} = await import('/src/stream/storage.js'); const store = await StreamStore.open(); const data = await store.export(); store.db.close(); return data; }); }

test('continuous words save corrected errors, advance, and survive reload independently of timed history', async t => {
  const p = await page(t); await p.evaluate(() => localStorage.setItem('typing-history-sentinel', 'untouched'));
  const first = await word(p); const corrected = await word(p, true);
  const saved = await data(p); assert.equal(saved.totals.attempts, 2); assert.equal(saved.totals.clean, 1);
  assert.equal(saved.attempts.find(attempt => attempt.word === corrected).corrections, 1);
  assert.equal(saved.words.find(word => word.word === first).clean, 1);
  await p.reload(); await p.waitForFunction(() => document.getElementById('allWords').textContent === '2');
  assert.equal(await p.evaluate(() => localStorage.getItem('typing-history-sentinel')), 'untouched');
  assert.equal(await p.getByRole('button', {name: /start|stop/i}).count(), 0);
});
test('a partial word and pasted text do not create completed attempts; leaving midword excludes timing', async t => {
  const p = await page(t); const expected = await p.locator('#currentWordAccessible').textContent();
  await p.locator('#streamInput').focus(); await p.keyboard.type(expected[0]);
  await p.locator('#wordFilter').focus(); await p.locator('#streamInput').focus();
  await p.keyboard.type(expected.slice(1)); await p.keyboard.press('Space');
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  assert.equal((await data(p)).attempts[0].executionMs, null);
  await p.locator('#streamInput').evaluate(input => { input.dispatchEvent(new InputEvent('beforeinput', {inputType: 'insertFromPaste', data: 'fake words ', bubbles: true, cancelable: true})); });
  await p.keyboard.type('partial'); await p.reload();
  await p.waitForFunction(() => document.getElementById('allWords').textContent === '1');
});
test('mobile-style beforeinput scores a word without a keydown and fits a narrow viewport', async t => {
  const p = await page(t, {width: 390, height: 844}); const expected = await p.locator('#currentWordAccessible').textContent();
  await p.locator('#streamInput').evaluate((input, expected) => { for (const letter of expected + ' ') input.dispatchEvent(new InputEvent('beforeinput', {inputType: 'insertText', data: letter, bubbles: true, cancelable: true})); }, expected);
  await p.waitForFunction(() => document.getElementById('allWords').textContent === '1');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
test('same-database tabs update word summaries atomically without losing attempts', async t => {
  const p = await page(t);
  const result = await p.evaluate(async () => {
    const {StreamStore} = await import('/src/stream/storage.js'); const {WordAttempt} = await import('/src/stream/model.js');
    const a = await StreamStore.open(), b = await StreamStore.open();
    const attempt = id => { const engine = new WordAttempt({word: 'word', source: 'broad'}, 'test'); for (const [i, key] of [...'word'].entries()) engine.key(key, i * 100); return {...engine.key(' ', 400), id}; };
    await Promise.all([a.save(attempt('a')), b.save(attempt('b'))]); await a.save(attempt('a'));
    const result = await a.load(); a.db.close(); b.db.close(); return result;
  });
  assert.equal(result.totals.attempts, 2); assert.equal(result.words[0].attempts, 2); assert.equal(result.count, 2);
});
test('invalid restore leaves the database intact; a valid restore replaces only stream history', async t => {
  const p = await page(t); await word(p); const original = await data(p);
  const invalid = structuredClone(original); invalid.words[0].recent = null;
  const status = await p.evaluate(async invalid => { const {StreamStore} = await import('/src/stream/storage.js'); const store = await StreamStore.open(); try { await store.restore(invalid); return 'accepted'; } catch { return 'rejected'; } finally { store.db.close(); } }, invalid);
  assert.equal(status, 'rejected'); assert.deepEqual((await data(p)).words, original.words);
  await word(p); await p.evaluate(() => localStorage.setItem('timed-test', 'keep'));
  await p.evaluate(async original => { const {StreamStore} = await import('/src/stream/storage.js'); const store = await StreamStore.open(); await store.restore(original); store.db.close(); }, original);
  assert.equal((await data(p)).totals.attempts, 1); assert.equal(await p.evaluate(() => localStorage.getItem('timed-test')), 'keep');
});
test('retention prunes audit records and days while keeping lifetime word summaries', async t => {
  const p = await page(t);
  const result = await p.evaluate(async () => {
    const {StreamStore, dayKey} = await import('/src/stream/storage.js'); const {addWord, addTotals, emptyTotals} = await import('/src/stream/model.js');
    const store = await StreamStore.open(); const now = Date.now(); let summary, totals = emptyTotals();
    const records = Array.from({length: 10060}, (_, i) => ({id: 'retention-' + i, word: 'word', typed: 'word', source: 'broad', at: i < 10 ? now - 31 * 86400000 : now - i * 1000, clean: true, errors: 0, remaining: 0, corrections: 0, activeMs: 400, executionMs: 400, rules: 1, vocabulary: 'test'}));
    await store.transaction(['attempts', 'words', 'meta', 'days'], 'readwrite', async tx => {
      for (const record of records) { tx.objectStore('attempts').put(record); summary = addWord(summary, record); totals = addTotals(totals, record); }
      tx.objectStore('words').put(summary); tx.objectStore('meta').put({key: 'totals', value: totals});
      for (let i = 0; i < 400; i++) tx.objectStore('days').put({day: dayKey(now - i * 86400000), ...addTotals(emptyTotals(), records[0])});
    });
    await store.trim(now); const result = await store.load(); store.db.close(); return result;
  });
  assert.equal(result.count, 10000); assert.equal(result.words[0].attempts, 10060); assert.equal(result.days.length, 365); assert.equal(result.totals.attempts, 10060);
});
test('failed saving retains the attempt in this tab and retry recovers without duplicates', async t => {
  const p = await page(t);
  await p.evaluate(async () => { const {StreamStore} = await import('/src/stream/storage.js'); const save = StreamStore.prototype.save; let fail = true; StreamStore.prototype.save = async function(record) { if (fail) { fail = false; throw new Error('Simulated quota error'); } return save.call(this, record); }; });
  const expected = await p.locator('#currentWordAccessible').textContent(); await p.locator('#streamInput').focus(); await p.keyboard.type(expected + ' ');
  await p.locator('#storageAlert').waitFor({state: 'visible'}); assert.match(await p.locator('#saveState').textContent(), /1 word.*not saved/);
  await p.getByRole('button', {name: 'Retry saving'}).click(); await p.locator('#storageAlert').waitFor({state: 'hidden'});
  assert.equal((await data(p)).totals.attempts, 1);
});
test('supported trouble feeds targeted words and renders an interpretable attempt trail', async t => {
  const p = await page(t);
  await p.evaluate(async () => { const {StreamStore} = await import('/src/stream/storage.js'); const {WordAttempt} = await import('/src/stream/model.js'); const store = await StreamStore.open(); for (let n = 0; n < 3; n++) { const engine = new WordAttempt({word: 'practice', source: 'broad'}, 'test'); for (const [i, key] of [...'practixe'].entries()) engine.key(key, i * 100); await store.save({...engine.key(' ', 800), id: 'trouble-' + n}); } store.db.close(); });
  await p.addInitScript(() => { Math.random = () => 0; }); await p.reload();
  await p.waitForFunction(() => document.getElementById('focusCount').textContent === '1');
  assert.equal(await p.locator('#wordSource').textContent(), 'Targeted repeat');
  assert.equal(await p.locator('.word-row:not(.header)').count(), 1);
  assert.equal(await p.locator('.word-trail .trouble').count(), 3);
  await p.screenshot({path: '/private/tmp/typist-stream.png', fullPage: true});
});

test('backup buttons export and restore; invalid input and cancellation preserve history', async t => {
  const p = await page(t); await word(p);
  await p.locator('.stream-data summary').click();
  const downloadPromise = p.waitForEvent('download'); await p.getByRole('button', {name: 'Export stream history'}).click();
  const download = await downloadPromise; const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.totals.attempts, 1);
  await word(p);
  await p.locator('#importFile').setInputFiles({name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"wrong"}')});
  await p.locator('#dataNotice').filter({hasText: 'Restore failed'}).waitFor(); assert.equal((await data(p)).totals.attempts, 2);
  p.once('dialog', dialog => dialog.dismiss());
  await p.locator('#importFile').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
  await p.waitForFunction(() => !document.getElementById('streamInput').disabled);
  assert.equal((await data(p)).totals.attempts, 2);
  p.once('dialog', dialog => dialog.accept());
  await p.locator('#importFile').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))});
  await p.locator('#dataNotice').filter({hasText: 'Stream history restored'}).waitFor(); assert.equal((await data(p)).totals.attempts, 1);
});
test('a failed replacement transaction rolls back clear and partial writes', async t => {
  const p = await page(t); await word(p); const original = await data(p);
  const outcome = await p.evaluate(async () => {
    const {StreamStore} = await import('/src/stream/storage.js'); const store = await StreamStore.open(); const backup = await store.export();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value) { if (this.name === 'attempts') throw new Error('Simulated restore write failure'); return put.call(this, value); };
    try { await store.restore(backup); return 'accepted'; } catch { return 'rejected'; }
    finally { IDBObjectStore.prototype.put = put; store.db.close(); }
  });
  assert.equal(outcome, 'rejected'); assert.deepEqual((await data(p)).words, original.words); assert.equal((await data(p)).totals.attempts, 1);
});
test('a prolonged storage failure bounds the pending queue and recovers all completed words', async t => {
  const p = await page(t);
  await p.evaluate(async () => {
    const {StreamStore} = await import('/src/stream/storage.js'); const save = StreamStore.prototype.save;
    window.recoverTestStorage = () => { StreamStore.prototype.save = save; };
    StreamStore.prototype.save = async () => { throw new Error('Offline storage'); };
    const input = document.getElementById('streamInput'); input.focus();
    for (let n = 0; n < 205; n++) { const word = document.getElementById('currentWordAccessible').textContent; for (const key of word + ' ') input.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})); }
  });
  assert.equal(await p.locator('#streamInput').isDisabled(), true);
  assert.equal(await p.locator('#allWords').textContent(), '200');
  await p.evaluate(() => window.recoverTestStorage()); await p.getByRole('button', {name: 'Retry saving'}).click();
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  assert.equal((await data(p)).totals.attempts, 200); assert.equal(await p.locator('#streamInput').isDisabled(), false);
});

test('Space preserves upcoming word positions and moves left smoothly, including track trimming', async t => {
  const p = await page(t);
  const results = await p.evaluate(async () => {
    const {StreamRenderer} = await import('/src/stream/render.js');
    const surface = document.createElement('div'); surface.className = 'stream-surface';
    const track = document.createElement('div'); track.className = 'stream-text'; surface.append(track); document.body.append(surface);
    const renderer = new StreamRenderer(track);
    const vocabulary = ['quiet', 'stream', 'practice', 'rhythm', 'balance', 'flow', 'clear', 'words', 'follow', 'another'];
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const position = word => {
      const offset = track.textContent.indexOf(word); let remaining = offset;
      const walker = document.createTreeWalker(track, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const node = walker.currentNode; if (remaining < node.length) { const range = document.createRange(); range.setStart(node, remaining); range.setEnd(node, remaining + 1); return range.getBoundingClientRect().left; } remaining -= node.length; }
      throw new Error('Word not found');
    };
    const results = [];
    for (let i = 0; i < 8; i++) {
      const upcoming = vocabulary.slice(i + 1).map(word => ({word}));
      renderer.render(vocabulary[i], vocabulary[i], upcoming);
      // Exercise both settled motion and trimming while the last key is moving.
      await pause(i % 2 ? 20 : 110);
      const before = position(vocabulary[i + 1]);
      renderer.commit(vocabulary[i], vocabulary[i]);
      renderer.render(vocabulary[i + 1], '', upcoming.slice(1));
      const immediate = position(vocabulary[i + 1]);
      const frames = [];
      for (let frame = 0; frame < 6; frame++) { await new Promise(requestAnimationFrame); frames.push(position(vocabulary[i + 1])); }
      await pause(80);
      results.push({before, immediate, frames, final: position(vocabulary[i + 1]), characters: track.textContent.length});
    }
    surface.remove(); return results;
  });
  for (const result of results) {
    assert.ok(Math.abs(result.immediate - result.before) < 2, `Word jumped: ${JSON.stringify(result)}`);
    assert.ok(result.final < result.before, 'Space must advance left');
    for (let i = 1; i < result.frames.length; i++) assert.ok(result.frames[i] <= result.frames[i - 1] + 1, 'Motion reversed during Space');
    assert.ok(result.characters < 110, 'Completed text must remain bounded');
  }
});

test('reduced-motion stream advances without an animated reset at word boundaries', async t => {
  const p = await page(t); await p.emulateMedia({reducedMotion: 'reduce'});
  for (let i = 0; i < 7; i++) await word(p);
  assert.equal((await data(p)).totals.attempts, 7);
  assert.equal(await p.locator('#streamText').evaluate(track => getComputedStyle(track).transitionDuration), '0s');
});
