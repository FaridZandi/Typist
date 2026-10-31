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
    // Noon keeps fixed-day synthetic dates away from midnight/DST duplicates.
    const store = await StreamStore.open(); const now = new Date().setHours(12, 0, 0, 0); let summary, totals = emptyTotals();
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

async function hardWords(p) {
  await p.evaluate(async () => {
    const {StreamStore} = await import('/src/stream/storage.js');
    const {WordAttempt} = await import('/src/stream/model.js');
    const store = await StreamStore.open();
    for (const word of ['practice', 'rhythm']) for (let n = 0; n < 3; n++) {
      const engine = new WordAttempt({word, source: 'broad'}, 'test');
      engine.key('x', 0);
      await store.save({...engine.key(' ', 100), id: `${word}-${n}`});
    }
    store.db.close();
  });
  await p.reload(); await p.waitForFunction(() => document.getElementById('focusCount').textContent === '2');
}
const contents = backup => { const {exportedAt, ...content} = backup; return content; };
async function preview(p, allowed) {
  const words = await p.locator('.stream-upcoming-word').allTextContents();
  words.unshift(await p.locator('#currentWordAccessible').textContent());
  assert.equal(words.length, 6);
  assert.ok(words.every(word => allowed.includes(word)), JSON.stringify(words));
}

test('keyboard selection repeats one unrecorded word and leaves every store, export and recorded UI unchanged', async t => {
  const p = await page(t); await hardWords(p);
  const before = contents(await data(p));
  const ui = () => p.locator('#recentWords, .stream-summary > div:not(.stream-focus-control), #wordList, #dailyHistory, #broadRate').allTextContents();
  const beforeUI = await ui();
  await p.evaluate(() => localStorage.setItem('typist-typing-sentinel', 'keep'));
  // Discard a partially typed normal word on entry.
  await p.locator('#streamInput').focus(); await p.keyboard.type('partial');
  await p.getByRole('button', {name: 'Practice practice only', exact: true}).focus(); await p.keyboard.press('Enter');
  assert.equal(await p.locator('#streamInput').evaluate(node => node === document.activeElement), true);
  assert.match(await p.locator('#practiceSet').textContent(), /attempts are not recorded/);
  for (let n = 0; n < 12; n++) { await preview(p, ['practice']); await word(p, n % 2 === 0); }
  assert.deepEqual(await ui(), beforeUI);
  assert.deepEqual(contents(await data(p)), before);
  await p.locator('.stream-data summary').click();
  const downloaded = p.waitForEvent('download'); await p.locator('#exportStream').click();
  assert.deepEqual(contents(JSON.parse(await readFile(await (await downloaded).path(), 'utf8'))), before);
  await p.locator('#retrySave').evaluate(button => button.click());
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  assert.deepEqual(contents(await data(p)), before);
  await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled);
  assert.equal(await p.locator('#practiceSet').isVisible(), false);
  assert.notEqual(await p.locator('#wordSource').textContent(), 'Unrecorded practice');
  assert.equal(await p.evaluate(() => localStorage.getItem('typist-typing-sentinel')), 'keep');
  assert.deepEqual(contents(await data(p)), before);
});

test('adding deduplicates, replaces all buffered words, and supports removal/reset on narrow screens', async t => {
  const p = await page(t, {width: 390, height: 844}); await hardWords(p);
  const before = contents(await data(p));
  await p.getByRole('button', {name: 'Add practice to practice set', exact: true}).focus();
  await p.keyboard.press('Enter'); await preview(p, ['practice']);
  await p.keyboard.press('Enter'); assert.equal(await p.locator('#practiceWords button').count(), 1);
  await p.locator('#streamInput').focus(); await p.keyboard.type('partial');
  await p.getByRole('button', {name: 'Add rhythm to practice set', exact: true}).click();
  assert.equal(await p.locator('#practiceWords button').count(), 2);
  assert.equal(await p.locator('#streamText .correct, #streamText .error').count(), 0);
  const seen = new Set();
  for (let n = 0; n < 25; n++) { await preview(p, ['practice', 'rhythm']); seen.add(await word(p)); }
  assert.equal(seen.size, 2);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await p.waitForFunction(() => {
    const word = document.querySelector('.stream-upcoming-word').getBoundingClientRect();
    const surface = document.getElementById('streamSurface').getBoundingClientRect();
    return word.left >= surface.left && word.left < surface.right;
  });
  await p.screenshot({path: '/private/tmp/typist-practice-narrow.png', fullPage: true});
  await p.getByRole('button', {name: 'Remove practice from practice set'}).focus(); await p.keyboard.press('Space');
  await preview(p, ['rhythm']);
  // Selecting a row replaces an existing set, rather than adding to it.
  await p.getByRole('button', {name: 'Practice practice only', exact: true}).click(); await preview(p, ['practice']);
  await p.getByRole('button', {name: 'Remove practice from practice set'}).click();
  assert.equal(await p.locator('#practiceSet').isVisible(), false);
  await p.getByRole('button', {name: 'Practice rhythm only', exact: true}).click();
  await p.locator('#streamInput').focus(); await p.keyboard.type('partial');
  await p.locator('#clearPractice').focus(); await p.keyboard.press('Enter');
  assert.equal(await p.locator('#practiceSet').isVisible(), false);
  assert.equal(await p.locator('#streamText .correct, #streamText .error').count(), 0);
  assert.notEqual(await p.locator('#wordSource').textContent(), 'Unrecorded practice');
  assert.deepEqual(contents(await data(p)), before);
  await word(p); assert.equal((await data(p)).totals.attempts, before.totals.attempts + 1);
});

