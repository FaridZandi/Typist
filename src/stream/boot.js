import {WORDS, VOCABULARY_VERSION} from './words.js';
import {WordAttempt, addWord, addTotals, emptyTotals, chooseWord, troubleScore, wordProbabilities, compareDifficulty} from './model.js';
import {StreamStore, dayKey, validateBackup} from './storage.js';
import {HardWordCloud} from './cloud.js';
import {StreamRenderer} from './render.js';
import {createFocusControl, readFocus, saveFocus} from './focus.js';

const $ = id => document.getElementById(id);
const input = $('streamInput');
const renderer = new StreamRenderer($('streamText'));
const wordCloud = new HardWordCloud($('hardWordCloud'));
let store = null; let summaries = new Map(); let totals = emptyTotals(); let days = new Map();
let queue = []; let history = []; let attempt; let pending = []; let saving = false; let storageFailed = false; let restoring = false;
let saveCount = 0; let lastKey = 0; let retained = 0;
const recentDraws = [];
let practiceWords = new Set();
let preferenceStorage;
try { preferenceStorage = window.localStorage; } catch { /* Storage may be denied. */ }
let focusPreference = readFocus(preferenceStorage);
let focusPersisted = true;
const renderFocusControl = createFocusControl($('focusControl'), focusPreference, value => {
  focusPreference = value; focusPersisted = saveFocus(preferenceStorage, value); renderFocus();
});
// Preview the policy before recent-word exclusions; real draws retain cooldown.
function renderFocus() { renderFocusControl(wordProbabilities(WORDS, summaries, [], focusPreference), Boolean(practiceWords.size), focusPersisted); }
const percentage = (clean, count) => count ? `${Math.round(clean / count * 100)}%` : '—';
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };

function appendWord() {
  if (practiceWords.size) {
    const words = [...practiceWords];
    queue.push({word: words[Math.floor(Math.random() * words.length)], source: 'practice'});
    return;
  }
  const prompt = chooseWord(WORDS, summaries, recentDraws, Math.random, focusPreference); queue.push(prompt); recentDraws.push(prompt.word); if (recentDraws.length > 8) recentDraws.shift(); }
function newAttempt() { attempt = new WordAttempt(queue[0], VOCABULARY_VERSION); }
function renderPrompt() {
  renderer.render(queue[0].word, attempt.typed, queue.slice(1));
  const targeted = queue[0].source === 'targeted'; $('wordSource').textContent = practiceWords.size ? 'Unrecorded practice' : targeted ? 'Targeted repeat' : 'Broad practice'; $('wordSource').classList.toggle('targeted', targeted);
  // Announce only new words, never every keystroke.
  if ($('currentWordAccessible').textContent !== queue[0].word) $('currentWordAccessible').textContent = queue[0].word;
}

