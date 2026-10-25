// Optional visual state only: tab-scoped sessionStorage survives page reloads.
// Keep a few viewport layouts so desktop/mobile resizing does not forget homes.
export const CLOUD_LAYOUT_KEY = 'typist-stream-cloud-layout-v1';
export class CloudLayoutCache {
  constructor(storage) {
    this.storage = storage;
    this.layouts = new Map();
    try {
      const data = JSON.parse(storage.getItem(CLOUD_LAYOUT_KEY));
      if (data?.version !== 1 || !Array.isArray(data.layouts)) return;
      for (const [key, words] of data.layouts.slice(-3)) {
        if (typeof key !== 'string' || !/^\d+x\d+$/.test(key) || !Array.isArray(words)) continue;
        const [width, height] = key.split('x').map(Number);
        this.layouts.set(key, words.slice(0, 48).filter(word => typeof word.text === 'string' && /^[a-z]{1,64}$/.test(word.text)
          && Number.isFinite(word.x) && Number.isFinite(word.y) && word.x >= 0 && word.x <= width && word.y >= 0 && word.y <= height));
      }
    } catch { /* Corrupt or denied optional cache: use deterministic word homes. */ }
  }
  get(key) { return new Map((this.layouts.get(key) || []).map(word => [word.text, word])); }
  set(key, words) {
    this.layouts.delete(key); this.layouts.set(key, words.slice(0, 48));
    if (this.layouts.size > 3) this.layouts.delete(this.layouts.keys().next().value);
    try { this.storage.setItem(CLOUD_LAYOUT_KEY, JSON.stringify({version: 1, layouts: [...this.layouts]})); }
    catch { /* Layout still stays stable in memory when sessionStorage is denied. */ }
  }
}