for (const failure of [false, true]) test(`entering practice preserves a normal ${failure ? 'failed save for retry' : 'in-flight save'}`, async t => {
  const p = await page(t); await hardWords(p);
  const original = (await data(p)).totals.attempts;
  await p.evaluate(async failure => {
    const {StreamStore} = await import('/src/stream/storage.js'); const save = StreamStore.prototype.save;
    const gate = new Promise(resolve => { window.finishSave = resolve; });
    StreamStore.prototype.save = async function(record) {
      if (failure) throw new Error('Practice test save failure');
      await gate; return save.call(this, record);
    };
    window.restoreSave = () => { StreamStore.prototype.save = save; };
  }, failure);
  await p.locator('#streamInput').focus(); await p.keyboard.type('normal ');
  await p.waitForFunction(() => document.getElementById('saveState').textContent.includes('1 word'));
  await p.getByRole('button', {name: 'Practice practice only', exact: true}).click();
  for (let n = 0; n < 8; n++) { await p.keyboard.type('practice '); await preview(p, ['practice']); }
  assert.equal((await data(p)).totals.attempts, original);
  assert.equal(await p.locator('#allWords').textContent(), String(original + 1));
  assert.equal(await p.locator('#recentWords .recent-result').count(), 1);
  assert.equal(await p.locator('#exportStream').isDisabled(), true);
  if (failure) {
    await p.locator('#storageAlert').waitFor({state: 'visible'});
    await p.evaluate(() => window.restoreSave()); await p.locator('#retrySave').click();
  } else await p.evaluate(() => window.finishSave());
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  const saved = await data(p); assert.equal(saved.totals.attempts, original + 1);
  assert.equal(saved.attempts.filter(record => record.typed === 'normal').length, 1);
  await preview(p, ['practice']);
  for (let n = 0; n < 3; n++) await word(p);
  assert.deepEqual(contents(await data(p)), contents(saved));
});

