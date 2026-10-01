const PREFIXES = ['typist-', 'reaction-'];
const FORMAT = 'typist-local-data';
const VERSION = 1;

function currentData(storage) {
  return Object.fromEntries(Array.from({length: storage.length}, (_, index) => storage.key(index))
    .filter(key => key && PREFIXES.some(prefix => key.startsWith(prefix)))
    .map(key => [key, storage.getItem(key)]));
}

function download(data, document) {
  const blob = new Blob([JSON.stringify({format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `typist-history-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function installDataPortability({document = globalThis.document, window = globalThis.window} = {}) {
  const exportButton = document.querySelector('#exportPracticeData');
  const importButton = document.querySelector('#importPracticeData');
  const fileInput = document.querySelector('#importPracticeFile');
  if (!exportButton || !importButton || !fileInput) return;
  exportButton.addEventListener('click', () => download(currentData(window.localStorage), document));
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup?.format !== FORMAT || backup.version !== VERSION || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('This is not a Typist history export.');
      const entries = Object.entries(backup.data);
      if (entries.some(([key, value]) => !PREFIXES.some(prefix => key.startsWith(prefix)) || typeof value !== 'string')) throw new Error('This file does not contain valid practice records.');
      entries.forEach(([, value]) => JSON.parse(value));
      if (!window.confirm('Importing replaces the Typist data in this browser. A copy of the current data will download first. Continue?')) return;
      const previous = currentData(window.localStorage);
      download(previous, document);
      const removePracticeData = () => Array.from({length: window.localStorage.length}, (_, index) => window.localStorage.key(index))
        .filter(key => key && PREFIXES.some(prefix => key.startsWith(prefix))).forEach(key => window.localStorage.removeItem(key));
      removePracticeData();
      try { entries.forEach(([key, value]) => window.localStorage.setItem(key, value)); }
      catch (error) {
        removePracticeData();
        Object.entries(previous).forEach(([key, value]) => window.localStorage.setItem(key, value));
        throw error;
      }
      window.location.reload();
    } catch (error) {
      window.alert(`Could not import Typist data: ${error.message}`);
    }
  });
}
