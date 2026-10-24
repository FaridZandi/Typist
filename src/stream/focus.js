import {DEFAULT_FOCUS, normalizeFocus} from './model.js';

export const FOCUS_KEY = 'typist-stream-focus-v1';
export function readFocus(storage) {
  try { const value = storage.getItem(FOCUS_KEY); return value === null ? DEFAULT_FOCUS : normalizeFocus(value); }
  catch { return DEFAULT_FOCUS; }
}
export function saveFocus(storage, value) {
  try { storage.setItem(FOCUS_KEY, String(normalizeFocus(value))); return true; }
  catch { return false; }
}

export function createFocusControl(root, initial, onChange) {
  const $ = id => root.querySelector('#' + id);
  const slider = $('difficultyFocus'), popup = $('focusPreview'), toggle = $('previewFocus');
  let pinned = false;
  const show = () => { popup.hidden = false; toggle.setAttribute('aria-expanded', 'true'); };
  const hide = () => { pinned = false; popup.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  root.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(); });
  root.addEventListener('pointerleave', () => { if (!pinned && !root.contains(document.activeElement)) hide(); });
  root.addEventListener('focusin', show);
  root.addEventListener('focusout', event => { if (!pinned && !root.contains(event.relatedTarget)) hide(); });
  toggle.addEventListener('click', () => { if (pinned) hide(); else { pinned = true; show(); } });
  $('closeFocus').addEventListener('click', hide);
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) hide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  slider.value = initial;
  slider.addEventListener('input', () => { onChange(Number(slider.value)); show(); });
  const percent = value => `${(value * 100).toFixed(2)}%`;
  const svgNode = (tag, attributes, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  return (distribution, inactive, persisted = true) => {
    const value = Number(slider.value);
    $('focusValue').textContent = `${value} · ${value < 34 ? 'Explore' : value > 66 ? 'Concentrate' : 'Balanced'}`;
    slider.setAttribute('aria-valuetext', `${value} percent focus, ${value < 34 ? 'exploration' : value > 66 ? 'difficult words' : 'balanced'}`);
    slider.disabled = inactive;
    $('focusStatus').textContent = inactive ? 'Inactive · unrecorded practice set overrides this control.' : 'New draws only · buffered words stay unchanged.';
    $('focusPersistence').textContent = persisted ? '' : 'Preference could not be saved; kept for this tab only.';
    $('focusDiscovery').textContent = inactive ? 'Practice set only · recorded distribution below is inactive.' : `Unseen words: ${percent(distribution.unseenProbability)} total · ${distribution.unseenCount} remaining`;
    $('focusExplanation').textContent = `${distribution.targetCount ? 'Supported trouble receives extra attention.' : 'No eligible supported trouble; broad exploration only.'} ${distribution.unseenCount ? 'At least 20% discovery.' : 'Unseen pool exhausted; all probability goes to practiced words.'} ${distribution.relaxed ? 'Oldest unseen word released from cooldown to preserve discovery.' : 'Last five generated words excluded where possible.'} Ranking uses supported trouble, then alphabetical ties; zero-score words have no established difficulty.`;
    const rows = distribution.ranked;
    const svg = $('focusPlot'); svg.replaceChildren();
    const max = Math.max(.01, ...rows.map(row => row.probability));
    const x = i => rows.length === 1 ? 220 : 52 + i / Math.max(1, rows.length - 1) * 348;
    const y = p => 136 - p / max * 110;
    svg.append(svgNode('path', {d: 'M52 22V136H400', fill: 'none', stroke: '#a3aeb8'}));
    for (const fraction of [0, .5, 1]) {
      svg.append(svgNode('text', {x: 47, y: y(max * fraction) + 4, 'text-anchor': 'end'}, percent(max * fraction)));
    }
    svg.append(svgNode('text', {x: 52, y: 13}, 'Selection probability'), svgNode('text', {x: 220, y: 174, 'text-anchor': 'middle'}, 'Difficulty rank · practiced words'));
    if (rows.length) {
      svg.append(svgNode('polyline', {points: rows.map((row, i) => `${x(i)},${y(row.probability)}`).join(' '), fill: 'none', stroke: '#0f766e', 'stroke-width': 2}));
      rows.forEach((row, i) => {
        const dot = svgNode('circle', {cx: x(i), cy: y(row.probability), r: rows.length > 80 ? 2 : 3, fill: '#0f766e'});
        dot.append(svgNode('title', {}, `#${row.rank} ${row.word}: ${percent(row.probability)}`)); svg.append(dot);
      });
      svg.append(svgNode('text', {x: x(0), y: 153, 'text-anchor': 'middle'}, '1'));
      if (rows.length > 1) svg.append(svgNode('text', {x: x(rows.length - 1), y: 153, 'text-anchor': 'middle'}, rows.length));
    } else svg.append(svgNode('text', {x: 220, y: 80, 'text-anchor': 'middle'}, 'No practiced words yet'));
    $('focusRanks').replaceChildren(...rows.map(row => {
      const item = document.createElement('li');
      item.textContent = `#${row.rank} ${row.word} · ${percent(row.probability)}${row.eligible ? '' : ' · cooldown'}${row.reliable ? '' : ' · no established trouble'}`;
      return item;
    }));
  };
}