test('difficulty focus live probabilities, keyboard controls and persistence preserve the active stream', async t => {
  const p = await page(t); await p.addInitScript(() => { Math.random = () => .95; }); await hardWords(p);
  assert.equal(await p.locator('#previewFocus').count(), 0);
  const focusBox = await p.locator('#focusControl').boundingBox();
  const statBox = await p.locator('#todayWords').boundingBox();
  assert.ok(Math.abs(focusBox.y - statBox.y) < 30);
  assert.ok(focusBox.height < 70);
  await p.screenshot({path: '/tmp/typist-focus-compact.png', fullPage: true});
  const before = contents(await data(p));
  await p.locator('#streamInput').focus();
  const expected = await p.locator('#currentWordAccessible').textContent();
  await p.keyboard.type(expected[0]);
  const track = await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform}));
  await p.locator('#difficultyFocus').focus();
  assert.equal(await p.locator('#focusPreview').isVisible(), true);
  await p.keyboard.press('Home');
  const low = await p.locator('#focusRanks').textContent();
  await p.keyboard.press('End');
  assert.equal(await p.locator('#difficultyFocus').inputValue(), '100');
  assert.notEqual(await p.locator('#focusRanks').textContent(), low);
  assert.match(await p.locator('#focusRanks').textContent(), /#1 practice · \d+\.\d{2}%/);
  assert.match(await p.locator('#focusDiscovery').textContent(), /Unseen words:/);
  const exact = await p.evaluate(async () => {
    const {wordProbabilities} = await import('/src/stream/model.js'); const {WORDS} = await import('/src/stream/words.js');
    const {StreamStore} = await import('/src/stream/storage.js'); const store = await StreamStore.open(); const history = await store.load(); store.db.close();
    const d = wordProbabilities(WORDS, new Map(history.words.map(row => [row.word, row])), [], 100);
    return d.ranked.map(row => `#${row.rank} ${row.word} · ${(row.probability * 100).toFixed(2)}%`);
  });
  const labels = await p.locator('#focusRanks li').allTextContents();
  exact.forEach((label, i) => assert.ok(labels[i].startsWith(label)));
  await p.screenshot({path: '/tmp/typist-focus-desktop.png', fullPage: true});
  assert.deepEqual(await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform})), track);
  assert.deepEqual(contents(await data(p)), before);
  await p.keyboard.press('ArrowLeft'); assert.equal(await p.locator('#difficultyFocus').inputValue(), '99');
  await p.keyboard.press('Escape'); assert.equal(await p.locator('#focusPreview').isVisible(), false);
  await p.locator('#streamInput').focus(); await p.keyboard.type(expected.slice(1)); await p.keyboard.press('Space');
  await p.waitForFunction(() => document.getElementById('saveState').textContent === 'All words saved');
  const after = await data(p); const recorded = after.attempts.find(row => !before.attempts.some(old => old.id === row.id)); assert.equal(recorded.typed, expected); assert.notEqual(recorded.executionMs, null);
  await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled);
  assert.equal(await p.locator('#difficultyFocus').inputValue(), '99');
  await p.locator('#focusControl').hover(); assert.equal(await p.locator('#focusPreview').isVisible(), true);
  await p.locator('#difficultyFocus').click();
  assert.equal(await p.locator('#difficultyFocus').evaluate(node => node === document.activeElement), true);
  await p.locator('#focusPlot').hover(); assert.equal(await p.locator('#focusPreview').isVisible(), true);
  await p.locator('h1').hover(); assert.equal(await p.locator('#focusPreview').isVisible(), false);
  await p.keyboard.press('ArrowLeft'); assert.equal(await p.locator('#focusPreview').isVisible(), true);
});

test('touch preview pins and dismisses on narrow screens; practice override disables focus without data', async t => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true}); t.after(() => context.close());
  const p = await context.newPage(); await p.addInitScript(() => { Math.random = () => .95; }); await p.goto(origin + '/stream.html');
  await p.waitForFunction(() => !document.getElementById('streamInput').disabled); await hardWords(p);
  const before = contents(await data(p));
  await p.locator('#difficultyFocus').tap(); assert.equal(await p.locator('#focusPreview').isVisible(), true);
  await p.locator('#difficultyFocus').evaluate(node => { node.value = 100; node.dispatchEvent(new Event('input', {bubbles: true})); });
  const bounds = await p.locator('#focusPreview').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await p.screenshot({path: '/tmp/typist-focus-mobile.png', fullPage: true});
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => [e.tagName, e.id, e.className, e.getBoundingClientRect().right]))));
  await p.locator('#closeFocus').tap(); assert.equal(await p.locator('#focusPreview').isVisible(), false);
  await p.locator('label[for="difficultyFocus"]').tap(); await p.locator('h1').tap(); assert.equal(await p.locator('#focusPreview').isVisible(), false);
  await p.getByRole('button', {name: 'Practice practice only', exact: true}).click();
  assert.equal(await p.locator('#difficultyFocus').isDisabled(), true);
  assert.match(await p.locator('#focusStatus').textContent(), /Inactive/);
  await word(p); await preview(p, ['practice']); assert.deepEqual(contents(await data(p)), before);
  await p.locator('#clearPractice').click(); assert.equal(await p.locator('#difficultyFocus').isDisabled(), false);
  assert.equal(await p.locator('#difficultyFocus').inputValue(), '100');
});


