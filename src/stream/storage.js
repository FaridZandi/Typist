import {addTotals, addWord, emptyTotals, RULES_VERSION} from './model.js';

export const DATABASE = 'typist-word-stream';
export const MAX_ATTEMPTS = 10000;
export const RETENTION_DAYS = 30;
const DAY_MS = 86400000;
const request = operation => new Promise((resolve, reject) => { operation.onsuccess = () => resolve(operation.result); operation.onerror = () => reject(operation.error); });
const finished = transaction => new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error || new Error('Storage transaction aborted')); transaction.onerror = () => {}; });
export const dayKey = timestamp => { const date = new Date(timestamp); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export class StreamStore {
  static async open() {
    if (!globalThis.indexedDB) throw new Error('This browser does not provide IndexedDB.');
    const operation = indexedDB.open(DATABASE, 1);
    operation.onupgradeneeded = () => {
      const db = operation.result;
      db.createObjectStore('words', {keyPath: 'word'});
      db.createObjectStore('attempts', {keyPath: 'id'}).createIndex('at', 'at');
      db.createObjectStore('days', {keyPath: 'day'});
      db.createObjectStore('meta', {keyPath: 'key'});
    };
    const db = await new Promise((resolve, reject) => {
      operation.onsuccess = () => resolve(operation.result);
      operation.onerror = () => reject(operation.error);
      operation.onblocked = () => reject(new Error('Close other stream tabs to upgrade storage.'));
    });
    db.onversionchange = () => db.close();
    const store = new StreamStore(db);
    await store.trim();
    return store;
  }
  constructor(db) { this.db = db; }
  async transaction(stores, mode, work) {
    const transaction = this.db.transaction(stores, mode);
    const completion = finished(transaction);
    try { const result = await work(transaction); await completion; return result; }
    catch (error) { try { transaction.abort(); } catch {} await completion.catch(() => {}); throw error; }
  }
  async load() {
    return this.transaction(['words', 'days', 'meta', 'attempts'], 'readonly', async tx => {
      const [words, days, meta, count] = await Promise.all([request(tx.objectStore('words').getAll()), request(tx.objectStore('days').getAll()), request(tx.objectStore('meta').get('totals')), request(tx.objectStore('attempts').count())]);
      return {words, days, totals: meta?.value || emptyTotals(), count};
    });
  }
  async save(attempt) {
    return this.transaction(['words', 'days', 'meta', 'attempts'], 'readwrite', async tx => {
      const attempts = tx.objectStore('attempts');
      if (await request(attempts.get(attempt.id))) return;
      const words = tx.objectStore('words'); const days = tx.objectStore('days'); const meta = tx.objectStore('meta');
      const day = dayKey(attempt.at);
      const [word, today, all] = await Promise.all([request(words.get(attempt.word)), request(days.get(day)), request(meta.get('totals'))]);
      attempts.add(attempt);
      words.put(addWord(word, attempt));
      days.put({day, ...addTotals(today || emptyTotals(), attempt)});
      meta.put({key: 'totals', value: addTotals(all?.value || emptyTotals(), attempt)});
    });
  }
  async trim(now = Date.now()) {
    return this.transaction(['attempts', 'days'], 'readwrite', async tx => {
      const attempts = tx.objectStore('attempts');
      const count = await request(attempts.count());
      let excess = Math.max(0, count - MAX_ATTEMPTS);
      await new Promise((resolve, reject) => {
        const cursor = attempts.index('at').openCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => { const item = cursor.result; if (!item) { resolve(); return; } if (excess > 0 || item.value.at < now - RETENTION_DAYS * DAY_MS) { item.delete(); if (excess > 0) excess--; item.continue(); } else resolve(); };
      });
      const days = tx.objectStore('days'); const keys = await request(days.getAllKeys());
      const cutoff = dayKey(now - 364 * DAY_MS);
      keys.forEach((day, index) => { if (day < cutoff || index < keys.length - 365) days.delete(day); });
    });
  }
  async export() {
    await this.trim();
    return this.transaction(['words', 'days', 'meta', 'attempts'], 'readonly', async tx => {
      const [words, days, meta, attempts] = await Promise.all(['words', 'days', 'meta', 'attempts'].map(name => request(tx.objectStore(name).getAll())));
      return {format: 'typist-word-stream', version: RULES_VERSION, exportedAt: new Date().toISOString(), words, days, totals: meta.find(item => item.key === 'totals')?.value || emptyTotals(), attempts};
    });
  }
  async restore(data) {
    validateBackup(data);
    await this.transaction(['words', 'days', 'meta', 'attempts'], 'readwrite', async tx => {
      for (const name of ['words', 'days', 'meta', 'attempts']) tx.objectStore(name).clear();
      for (const word of data.words) tx.objectStore('words').put(word);
      for (const day of data.days) tx.objectStore('days').put(day);
      for (const attempt of data.attempts) tx.objectStore('attempts').put(attempt);
      tx.objectStore('meta').put({key: 'totals', value: data.totals});
    });
    await this.trim();
  }
}

export function validateBackup(data) {
  const fail = () => { throw new Error('Invalid stream backup. Existing history has not been changed.'); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const number = value => Number.isFinite(value) && value >= 0 && value <= 1e15;
  const integer = value => number(value) && Number.isInteger(value);
  const timestamp = value => number(value) && value <= 4102444800000;
  const spelling = value => typeof value === 'string' && /^[a-z]{1,64}$/.test(value);
  const source = value => ['broad', 'targeted'].includes(value);
  const counts = value => {
    if (!object(value) || ['attempts', 'clean', 'broad', 'broadClean', 'targeted', 'targetedClean'].some(key => !integer(value[key]))) fail();
    if (value.clean > value.attempts || value.broadClean > value.broad || value.targetedClean > value.targeted || value.broad + value.targeted !== value.attempts || value.broadClean + value.targetedClean !== value.clean) fail();
  };
  const totals = value => { counts(value); if (!integer(value.characters) || !number(value.activeMs)) fail(); };
  if (!object(data) || data.format !== 'typist-word-stream' || data.version !== RULES_VERSION) fail();
  if (!Array.isArray(data.words) || data.words.length > 10000 || !Array.isArray(data.days) || data.days.length > 365 || !Array.isArray(data.attempts) || data.attempts.length > MAX_ATTEMPTS) fail();
  totals(data.totals);
  const words = new Set(); let attempts = 0; let clean = 0; let broad = 0; let broadClean = 0; let characters = 0;
  for (const word of data.words) {
    counts(word);
    if (!spelling(word.word) || words.has(word.word) || !integer(word.errors) || !integer(word.corrections) || !integer(word.timed) || word.timed > word.attempts || !number(word.executionMs) || !timestamp(word.lastAt) || !Array.isArray(word.recent) || word.recent.length > Math.min(20, word.attempts)) fail();
    for (const sample of word.recent) if (!object(sample) || typeof sample.clean !== 'boolean' || !timestamp(sample.at) || !source(sample.source) || !(sample.executionMs === null || number(sample.executionMs))) fail();
    words.add(word.word); attempts += word.attempts; clean += word.clean; broad += word.broad; broadClean += word.broadClean; characters += (word.word.length + 1) * word.attempts;
  }
  if (attempts !== data.totals.attempts || clean !== data.totals.clean || broad !== data.totals.broad || broadClean !== data.totals.broadClean || characters !== data.totals.characters) fail();
  const days = new Set();
  for (const day of data.days) {
    totals(day);
    if (typeof day.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.day) || new Date(day.day).toISOString().slice(0, 10) !== day.day || days.has(day.day)) fail();
    days.add(day.day);
  }
  const ids = new Set();
  for (const attempt of data.attempts) {
    if (!object(attempt) || typeof attempt.id !== 'string' || !attempt.id || attempt.id.length > 80 || ids.has(attempt.id) || !spelling(attempt.word) || !words.has(attempt.word) || typeof attempt.typed !== 'string' || !/^[a-zA-Z]{1,64}$/.test(attempt.typed) || !timestamp(attempt.at) || typeof attempt.clean !== 'boolean' || !source(attempt.source) || !integer(attempt.errors) || !integer(attempt.remaining) || !integer(attempt.corrections) || !number(attempt.activeMs) || !(attempt.executionMs === null || number(attempt.executionMs)) || attempt.rules !== RULES_VERSION || typeof attempt.vocabulary !== 'string' || attempt.vocabulary.length > 80) fail();
    if (attempt.clean !== (attempt.errors === 0 && attempt.remaining === 0 && attempt.corrections === 0 && attempt.word === attempt.typed)) fail();
    ids.add(attempt.id);
  }
  return data;
}
