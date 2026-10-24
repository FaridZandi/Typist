import '../../vendor/d3-7.9.0.min.js';
import '../../vendor/d3-cloud-1.2.7.js';
import {compareDifficulty, troubleScore} from './model.js';

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
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', () => this.layout());
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(root);
  }

  update(summaries) {
    this.words = [...summaries.values()].filter(word => troubleScore(word) > 0).sort(compareDifficulty)
      .map((word, i) => ({text: word.word, rank: i + 1}));
    this.updateCaption();
    this.layout();
  }

  updateCaption() {
    const count = this.placedCount || 0;
    const label = count < this.words.length ? `Hardest words · ${count} of ${this.words.length}` : 'Hardest words';
    this.caption.textContent = `${label} · larger means harder`;
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
      word.size = 13 + (maximum - 13) / word.rank ** .45;
      context.font = `600 ${word.size}px ${FONT}`;
      fit = Math.min(fit, (width - 40) / context.measureText(word.text).width);
    }
    let seed = 1729;
    const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
    this.pending = d3.layout.cloud().size([width, height]).words(words.map(word => ({...word})))
      .font(FONT).fontWeight(600).fontSize(word => word.size * fit).padding(5).rotate(0)
      .random(random).timeInterval(8).on('end', (placed, bounds) => {
        if (generation !== this.generation) return;
        this.placedCount = placed.length; this.updateCaption();
        const offsetX = bounds ? width / 2 + (width >> 1) - (bounds[0].x + bounds[1].x) / 2 : width / 2;
        const offsetY = bounds ? height / 2 + (height >> 1) - (bounds[0].y + bounds[1].y) / 2 : height / 2;
        this.svg.attr('aria-label', `${placed.length} hard words, sized by difficulty rank. ${placed.slice(0, 5).map(word => `${word.text}, rank ${word.rank}`).join('; ')}. Full history and practice actions in the table below.`);
        const selection = this.svg.selectAll('text').data(placed, word => word.text);
        const exits = selection.exit();
        const entered = selection.enter().append('text').attr('text-anchor', 'middle')
          .attr('x', word => offsetX + word.x).attr('y', word => offsetY + word.y)
          .style('font-size', duration ? '1px' : word => `${word.size}px`).style('opacity', duration ? 0 : 1)
          .text(word => word.text);
        entered.append('title');
        const current = entered.merge(selection).attr('data-word', word => word.text).attr('data-rank', word => word.rank);
        current.select('title').text(word => `${word.text} · difficulty rank ${word.rank}`);
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