test('probability plot spreads difficulty ranks logarithmically with readable ticks', async t => {
  const p = await page(t);
  await p.evaluate(async () => {
    const {StreamStore} = await import('/src/stream/storage.js');
    const {WORDS} = await import('/src/stream/words.js');
    const {WordAttempt} = await import('/src/stream/model.js');
    const store = await StreamStore.open();
    for (const word of WORDS.slice(0, 100)) for (let i = 0; i < 3; i++) {
      const attempt = new WordAttempt({word, source: 'broad'}, 'test'); attempt.key('x', 0);
      await store.save({...attempt.key(' ', 100), id: `log-${word}-${i}`});
    }
    store.db.close();
  });
  await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled);
  await p.locator('#difficultyFocus').focus();
  const points = await p.locator('#focusPlot circle').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('cx'))));
  assert.equal(points.length, 100);
  assert.equal(points[0], 52); assert.equal(points[99], 400);
  assert.ok(Math.abs(points[9] - 226) < .001); // Rank 10 is halfway from 1 to 100.
  assert.ok(points[1] - points[0] > 40);
  assert.deepEqual(await p.locator('#focusPlot text[y="153"]').allTextContents(), ['1', '2', '5', '10', '20', '50', '100']);
  assert.match(await p.locator('#focusPlot').textContent(), /log scale/);
  await p.screenshot({path: '/tmp/typist-log-desktop.png', fullPage: true});
  await p.setViewportSize({width: 390, height: 844});
  await p.locator('#difficultyFocus').focus();
  await p.screenshot({path: '/tmp/typist-log-mobile.png', fullPage: true});
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});


test('preview shows the distribution before cooldown while actual sampling keeps exclusions', async t => {
  const p = await page(t);
  const result = await p.evaluate(async () => {
    const {wordProbabilities, chooseWord} = await import('/src/stream/model.js');
    const {createFocusControl} = await import('/src/stream/focus.js');
    const summaries = new Map(['alpha', 'beta', 'gamma'].map(word => [word, {attempts: 3, recent: [{clean: false}, {clean: false}, {clean: false}]}]));
    const vocabulary = ['alpha', 'beta', 'gamma', 'unseen'];
    const actual = wordProbabilities(vocabulary, summaries, ['beta'], 50);
    const preview = wordProbabilities(vocabulary, summaries, [], 50);
    createFocusControl(document.getElementById('focusControl'), 50, () => {})(preview, false);
    const draws = Array.from({length: 1000}, (_, i) => chooseWord(vocabulary, summaries, ['beta'], () => i / 1000, 50).word);
    return {actual: actual.ranked, preview: preview.ranked, draws};
  });
  assert.equal(result.actual[1].word, 'beta'); assert.equal(result.actual[1].probability, 0);
  assert.ok(result.preview.every(row => row.probability > 0));
  assert.ok(result.preview[0].probability > result.preview[1].probability && result.preview[1].probability > result.preview[2].probability);
  assert.equal(result.draws.includes('beta'), false);
  await p.locator('#difficultyFocus').focus();
  assert.match(await p.locator('#focusPreview').textContent(), /before cooldown/);
  assert.equal(await p.locator('#focusCooldown, .focus-cooldown').count(), 0);
  const curve = await p.locator('#focusPlot .focus-curve').getAttribute('d');
  assert.equal((curve.match(/M/g) || []).length, 1); assert.equal((curve.match(/L/g) || []).length, 2);
  assert.match(await p.locator('#focusRanks li').nth(1).textContent(), new RegExp(`#2 beta · ${(result.preview[1].probability * 100).toFixed(2)}%`));
  await p.locator('#focusPreview').screenshot({path: '/tmp/typist-before-cooldown.png'});
});

async function cloudReady(p) {
  await p.waitForFunction(() => document.getElementById('hardWordCloud').getAttribute('aria-busy') === 'false' && !document.getElementById('hardWordCloud').dataset.pending);
}
async function seedCloud(p, count = 2) {
  await p.evaluate(async count => {
    const {StreamStore} = await import('/src/stream/storage.js');
    const {WordAttempt} = await import('/src/stream/model.js');
    const {WORDS} = await import('/src/stream/words.js');
    const store = await StreamStore.open();
    const words = count === 2 ? ['practice', 'rhythm', 'the'] : WORDS.slice(0, count);
    for (const word of words) for (let i = 0; i < (word === 'the' && count === 2 ? 2 : 3); i++) {
      const attempt = new WordAttempt({word, source: 'broad'}, 'test');
      // One clean attempt gives rhythm a lower supported-trouble score.
      if (word === 'rhythm' && i === 2) [...word].forEach((key, i) => attempt.key(key, i * 100));
      else attempt.key('x', 0);
      const record = attempt.key(' ', word.length * 100);
      await store.save({...record, id: `cloud-${word}-${i}`});
    }
    store.db.close();
  }, count);
  await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled); await cloudReady(p);
}
async function cloudClean(p, word, count) {
  await p.evaluate(async ({word, count}) => {
    const {StreamStore} = await import('/src/stream/storage.js'); const {WordAttempt} = await import('/src/stream/model.js');
    const store = await StreamStore.open();
    for (let i = 0; i < count; i++) {
      const attempt = new WordAttempt({word, source: 'broad'}, 'test');
      [...word].forEach((key, i) => attempt.key(key, i * 100));
      await store.save({...attempt.key(' ', word.length * 100), id: crypto.randomUUID()});
    }
    store.db.close(); document.getElementById('retrySave').click();
  }, {word, count});
}

