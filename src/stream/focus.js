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
  const slider = $('difficultyFocus'), popup = $('focusPreview');
  let pinned = false;
  const show = () => { popup.hidden = false; };
  const hide = () => { pinned = false; popup.hidden = true; };
  root.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(); });
  root.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') hide(); });
  root.addEventListener('focusin', show);
  root.addEventListener('focusout', event => { if (!pinned && !root.contains(event.relatedTarget)) hide(); });
  root.addEventListener('pointerdown', event => { if (event.pointerType === 'touch' && !popup.contains(event.target)) { pinned = true; show(); } });
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
    slider.setAttribute('aria-valuetext', `${value} percent focus, ${value < 34 ? 'exploration' : value > 66 ? 'difficult words' : 'balanced'}`);
    slider.disabled = inactive;
    $('focusStatus').textContent = inactive ? 'Inactive · unrecorded practice set overrides this control.' : 'New draws only · buffered words stay unchanged.';
    $('focusPersistence').textContent = persisted ? '' : 'Preference could not be saved; kept for this tab only.';
    $('focusDiscovery').textContent = inactive ? 'Practice set only · recorded distribution below is inactive.' : `Unseen words: ${percent(distribution.unseenProbability)} total · ${distribution.unseenCount} remaining`;
    $('focusExplanation').textContent = `${distribution.targetCount ? 'Supported trouble receives extra attention.' : 'No eligible supported trouble; broad exploration only.'} ${distribution.unseenCount ? 'At least 20% discovery.' : 'Unseen pool exhausted; all probability goes to practiced words.'} ${distribution.relaxed ? 'Oldest unseen word released from cooldown to preserve discovery.' : 'Last five generated words excluded where possible.'} Ranking uses supported trouble, then alphabetical ties; zero-score words have no established difficulty.`;
    const rows = distribution.ranked;
    const svg = $('focusPlot'); svg.replaceChildren();
    const max = Math.max(.01, ...rows.map(row => row.probability));
    const x = i => rows.length === 1 ? 220 : 52 + Math.log10(i + 1) / Math.log10(Math.max(2, rows.length)) * 348;
    const y = p => 136 - p / max * 110;
    svg.append(svgNode('path', {d: 'M52 22V136H400', fill: 'none', stroke: '#a3aeb8'}));
    for (const fraction of [0, .5, 1]) {
      svg.append(svgNode('text', {x: 47, y: y(max * fraction) + 4, 'text-anchor': 'end'}, percent(max * fraction)));
    }
    svg.append(svgNode('text', {x: 52, y: 13}, 'Selection probability'), svgNode('text', {x: 220, y: 174, 'text-anchor': 'middle'}, 'Difficulty rank · log scale'));
    if (rows.length) {
      svg.append(svgNode('polyline', {points: rows.map((row, i) => `${x(i)},${y(row.probability)}`).join(' '), fill: 'none', stroke: '#0f766e', 'stroke-width': 2}));
      rows.forEach((row, i) => {
        const dot = svgNode('circle', {cx: x(i), cy: y(row.probability), r: rows.length > 80 ? 2 : 3, fill: '#0f766e'});
        dot.append(svgNode('title', {}, `#${row.rank} ${row.word}: ${percent(row.probability)}`)); svg.append(dot);
      });
      // 1–2–5 ticks expose the log spacing; omit near-end ticks to keep labels apart.
      const ticks = [1];
      for (let decade = 1; decade <= rows.length; decade *= 10) {
        for (const factor of [1, 2, 5]) {
          const rank = decade * factor;
          if (rank > 1 && rank < rows.length && x(rank - 1) - x(ticks.at(-1) - 1) >= 28 && x(rows.length - 1) - x(rank - 1) >= 28) ticks.push(rank);
        }
      }
      if (rows.length > 1) ticks.push(rows.length);
      for (const rank of ticks) {
        svg.append(svgNode('path', {d: `M${x(rank - 1)} 136v4`, stroke: '#a3aeb8'}));
        svg.append(svgNode('text', {x: x(rank - 1), y: 153, 'text-anchor': 'middle'}, rank));
      }
    } else svg.append(svgNode('text', {x: 220, y: 80, 'text-anchor': 'middle'}, 'No practiced words yet'));
    $('focusRanks').replaceChildren(...rows.map(row => {
      const item = document.createElement('li');
      item.textContent = `#${row.rank} ${row.word} · ${percent(row.probability)}${row.eligible ? '' : ' · cooldown'}${row.reliable ? '' : ' · no established trouble'}`;
      return item;
    }));
  };
}