// Rebuild the entire preview on every set change; partial input belongs to the
// old selection and must never become a recorded or mixed-mode attempt.
function setPractice(words) {
  if (restoring) return;
  practiceWords = new Set(words);
  queue = []; recentDraws.length = 0;
  for (let i = 0; i < 6; i++) appendWord();
  newAttempt(); input.value = ''; renderer.reset();
  $('practiceSet').hidden = !practiceWords.size;
  $('practiceWords').replaceChildren(...[...practiceWords].map(word => {
    const remove = element('button', 'secondary-button', `${word} ×`);
    remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${word} from practice set`);
    remove.addEventListener('click', () => { setPractice([...practiceWords].filter(item => item !== word)); input.focus(); });
    return remove;
  }));
  renderPrompt(); renderSaving(); renderFocus();
  $('practiceStatus').textContent = practiceWords.size ? 'Practice set ready · attempts are not recorded' : 'Normal stream resumed';
}
$('clearPractice').addEventListener('click', () => { setPractice([]); input.focus(); });

function renderStats() {
  renderFocus();
  wordCloud.update(summaries);
  const today = days.get(dayKey(Date.now())) || emptyTotals();
  $('todayWords').textContent = today.attempts.toLocaleString(); $('todayClean').textContent = percentage(today.clean, today.attempts);
  $('allWords').textContent = totals.attempts.toLocaleString();
  const focus = [...summaries.values()].filter(word => troubleScore(word) > 0);
  $('focusCount').textContent = focus.length;
  $('broadRate').textContent = `Broad practice: ${percentage(totals.broadClean, totals.broad)} clean · ${totals.broad.toLocaleString()} words`;
  const focused = $('wordFilter').value === 'focus';
  const words = [...summaries.values()].filter(word => !focused || troubleScore(word) > 0).sort(compareDifficulty);
  const list = $('wordList'); list.replaceChildren();
  if (!words.length) list.append(element('p', 'empty-words', totals.attempts ? 'No repeated trouble yet. Keep typing; words appear here after at least three tries and two recent troubled attempts. You can also view all practiced words.' : 'Start typing. Each word builds its own history; repeated mistakes will bring it back into the stream.'));
  else {
    const header = element('div', 'word-row header'); ['Word', 'Clean / tries', 'Recent attempts', 'Avg word time'].forEach((label, i) => header.append(element('span', i === 3 ? 'word-time' : '', label))); list.append(header);
    words.forEach(word => {
      const row = element('div', 'word-row'); const rate = element('span', 'word-rate', `${word.clean} / ${word.attempts}`); rate.title = `${percentage(word.clean, word.attempts)} clean, including corrected mistakes`;
      const trail = element('div', 'word-trail'); trail.setAttribute('role', 'img'); trail.setAttribute('aria-label', `Last ${word.recent.length} attempts: ${word.recent.map(sample => sample.clean ? 'clean' : 'needed work').join(', ')}`);
      word.recent.forEach(sample => { const mark = element('i', `sample ${sample.clean ? 'clean' : 'trouble'}`); mark.title = `${new Date(sample.at).toLocaleString()} · ${sample.clean ? 'Clean' : 'Needed work'} · ${sample.source}`; trail.append(mark); });
      const timing = element('span', 'word-time', word.timed ? `${(word.executionMs / word.timed / 1000).toFixed(2)}s` : '—'); timing.title = `${word.timed} uninterrupted attempts; first letter to Space, including corrections`;
      const name = element('div', 'word-actions');
      const practice = element('button', 'word-name', word.word);
      practice.type = 'button'; practice.setAttribute('aria-label', `Practice ${word.word} only`); practice.title = 'Practice only this word · unrecorded';
      practice.addEventListener('click', () => { setPractice([word.word]); input.focus(); });
      const add = element('button', 'add-word secondary-button', 'Add');
      add.type = 'button'; add.setAttribute('aria-label', `Add ${word.word} to practice set`);
      add.addEventListener('click', () => { if (!practiceWords.has(word.word)) setPractice([...practiceWords, word.word]); });
      name.append(practice, add);
      row.append(name, rate, trail, timing); list.append(row);
    });
  }
  const dayList = [...days.values()].sort((a, b) => b.day.localeCompare(a.day)); $('historyCount').textContent = `${dayList.length} days`;
  const historyRows = dayList.slice(0, 30).map(day => { const row = element('div', 'daily-row'); const meter = element('div', 'daily-meter'); const fill = element('span'); fill.style.width = `${day.clean / day.attempts * 100}%`; meter.append(fill); row.title = `${day.broad} broad, ${day.targeted} targeted; ${Math.round(day.activeMs / 60000)} active minutes`; row.append(element('span', '', day.day), meter, element('strong', '', `${day.attempts} · ${percentage(day.clean, day.attempts)}`)); return row; });
  $('dailyHistory').replaceChildren(...historyRows); if (!dayList.length) $('dailyHistory').append(element('p', '', 'Daily totals appear as you type.'));
}

function renderSaving() {
  $('saveState').textContent = pending.length ? `${pending.length} word${pending.length === 1 ? '' : 's'} not saved yet` : store ? 'All words saved' : 'Not saved';
  input.disabled = !attempt || restoring || (!practiceWords.size && pending.length >= 200);
  $('exportStream').disabled = !store || Boolean(pending.length) || restoring; $('importStream').disabled = !store || Boolean(pending.length) || restoring;
  if (!practiceWords.size && pending.length >= 200) $('practiceStatus').textContent = 'Recover saving to continue';
}
function storageError(error) { storageFailed = true; $('storageAlert').hidden = false; $('storageError').textContent = `History could not be saved: ${error.message}. ${pending.length} completed words are held in this tab.`; renderSaving(); }
async function drain() {
  if (saving || !store || storageFailed || restoring) return;
  saving = true;
  try {
    while (pending.length) { await store.save(pending[0]); pending.shift(); saveCount++; retained++; if (saveCount % 50 === 0) { await store.trim(); retained = (await store.load()).count; } renderSaving(); }
    $('storageAlert').hidden = true;
  } catch (error) { storageError(error); }
  finally { saving = false; renderSaving(); }
}
async function openStorage() {
  try {
    store = await StreamStore.open(); const data = await store.load();
    summaries = new Map(data.words.map(word => [word.word, word])); totals = data.totals; days = new Map(data.days.map(day => [day.day, day])); retained = data.count;
    // If initial open failed, preserve practice already completed in this tab.
    for (const record of pending) applyRecord(record);
    storageFailed = false; $('storageAlert').hidden = true; renderStats(); renderSaving(); await updateStorageSize();
  } catch (error) { storageError(error); }
}
function applyRecord(record) { summaries.set(record.word, addWord(summaries.get(record.word), record)); totals = addTotals(totals, record); const day = dayKey(record.at); days.set(day, {day, ...addTotals(days.get(day), record)}); }
function complete(record) {
  renderer.commit(record.word, record.typed);
  // Never let an unrecorded outcome reach summaries, session history or saves.
  if (record.source === 'practice') {
    queue.shift(); appendWord(); newAttempt(); renderPrompt(); return;
  }
  record.id = crypto.randomUUID(); applyRecord(record); pending.push(record); history.push(record); history = history.slice(-6);
  $('recentWords').replaceChildren(...history.map(result => { const item = element('span', `recent-result${result.clean ? '' : ' trouble'}`, `${result.clean ? '✓' : '·'} ${result.word}`); item.title = `${result.typed} · ${result.corrections} corrections · ${result.errors} wrong keys · ${result.remaining} edits remaining`; if (result.corrections) item.append(element('small', '', 'corrected')); return item; }));
  queue.shift(); appendWord(); newAttempt(); renderPrompt(); renderStats(); renderSaving(); if (storageFailed) $('storageError').textContent = `Saving is unavailable. ${pending.length} completed words are held in this tab; retry before closing.`; void drain();
}

input.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat || restoring || input.disabled) return;
  if (event.key !== ' ' && event.key !== 'Backspace' && !/^[a-zA-Z]$/.test(event.key)) return;
  event.preventDefault(); lastKey = performance.now();
  const record = attempt.key(event.key, lastKey); $('practiceStatus').textContent = 'Keep your rhythm';
  if (record) complete(record); else renderPrompt();
});
// Mobile keyboards emit beforeinput without a useful keydown.
input.addEventListener('beforeinput', event => {
  event.preventDefault();
  if (restoring || input.disabled || event.isComposing) return;
  const key = event.inputType === 'deleteContentBackward' ? 'Backspace' : event.inputType === 'insertText' && event.data?.length === 1 ? event.data : null;
  if (key) { lastKey = performance.now(); const record = attempt.key(key, lastKey); if (record) complete(record); else renderPrompt(); }
});
input.addEventListener('input', () => { input.value = ''; }); input.addEventListener('paste', event => event.preventDefault());
input.addEventListener('focus', () => { $('practiceStatus').textContent = 'Type the word at the cursor'; });
input.addEventListener('blur', event => { if (!$('focusControl').contains(event.relatedTarget)) attempt?.suspend(); $('practiceStatus').textContent = 'Click the stream to continue'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) attempt?.suspend(); });
window.addEventListener('beforeunload', event => { if (pending.length || restoring) { event.preventDefault(); event.returnValue = ''; } });
$('wordFilter').addEventListener('change', renderStats);
$('retrySave').addEventListener('click', async () => { if (saving) return; store?.db.close(); store = null; await openStorage(); await drain(); if (!storageFailed) $('storageAlert').hidden = true; });

async function updateStorageSize() {
  try { const estimate = await navigator.storage?.estimate(); $('storageSize').textContent = `${retained.toLocaleString()} retained attempts · ${summaries.size} word summaries${estimate?.usage ? ` · ${(estimate.usage / 1048576).toFixed(1)} MB used by this site` : ''}. This hostname and port have their own history.`; } catch { $('storageSize').textContent = `${retained.toLocaleString()} retained attempts · ${summaries.size} word summaries.`; }
}
$('exportStream').addEventListener('click', async () => {
  try { const backup = await store.export(); const blob = new Blob([JSON.stringify(backup)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const link = element('a'); link.href = url; link.download = `typist-stream-${dayKey(Date.now())}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('dataNotice').textContent = 'Backup exported. Keep a copy outside this browser.'; } catch (error) { $('dataNotice').textContent = `Export failed: ${error.message}`; }
});
$('importStream').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  restoring = true; renderSaving(); attempt.suspend();
  try {
    if (file.size > 20 * 1048576) throw new Error('Backup exceeds the 20 MB limit.');
    const data = validateBackup(JSON.parse(await file.text()));
    if (!confirm(`Replace only your stream history with ${data.totals.attempts} words from this backup? Your typing-test history stays as it is.`)) return;
    await store.restore(data); const restored = await store.load(); summaries = new Map(restored.words.map(word => [word.word, word])); days = new Map(restored.days.map(day => [day.day, day])); totals = restored.totals; retained = restored.count;
    queue = []; recentDraws.length = 0; for (let i = 0; i < 6; i++) appendWord(); newAttempt(); history = []; renderer.reset(); $('recentWords').replaceChildren(); renderPrompt(); renderStats(); await updateStorageSize(); $('dataNotice').textContent = 'Stream history restored.';
  } catch (error) { $('dataNotice').textContent = `Restore failed: ${error.message}`; }
  finally { restoring = false; event.target.value = ''; renderSaving(); }
});
$('persistStream').addEventListener('click', async () => { try { const kept = await navigator.storage?.persist?.(); $('dataNotice').textContent = kept ? 'Persistent storage granted. Export still protects against clearing browser data.' : 'The browser did not grant persistent storage. Export a backup to keep your history safe.'; } catch (error) { $('dataNotice').textContent = error.message; } });

await openStorage();
for (let i = 0; i < 6; i++) appendWord(); newAttempt(); renderPrompt(); renderStats(); renderSaving();
$('practiceStatus').textContent = 'Click the stream and type';
setInterval(() => { if (document.activeElement === input && performance.now() - lastKey > 5000) $('practiceStatus').textContent = 'Take your time · continue whenever'; }, 2000);