test('word cloud updates live with animated entry, stable identities, rank resizing and removal', async t => {
  const p = await page(t);
  assert.equal(await p.locator('#hardWordCloud').isVisible(), false);
  await p.addInitScript(() => { Math.random = () => .3000001; }); await seedCloud(p);
  assert.equal(await p.locator('#currentWordAccessible').textContent(), 'the');
  const cloud = p.locator('#hardWordCloud');
  assert.ok((await cloud.boundingBox()).y < (await p.locator('#wordList').boundingBox()).y);
  assert.equal(await cloud.locator('text').count(), 2);
  const sizes = await cloud.locator('text').evaluateAll(nodes => nodes.map(node => [node.dataset.word, parseFloat(node.style.fontSize)]));
  assert.ok(sizes.find(row => row[0] === 'practice')[1] > sizes.find(row => row[0] === 'rhythm')[1]);
  await p.evaluate(() => { window.cloudPractice = document.querySelector('#hardWordCloud text[data-word="practice"]'); });
  await word(p); // Third recorded attempt makes 'the' eligible immediately.
  await p.waitForFunction(() => Boolean(document.querySelector('#hardWordCloud text[data-word="the"]')));
  const entering = await cloud.locator('text[data-word="the"]').evaluate(node => ({size: parseFloat(getComputedStyle(node).fontSize), transition: Boolean(node.__transition)}));
  assert.equal(entering.transition, true);
  await cloudReady(p);
  assert.ok(parseFloat(await cloud.locator('text[data-word="the"]').evaluate(node => node.style.fontSize)) > entering.size);
  assert.equal(await p.evaluate(() => window.cloudPractice === document.querySelector('#hardWordCloud text[data-word="practice"]')), true);
  const stable = await cloud.locator('svg').innerHTML();
  await p.locator('#wordFilter').selectOption('all'); await cloudReady(p);
  assert.equal(await cloud.locator('svg').innerHTML(), stable);
  const beforeSize = await cloud.locator('text[data-word="practice"]').evaluate(node => parseFloat(node.style.fontSize));
  await cloudClean(p, 'practice', 6);
  await p.waitForFunction(() => document.querySelector('#hardWordCloud text[data-word="practice"]')?.dataset.rank === '3');
  const intermediate = await cloud.locator('text[data-word="practice"]').evaluate(node => ({size: parseFloat(getComputedStyle(node).fontSize), transition: Boolean(node.__transition)}));
  assert.equal(intermediate.transition, true);
  await cloudReady(p);
  const finalSize = await cloud.locator('text[data-word="practice"]').evaluate(node => parseFloat(node.style.fontSize));
  assert.ok(finalSize < beforeSize); assert.ok(intermediate.size > finalSize);
  assert.equal(await p.evaluate(() => window.cloudPractice === document.querySelector('#hardWordCloud text[data-word="practice"]')), true);
  await cloudClean(p, 'practice', 20); await cloudReady(p);
  await p.waitForFunction(() => !document.querySelector('#hardWordCloud text[data-word="practice"]'));
  assert.equal(await cloud.locator('text').count(), 2);
  const unchanged = await cloud.locator('svg').innerHTML();
  await p.getByRole('button', {name: 'Practice rhythm only', exact: true}).click();
  for (let i = 0; i < 4; i++) await word(p, true);
  assert.equal(await cloud.locator('svg').innerHTML(), unchanged);
  await cloud.screenshot({path: '/tmp/typist-cloud-live.png'});
  await p.locator('#clearPractice').click();
  await cloudClean(p, 'rhythm', 20); await cloudReady(p);
  assert.equal(await cloud.locator('text').count(), 1);
  assert.equal(await cloud.locator('text').getAttribute('data-word'), 'the');
  await cloudClean(p, 'the', 20);
  await cloud.waitFor({state: 'hidden'});
  assert.equal(await cloud.locator('text').count(), 0);
});

