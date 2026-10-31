import '../../vendor/d3-7.9.0.min.js';
import '../../vendor/d3-cloud-1.2.7.js';
import {cloudFontSize} from './cloud-sizing.js';
import {CloudLayoutCache} from './cloud-layout-cache.js';

const d3 = globalThis.d3;
const FONT = 'sans-serif';

// d3-cloud owns collision/spiral layout; D3 owns keyed entry/update/exit
// transitions. Keep both deterministic and cancel obsolete asynchronous layouts.
export class HardWordCloud {
  constructor(root) {
    this.root = root;
    this.svg = d3.select(root.querySelector('svg'));
    this.caption = root.querySelector('figcaption');
    this.words = [];
    this.signature = '';
    this.generation = 0;
    let storage;
    try { storage = sessionStorage; } catch { /* Optional visual state. */ }
    this.cache = new CloudLayoutCache(storage);
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', () => this.layout());
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(root);
  }

  update(distribution) {
    this.words = distribution.ranked.filter(word => word.reliable)
      .map(word => ({text: word.word, rank: word.rank, probability: word.probability}));
    this.updateCaption();
    this.layout();
  }

  updateCaption() {
    const count = this.placedCount || 0;
    const label = count < this.words.length ? `Hardest words · ${count} of ${this.words.length}` : 'Hardest words';
    this.caption.textContent = `${label} · size follows probability`;
  }

  layout() {
    if (this.words.length) this.root.hidden = false;
    const width = Math.floor(this.root.clientWidth);
    const compact = width < 500;
    const height = compact ? 220 : 240;
    const words = this.words.slice(0, compact ? 24 : 48).map(word => ({...word}));
    const signature = JSON.stringify([width, this.motion.matches, words]);
    if (signature === this.signature) return;
    this.signature = signature;
    const generation = ++this.generation;
    this.pending?.stop();
    this.svg.selectAll('text').interrupt();
    const duration = this.motion.matches ? 0 : 420;
    this.root.setAttribute('aria-busy', 'true');
    const finish = () => {
      if (generation !== this.generation) return;
      this.root.setAttribute('aria-busy', 'false');
      if (!words.length) this.root.hidden = true;
    };
    if (!words.length || !width) {
      const old = this.svg.selectAll('text');
      if (!duration) { old.remove(); finish(); }
      else old.transition().duration(duration).style('opacity', 0).style('font-size', '1px').remove().end().then(finish).catch(() => {});
      return;
    }
    this.svg.attr('viewBox', `0 0 ${width} ${height}`).style('height', `${height}px`);
    const context = document.createElement('canvas').getContext('2d');
    const maximum = compact ? 42 : 58;
    // Fit long words without letting the layout silently omit the hardest one.
    let fit = 1;
    for (const word of words) {
      word.size = cloudFontSize(word.probability, maximum);
      context.font = `600 ${word.size}px ${FONT}`;
      fit = Math.min(fit, (width - 40) / context.measureText(word.text).width);
    }
    const layoutKey = `${width}x${height}`;
    const homes = this.cache.get(layoutKey);
    const order = new Map([...homes.keys()].map((word, i) => [word, i]));
    let seed = 1729;
    const hash = text => { let value = 2166136261; for (const letter of text) value = Math.imul(value ^ letter.charCodeAt(0), 16777619); return value >>> 0; };
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
    this.pending = d3.layout.cloud().size([width, height]).words(words.map(word => ({...word})))
      .font(FONT).fontWeight(600).fontSize(word => word.size * fit).padding(5).rotate(0)
      .random(random).sort((a, b) => (order.get(a.text) ?? Infinity) - (order.get(b.text) ?? Infinity) || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
      .initialPosition(word => {
        // Home positions and spiral direction belong to the word, not its rank.
        seed = hash(word.text);
        const previous = homes.get(word.text);
        if (previous) return [previous.x, previous.y];
        return [Math.round(width * (.15 + .7 * random())), Math.round(height * (.25 + .5 * random()))];
      }).timeInterval(8).on('end', placed => {
        if (generation !== this.generation) return;
        this.placedCount = placed.length; this.updateCaption();
        const offsetX = width >> 1;
        const offsetY = height >> 1;
        this.cache.set(layoutKey, placed.map(word => ({text: word.text, x: word.x + offsetX, y: word.y + offsetY})));
        this.svg.attr('aria-label', `${placed.length} hard words, sized by selection probability before cooldown. ${placed.slice(0, 5).map(word => `${word.text}, rank ${word.rank}`).join('; ')}. Full history and practice actions in the table below.`);
        const selection = this.svg.selectAll('text').data(placed, word => word.text);
        const exits = selection.exit();
        const entered = selection.enter().append('text').attr('text-anchor', 'middle')
          .attr('x', word => offsetX + word.x).attr('y', word => offsetY + word.y)
          .style('font-size', duration ? '1px' : word => `${word.size}px`).style('opacity', duration ? 0 : 1)
          .text(word => word.text);
        entered.append('title');
        const current = entered.merge(selection).attr('data-word', word => word.text).attr('data-rank', word => word.rank).attr('data-probability', word => word.probability);
        current.select('title').text(word => `${word.text} · rank ${word.rank} · ${(word.probability * 100).toFixed(2)}% before cooldown`);
        const targets = node => node.attr('x', word => offsetX + word.x).attr('y', word => offsetY + word.y)
          .style('font-size', word => `${word.size}px`).style('opacity', 1)
          .attr('fill', word => d3.interpolateRgb('#0b5f59', '#728f96')(Math.min(1, (word.rank - 1) / 35)));
        if (!duration) { exits.remove(); targets(current); finish(); }
        else {
          exits.transition().duration(duration).style('opacity', 0).style('font-size', '1px').remove();
          targets(current.transition().duration(duration).ease(d3.easeCubicInOut)).end().then(finish).catch(() => {});
        }
      }).start();
  }
}