test('dense word cloud is bounded and readable on desktop/mobile, and reduced motion skips transitions', async t => {
  const p = await page(t); await p.emulateMedia({reducedMotion: 'reduce'}); await seedCloud(p, 100);
  const cloud = p.locator('#hardWordCloud');
  const check = async cap => {
    await cloudReady(p);
    const words = await cloud.locator('text').evaluateAll(nodes => nodes.map(node => ({word: node.dataset.word, rank: Number(node.dataset.rank), size: parseFloat(node.style.fontSize), transition: Boolean(node.__transition), box: node.getBoundingClientRect().toJSON()})));
    assert.ok(words.length >= Math.floor(cap * .7) && words.length <= cap, String(words.length));
    assert.ok(words.some(word => word.rank === 1));
    assert.ok(words.every(word => word.size >= 9 && !word.transition));
    const bounds = await cloud.locator('svg').boundingBox();
    assert.ok(words.every(word => word.box.x >= bounds.x - 1 && word.box.y >= bounds.y - 1 && word.box.right <= bounds.x + bounds.width + 1 && word.box.bottom <= bounds.y + bounds.height + 1));
    const rankSizes = [...words].sort((a, b) => a.rank - b.rank).map(word => word.size);
    assert.ok(rankSizes[0] > rankSizes.at(-1));
    assert.match(await cloud.locator('figcaption').textContent(), /of 100/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  };
  await check(48); await cloud.screenshot({path: '/tmp/typist-cloud-desktop.png'});
  await p.setViewportSize({width: 390, height: 844});
  await p.waitForFunction(() => Number(document.querySelector('#hardWordCloud svg').getAttribute('viewBox').split(' ')[2]) < 500);
  await check(24); await cloud.screenshot({path: '/tmp/typist-cloud-mobile.png'});
  const before = await cloud.locator('text').count();
  await cloudClean(p, 'the', 20); await p.waitForFunction(() => !document.querySelector('#hardWordCloud text[data-word="the"]'));
  await cloudReady(p); assert.ok(await cloud.locator('text').count() <= before);
});


test('cloud anchors survive reloads and rank changes without repacking the whole view', async t => {
  const p = await page(t); await seedCloud(p, 30);
  const snapshot = () => p.locator('#hardWordCloud text').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.word, {x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')), size: parseFloat(node.style.fontSize)}])));
  const reload = async () => {
    await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled); await cloudReady(p);
  };
  const before = await snapshot();
  for (let i = 0; i < 3; i++) { await reload(); assert.deepEqual(await snapshot(), before); }
  await cloudClean(p, 'about', 1);
  await p.waitForFunction(() => document.querySelector('#hardWordCloud text[data-word="about"]')?.dataset.rank === '30'); await cloudReady(p);
  const changed = await snapshot();
  assert.deepEqual(Object.keys(changed).sort(), Object.keys(before).sort());
  assert.ok(changed.about.size < before.about.size);
  assert.deepEqual([changed.about.x, changed.about.y], [before.about.x, before.about.y]);
  const distances = Object.keys(before).map(word => Math.hypot(changed[word].x - before[word].x, changed[word].y - before[word].y)).sort((a, b) => a - b);
  // The previous full repack moved most words by hundreds of pixels.
  assert.ok(distances[15] < 20, JSON.stringify(distances));
  // Larger headline fonts can require one local collision adjustment.
  assert.ok(distances.filter(distance => distance < 65).length >= distances.length * .9, JSON.stringify(distances));
  assert.ok(distances.at(-1) < 170, JSON.stringify(distances));
  const overlappingPixels = await p.evaluate(() => {
    const svg = document.querySelector('#hardWordCloud svg');
    const [, , width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.textAlign = 'center';
    const occupied = new Uint8Array(width * height); let overlaps = 0;
    for (const node of svg.querySelectorAll('text')) {
      context.clearRect(0, 0, width, height);
      const style = getComputedStyle(node);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      context.fillText(node.firstChild.nodeValue, Number(node.getAttribute('x')), Number(node.getAttribute('y')));
      const pixels = context.getImageData(0, 0, width, height).data;
      for (let i = 0; i < occupied.length; i++) if (pixels[i * 4 + 3] > 128) { overlaps += occupied[i]; occupied[i] = 1; }
    }
    return overlaps;
  });
  assert.equal(overlappingPixels, 0);
  for (let i = 0; i < 2; i++) { await reload(); assert.deepEqual(await snapshot(), changed); }
  await p.locator('#hardWordCloud').screenshot({path: '/tmp/typist-cloud-stable.png'});
  await p.setViewportSize({width: 390, height: 844});
  await p.waitForFunction(() => Number(document.querySelector('#hardWordCloud svg').getAttribute('viewBox').split(' ')[2]) < 500); await cloudReady(p);
  const mobile = await snapshot(); await reload(); assert.deepEqual(await snapshot(), mobile);
  await p.setViewportSize({width: 1280, height: 900});
  await p.waitForFunction(() => Number(document.querySelector('#hardWordCloud svg').getAttribute('viewBox').split(' ')[2]) > 500); await cloudReady(p);
  assert.deepEqual(await snapshot(), changed);
  const cache = await p.evaluate(() => JSON.parse(sessionStorage.getItem('typist-stream-cloud-layout-v1')));
  assert.ok(cache.layouts.length <= 3 && cache.layouts.every(([, words]) => words.length <= 48));
  // Denied visual storage must still allow deterministic cloud rendering.
  await p.addInitScript(() => Object.defineProperty(window, 'sessionStorage', {get() { throw new Error('denied'); }}));
  await reload(); const withoutStorage = await snapshot();
  await reload(); assert.deepEqual(await snapshot(), withoutStorage);
});

test('difficulty focus animates cloud prominence from the same probability curve while preserving the stream', async t => {
  const p = await page(t); await seedCloud(p, 30);
  const cloud = p.locator('#hardWordCloud');
  const snapshot = () => cloud.locator('text').evaluateAll(nodes => nodes.map(node => ({word: node.dataset.word, rank: Number(node.dataset.rank), probability: Number(node.dataset.probability), size: parseFloat(node.style.fontSize)})).sort((a, b) => a.rank - b.rank));
  const balanced = await snapshot();
  const saved = contents(await data(p));
  await p.locator('#streamInput').focus();
  const current = await p.locator('#currentWordAccessible').textContent(); await p.keyboard.type(current[0]);
  const track = await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform}));
  await p.evaluate(() => { window.probabilityCloudWord = document.querySelector('#hardWordCloud text[data-rank="1"]'); });
  await p.locator('#difficultyFocus').focus(); await p.keyboard.press('Home'); await cloudReady(p);
  const low = await snapshot(); assert.equal(new Set(low.map(word => word.size)).size, 1);
  await cloud.screenshot({path: '/tmp/typist-cloud-focus-low.png'});
  await p.keyboard.press('End');
  await p.waitForFunction(() => Number(document.querySelector('#hardWordCloud text[data-rank="1"]')?.dataset.probability) > .2);
  assert.equal(await cloud.locator('text[data-rank="1"]').evaluate(node => Boolean(node.__transition)), true);
  await cloudReady(p); const high = await snapshot();
  assert.ok(low[0].size < balanced[0].size && balanced[0].size < high[0].size);
  assert.ok(low.at(-1).size > high.at(-1).size);
  const labels = await p.locator('#focusRanks li').allTextContents();
  for (const row of high) {
    assert.ok(labels[row.rank - 1].startsWith(`#${row.rank} ${row.word} · ${(row.probability * 100).toFixed(2)}%`));
  }
  assert.match(await cloud.locator('text[data-rank="1"] title').textContent(), new RegExp(`${(high[0].probability * 100).toFixed(2)}% before cooldown`));
  assert.equal(await p.evaluate(() => window.probabilityCloudWord === document.querySelector('#hardWordCloud text[data-rank="1"]')), true);
  assert.deepEqual(await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform})), track);
  assert.deepEqual(contents(await data(p)), saved);
  await cloud.screenshot({path: '/tmp/typist-cloud-focus-high.png'});
  await p.reload(); await p.waitForFunction(() => !document.getElementById('streamInput').disabled); await cloudReady(p);
  assert.deepEqual(await snapshot(), high);
  await p.setViewportSize({width: 390, height: 844});
  await p.waitForFunction(() => Number(document.querySelector('#hardWordCloud svg').getAttribute('viewBox').split(' ')[2]) < 500); await cloudReady(p);
  const narrow = await snapshot(); assert.ok(narrow[0].size > narrow.at(-1).size);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await cloud.screenshot({path: '/tmp/typist-cloud-focus-mobile.png'});
  await p.emulateMedia({reducedMotion: 'reduce'}); await cloudReady(p);
  await p.locator('#difficultyFocus').focus(); await p.keyboard.press('Home'); await cloudReady(p);
  assert.equal(new Set((await snapshot()).map(word => word.size)).size, 1);
  assert.equal(await cloud.locator('text').evaluateAll(nodes => nodes.some(node => Boolean(node.__transition))), false);
  assert.deepEqual(contents(await data(p)), saved);
});

test('held-pointer slider dragging visibly grows the head and shrinks the tail before release', async t => {
  const p = await page(t); await seedCloud(p, 30);
  const cloud = p.locator('#hardWordCloud');
  await p.locator('#difficultyFocus').focus(); await p.keyboard.press('Home'); await cloudReady(p);
  const low = await cloud.locator('text[data-rank="30"]').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  const snapshot = async () => ({
    head: await cloud.locator('text[data-rank="1"]').evaluate(node => parseFloat(getComputedStyle(node).fontSize)),
    tail: await cloud.locator('text[data-rank="30"]').evaluate(node => parseFloat(getComputedStyle(node).fontSize)),
  });
  const history = contents(await data(p));
  await p.locator('#streamInput').focus(); await p.keyboard.type('p');
  const track = await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform}));
  await p.evaluate(() => {
    window.cloudDragHeld = false;
    document.getElementById('difficultyFocus').addEventListener('pointerdown', () => { window.cloudDragHeld = true; });
    document.addEventListener('pointerup', () => { window.cloudDragHeld = false; });
  });
  const box = await p.locator('#difficultyFocus').boundingBox();
  const point = fraction => ({x: box.x + 8 + (box.width - 16) * fraction, y: box.y + box.height / 2});
  const start = point(0); await p.mouse.move(start.x, start.y); await p.mouse.down();
  try {
    const quarter = point(.25); await p.mouse.move(quarter.x, quarter.y, {steps: 8});
    await p.waitForFunction(low => {
      const head = document.querySelector('#hardWordCloud text[data-rank="1"]');
      const tail = document.querySelector('#hardWordCloud text[data-rank="30"]');
      return parseFloat(getComputedStyle(head).fontSize) > low * 1.4 && parseFloat(getComputedStyle(tail).fontSize) < low * .98;
    }, low);
    assert.equal(await p.evaluate(() => window.cloudDragHeld), true);
    const first = await snapshot();
    const high = point(.9); await p.mouse.move(high.x, high.y, {steps: 12});
    await p.waitForFunction(first => {
      const head = document.querySelector('#hardWordCloud text[data-rank="1"]');
      const tail = document.querySelector('#hardWordCloud text[data-rank="30"]');
      return parseFloat(getComputedStyle(head).fontSize) > first.head * 1.05 && parseFloat(getComputedStyle(tail).fontSize) < first.tail * .85;
    }, first);
    assert.equal(await p.evaluate(() => window.cloudDragHeld), true);
    await cloudReady(p); const strong = await snapshot();
    assert.ok(strong.tail < low * .6); assert.ok(strong.head / strong.tail > 4);
    // Several reversals must leave the cloud on the latest input, not stale work.
    for (const fraction of [.1, .85, .35]) { const next = point(fraction); await p.mouse.move(next.x, next.y, {steps: 4}); }
    await cloudReady(p);
    assert.equal(await p.evaluate(() => window.cloudDragHeld), true);
    const labels = await p.locator('#focusRanks li').allTextContents();
    const shown = await cloud.locator('text').evaluateAll(nodes => nodes.map(node => ({word: node.dataset.word, rank: Number(node.dataset.rank), p: Number(node.dataset.probability)})));
    for (const row of shown) assert.ok(labels[row.rank - 1].startsWith(`#${row.rank} ${row.word} · ${(row.p * 100).toFixed(2)}%`));
    assert.deepEqual(await p.locator('#streamText').evaluate(node => ({html: node.innerHTML, transform: node.style.transform})), track);
    assert.deepEqual(contents(await data(p)), history);
  } finally { await p.mouse.up(); }
  await p.locator('#difficultyFocus').focus(); await p.keyboard.press('Home'); await cloudReady(p);
  await cloud.screenshot({path: '/tmp/typist-cloud-contrast-low.png'});
  await p.keyboard.press('End'); await cloudReady(p);
  await cloud.screenshot({path: '/tmp/typist-cloud-contrast-high.png'});
});
