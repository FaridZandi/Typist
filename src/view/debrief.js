// The result screen. Everything the old screen asserted in a sentence is
// rendered as something to look at: the run against the typist's own range, the
// stumble as a gap in the beat, the slow movement drawn on the keyboard, and
// the fix as words that can be typed. The only words are labels.

import { getKeyPosition } from "../shared/keyboard-map.js";

const KEY_SIZE = 26;
const KEY_PITCH = 31;
const ROW_OFFSETS = [0, 10, 26];
const SVG_NS = "http://www.w3.org/2000/svg";

const KEY_ROWS = [
  ["'", ",", ".", "p", "y", "f", "g", "c", "r", "l", "/"],
  ["a", "o", "e", "u", "i", "d", "h", "t", "n", "s", "-"],
  [";", "q", "j", "k", "x", "b", "m", "w", "v", "z"],
];

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(document, tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

function keyCentre(character) {
  const position = getKeyPosition(character);
  if (!position) return null;
  return {
    x: ROW_OFFSETS[position.row] + position.column * KEY_PITCH + KEY_SIZE / 2,
    y: position.row * KEY_PITCH + KEY_SIZE / 2,
  };
}

// The keyboard doubles as the picture for both a movement and a single key.
export function renderKeyboard(document, { lit = [], hop = null } = {}) {
  const width = ROW_OFFSETS[0] + KEY_ROWS[0].length * KEY_PITCH;
  const height = KEY_ROWS.length * KEY_PITCH;
  const root = svg(document, "svg", {
    class: "kb", width, height, viewBox: `0 0 ${width} ${height}`, role: "img",
  });
  const litSet = new Set(lit.map((character) => character.toLowerCase()));

  KEY_ROWS.forEach((row, rowIndex) => {
    row.forEach((key, column) => {
      const x = ROW_OFFSETS[rowIndex] + column * KEY_PITCH;
      const y = rowIndex * KEY_PITCH;
      const isLit = litSet.has(key);
      root.append(svg(document, "rect", {
        x, y, width: KEY_SIZE, height: KEY_SIZE, rx: 6, class: `key${isLit ? " hot" : ""}`,
      }));
      const label = svg(document, "text", { x: x + KEY_SIZE / 2, y: y + KEY_SIZE / 2 + 1, class: isLit ? "hot" : "" });
      label.textContent = /^[a-z]$/.test(key) ? key.toUpperCase() : key;
      root.append(label);
    });
  });

  if (hop) {
    const from = keyCentre(hop[0]);
    const to = keyCentre(hop[1]);
    if (from && to) {
      // Bow the arc away from the straight line so it reads as a movement.
      const midX = (from.x + to.x) / 2 - (to.y - from.y) * 0.35;
      const midY = (from.y + to.y) / 2 + (to.x - from.x) * 0.35;
      root.append(svg(document, "path", {
        class: "hop", d: `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`,
      }));
    }
  }
  return root;
}

// Speed placed inside the range this typist has actually produced on this
// piece, so "good" is defined by them rather than by a global number.
function renderRange(elements, document, range) {
  elements.speedRange.replaceChildren();
  if (!range || !Number.isFinite(range.min) || range.max <= range.min) {
    elements.speedRange.hidden = true;
    return;
  }
  elements.speedRange.hidden = false;
  const place = (value) => ((value - range.min) / (range.max - range.min)) * 100;

  elements.speedRange.append(el(document, "div", "track"));
  const band = el(document, "div", "band");
  band.style.left = "0%";
  band.style.right = "0%";
  elements.speedRange.append(band);

  if (Number.isFinite(range.previous)) {
    const ghost = el(document, "div", "ghost");
    ghost.style.left = `${Math.max(0, Math.min(100, place(range.previous)))}%`;
    ghost.title = `previous run · ${range.previous} WPM`;
    elements.speedRange.append(ghost);
  }
  const tick = el(document, "div", "tick");
  tick.style.left = `${Math.max(0, Math.min(100, place(range.current)))}%`;
  tick.title = `this run · ${range.current} WPM · range ${range.min}–${range.max}`;
  elements.speedRange.append(tick);
}

// Twenty cells, filled in proportion to accuracy. Reading "how many red" is
// faster than reading a percentage.
function renderAccuracyPips(elements, document, accuracy) {
  elements.accuracyPips.replaceChildren();
  const missed = Math.min(20, Math.round(((100 - accuracy) / 100) * 20));
  for (let index = 0; index < 20; index += 1) {
    elements.accuracyPips.append(el(document, "i", index >= 20 - missed ? "err" : "on"));
  }
  elements.accuracyPips.title = `${accuracy}% of characters correct`;
}

// One mark per keystroke, positioned by real time. Steady typing looks like a
// comb; a hesitation is a hole you find by looking.
function renderRhythm(elements, document, rhythm) {
  elements.rhythmStrip.replaceChildren();
  const events = rhythm.events.filter((event) => Number.isFinite(event.timestampMs));
  const total = events.at(-1)?.timestampMs ?? 0;
  if (events.length < 3 || total <= 0) {
    elements.rhythmSection.hidden = true;
    return;
  }
  elements.rhythmSection.hidden = false;
  elements.rhythmEnd.textContent = `${Math.round(total / 1000)}s`;

  events.forEach((event, index) => {
    const previous = events[index - 1];
    const gap = previous ? event.timestampMs - previous.timestampMs : 0;
    const isPause = previous && gap >= rhythm.thresholdMs;

    if (isPause) {
      const band = el(document, "div", "gapmark");
      band.style.left = `${(previous.timestampMs / total) * 100}%`;
      band.style.width = `${(gap / total) * 100}%`;
      band.append(el(document, "span", null, `${Math.round(gap / 100) / 10}s`));
      elements.rhythmStrip.append(band);
    }

    // Position is the only thing a mark encodes: when the keystroke happened.
    // Height is deliberately uniform, because a varying height would imply a
    // magnitude the mark does not carry.
    const mark = el(document, "div", `beat${isPause ? " gap" : ""}`);
    mark.style.left = `${(event.timestampMs / total) * 100}%`;
    elements.rhythmStrip.append(mark);
  });
}

function bar(document, { label, mono, widthPercent, value, tone }) {
  const row = el(document, "div", `bar-row${tone ? ` ${tone}` : ""}`);
  const who = el(document, "span", "who");
  if (mono) who.append(el(document, "b", null, label));
  else who.textContent = label;
  const track = el(document, "div", "bar");
  const fill = el(document, "span");
  fill.style.width = `${Math.max(4, Math.min(100, widthPercent))}%`;
  track.append(fill);
  row.append(who, track, el(document, "span", "ms", value));
  return row;
}

const RULED_OUT_LABELS = {
  hesitation: "not a pause",
  "single-word": "many words",
  "single-text": "many texts",
  "word-recognition": "mid-word too",
  inconsistent: "consistent",
};

const FINDING_LABELS = {
  transition: "Slowest movement",
  word: "Least reliable word",
  character: "Least reliable key",
  pause: "Where you stopped",
  pace: "Pace across the run",
  run: "This run",
  none: "Nothing to single out yet",
};

function renderFinding(elements, document, finding) {
  elements.findingLabel.textContent = FINDING_LABELS[finding.level];
  elements.findingVisual.replaceChildren();
  elements.findingBars.replaceChildren();
  elements.findingTrend.replaceChildren();
  elements.findingTrend.hidden = true;
  elements.findingChips.replaceChildren();
  elements.findingBlock.hidden = finding.level === "none";
  if (finding.level === "none") return;

  const { measure } = finding;

  if (finding.level === "transition") {
    const [from, to] = finding.subject.value;
    elements.findingVisual.append(renderKeyboard(document, { lit: [from, to], hop: [from, to] }));
    const worst = Math.max(measure.valueMs, measure.baselineMs || 0, measure.runValueMs || 0) || 1;
    elements.findingBars.append(
      bar(document, { label: `${from} → ${to}`, mono: true, widthPercent: (measure.valueMs / worst) * 100, value: `${measure.valueMs}ms`, tone: "slow" }),
      bar(document, { label: "same words", widthPercent: ((measure.baselineMs || 0) / worst) * 100, value: `${measure.baselineMs}ms` }),
    );
    // The two bars above are everything ever measured; this one is the run the
    // typist just finished, which is the only part they can still remember.
    if (Number.isFinite(measure.runValueMs)) {
      elements.findingBars.append(bar(document, {
        label: "this run",
        widthPercent: (measure.runValueMs / worst) * 100,
        value: `${measure.runValueMs}ms`,
        tone: "now",
      }));
    }
    renderTrend(elements, document, finding);
  } else if (finding.level === "character") {
    elements.findingVisual.append(renderKeyboard(document, { lit: [finding.subject.value] }));
    elements.findingBars.append(
      bar(document, { label: finding.subject.value, mono: true, widthPercent: measure.accuracy, value: `${measure.accuracy}%`, tone: "slow" }),
      bar(document, { label: "correct", widthPercent: 100, value: `${measure.attempts - measure.wrong}/${measure.attempts}` }),
    );
  } else if (finding.level === "word") {
    elements.findingVisual.append(el(document, "div", "subject-word", finding.subject.value));
    const worst = Math.max(measure.valueMs, measure.baselineMs || 0) || 1;
    elements.findingBars.append(
      bar(document, { label: "this word", widthPercent: (measure.valueMs / worst) * 100, value: `${measure.valueMs}ms`, tone: "slow" }),
      bar(document, { label: "your words", widthPercent: ((measure.baselineMs || 0) / worst) * 100, value: `${measure.baselineMs}ms` }),
    );
  } else if (finding.level === "pause") {
    elements.findingVisual.append(el(document, "div", "subject-count", String(measure.count)));
    elements.findingBars.append(
      bar(document, { label: "longest", widthPercent: 100, value: `${Math.round(measure.longestMs / 100) / 10}s`, tone: "slow" }),
      bar(document, { label: "before a word", widthPercent: (measure.beforeWords / measure.count) * 100, value: `${measure.beforeWords}/${measure.count}` }),
    );
  } else if (finding.level === "pace") {
    elements.findingVisual.append(el(document, "div", "subject-count", `${measure.percent}%`));
    const worst = Math.max(measure.earlyMs, measure.lateMs) || 1;
    elements.findingBars.append(
      bar(document, { label: "first third", widthPercent: (measure.earlyMs / worst) * 100, value: `${measure.earlyMs}ms` }),
      bar(document, { label: "final third", widthPercent: (measure.lateMs / worst) * 100, value: `${measure.lateMs}ms`, tone: measure.lateMs > measure.earlyMs ? "slow" : null }),
    );
  } else {
    elements.findingVisual.append(el(document, "div", "subject-count", String(measure.errorsLeft)));
    elements.findingBars.append(
      bar(document, { label: "left wrong", widthPercent: 100, value: String(measure.errorsLeft), tone: measure.errorsLeft > 0 ? "slow" : null }),
      bar(document, { label: "corrected", widthPercent: 60, value: String(measure.corrected) }),
    );
  }

  // The chips are the falsification record: which rival explanations the
  // evidence actually eliminated, plus how much of it there is.
  if (finding.accurate) elements.findingChips.append(chip(document, "ok", "keys correct"));
  if (measure.motorClassLabel) elements.findingChips.append(chip(document, "evidence", measure.motorClassLabel));
  if (Number.isFinite(measure.slowdownPercent) && measure.slowdownPercent > 0) {
    elements.findingChips.append(chip(document, "warn", `+${measure.slowdownPercent}% slower`));
  }
  finding.ruledOut.forEach((rival) => {
    if (RULED_OUT_LABELS[rival]) elements.findingChips.append(chip(document, "ok", RULED_OUT_LABELS[rival]));
  });
  elements.findingChips.append(chip(document, "evidence", evidenceText(finding)));
}

// The history behind the median. A single number cannot say whether a movement
// is getting better, and an average of everything hides the run in front of the
// typist — so every occurrence is drawn, run by run, against the other
// movements in its own words.
const TREND = { width: 560, height: 132, left: 46, right: 14, top: 14, bottom: 26 };
// The column width a mark is drawn at full size in. Below it every mark shrinks
// together, so a long history crowds rather than overlapping into a smear.
const TREND_COMFORTABLE_COLUMN = 34;

function trendPath(document, points, className) {
  if (points.length < 2) return null;
  return svg(document, "polyline", {
    class: className,
    points: points.map(({ x, y }) => `${x},${y}`).join(" "),
  });
}

function renderTrend(elements, document, finding) {
  elements.findingTrend.replaceChildren();
  // Every run held, not a recent window: the point of the picture is to see how
  // far back the movement goes and whether it has moved since.
  const entries = finding.history?.entries ?? [];
  // One run is no history: the bars already say everything a single point could.
  if (entries.length < 2) {
    elements.findingTrend.hidden = true;
    return;
  }
  elements.findingTrend.hidden = false;

  const { width, height, left, right, top, bottom } = TREND;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(...entries.flatMap((entry) => [...entry.samples, entry.baselineMs ?? 0]), 1);
  const columnWidth = plotWidth / entries.length;
  const x = (index) => left + (index + 0.5) * columnWidth;
  // Zero-based, like the bars, so a difference on screen is a difference in ms.
  const y = (value) => top + plotHeight - (value / maxValue) * plotHeight;
  const at = (key) => entries.flatMap((entry, index) => (Number.isFinite(entry[key]) ? [{ x: x(index), y: y(entry[key]) }] : []));
  const unit = Math.max(0.4, Math.min(1, columnWidth / TREND_COMFORTABLE_COLUMN));

  const [from, to] = finding.subject.value;
  const root = svg(document, "svg", {
    class: "trend-plot",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${from} to ${to} across ${entries.length} runs`,
  });

  const current = entries.findIndex((entry) => entry.current);
  if (current >= 0) {
    root.append(svg(document, "rect", {
      class: "now-band", x: left + current * columnWidth, y: top, width: columnWidth, height: plotHeight, rx: 4,
    }));
  }

  root.append(svg(document, "line", { class: "axis", x1: left, y1: y(0), x2: width - right, y2: y(0) }));

  const baselineLine = trendPath(document, at("baselineMs"), "line base");
  if (baselineLine) root.append(baselineLine);
  const medianLine = trendPath(document, at("medianMs"), "line pair");
  if (medianLine) root.append(medianLine);

  entries.forEach((entry, index) => {
    // Every occurrence, not just its median — the spread is the reason a run
    // with one bad hop does not look like a run that was slow throughout.
    if (entry.samples.length > 1) {
      root.append(svg(document, "line", {
        class: "spread",
        "stroke-width": (5 * unit).toFixed(2),
        x1: x(index), y1: y(Math.min(...entry.samples)), x2: x(index), y2: y(Math.max(...entry.samples)),
      }));
    }
    entry.samples.forEach((intervalMs) => {
      root.append(svg(document, "circle", {
        class: `dot${entry.current ? " now" : ""}`, cx: x(index), cy: y(intervalMs), r: (2.4 * unit).toFixed(2),
      }));
    });
    if (Number.isFinite(entry.baselineMs)) {
      const reach = Math.min(6, columnWidth * 0.4);
      root.append(svg(document, "line", {
        class: "base-mark", "stroke-width": (2 * unit).toFixed(2),
        x1: x(index) - reach, y1: y(entry.baselineMs), x2: x(index) + reach, y2: y(entry.baselineMs),
      }));
    }
    if (Number.isFinite(entry.medianMs)) {
      root.append(svg(document, "circle", {
        class: `median${entry.current ? " now" : ""}`,
        cx: x(index), cy: y(entry.medianMs), r: (entry.current ? 5 * unit + 1 : 3.4 * unit).toFixed(2),
      }));
    }
    // A filled tick means the run was on the piece just typed; a hollow one
    // means the evidence came from somewhere else, including a drill.
    const onThisPiece = entry.textId === finding.history.currentTextId;
    root.append(svg(document, "circle", {
      class: `piece${onThisPiece ? " same" : ""}`, cx: x(index), cy: height - bottom + 9,
      // Floored, because a hollow tick that shrinks past its own stroke stops
      // being distinguishable from a filled one.
      r: Math.max(2.2, 2.6 * unit).toFixed(2),
    }));
  });

  const label = (text, attributes) => {
    const node = svg(document, "text", { class: "trend-label", ...attributes });
    node.textContent = text;
    return node;
  };
  root.append(
    label(`${maxValue}ms`, { x: left - 8, y: top + 4, "text-anchor": "end" }),
    label("0", { x: left - 8, y: y(0) + 4, "text-anchor": "end" }),
    label("oldest", { x: left, y: height - 2 }),
    label("now", { x: width - right, y: height - 2, "text-anchor": "end" }),
  );

  const legend = el(document, "div", "legend-row");
  legend.append(
    legendItem(document, "sw-pair", `${from} → ${to}`),
    legendItem(document, "sw-base", "same words"),
  );
  if (new Set(entries.map((entry) => entry.textId)).size > 1) {
    legend.append(legendItem(document, "sw-piece", "this piece"));
  }
  elements.findingTrend.append(root, legend);
}

function legendItem(document, swatch, text) {
  const item = el(document, "span");
  item.append(el(document, "i", `sw ${swatch}`), document.createTextNode(text));
  return item;
}

function evidenceText(finding) {
  const { samples, distinctWords, distinctTexts } = finding.evidence;
  if (finding.confidence === "run-only") return "this run";
  const parts = [`${samples}×`];
  if (distinctWords) parts.push(`${distinctWords} words`);
  if (distinctTexts > 1) parts.push(`${distinctTexts} texts`);
  return parts.join(" · ");
}

function chip(document, tone, text) {
  const node = el(document, "span", `chip ${tone}`);
  node.append(el(document, "i"), document.createTextNode(text));
  return node;
}

function renderDrill(elements, document, drill) {
  elements.drillBlock.hidden = !drill;
  if (!drill) return;
  elements.drillWords.replaceChildren();
  elements.drillDuration.textContent = `${drill.durationSeconds}s`;

  drill.words.forEach((word) => {
    const chip = el(document, "span", "word");
    const at = drill.pattern.length > 1 || /^[a-z]$/.test(drill.pattern) ? word.indexOf(drill.pattern) : -1;
    if (at >= 0) {
      chip.append(
        document.createTextNode(word.slice(0, at)),
        el(document, "b", null, word.slice(at, at + drill.pattern.length)),
        document.createTextNode(word.slice(at + drill.pattern.length)),
      );
    } else {
      chip.textContent = word;
    }
    elements.drillWords.append(chip);
  });
}

export function renderDebrief({ elements, document, data }) {
  elements.finalSpeed.textContent = data.speed;
  elements.finalAccuracy.textContent = data.accuracy;
  renderRange(elements, document, data.range);
  renderAccuracyPips(elements, document, data.accuracy);

  const hasDelta = Number.isFinite(data.delta);
  elements.deltaStat.hidden = !hasDelta;
  if (hasDelta) {
    elements.speedDelta.textContent = `${data.delta > 0 ? "▲" : data.delta < 0 ? "▼" : "="} ${Math.abs(data.delta)}`;
    elements.speedDelta.className = `delta ${data.delta > 0 ? "up" : data.delta < 0 ? "down" : ""}`;
  }

  renderRhythm(elements, document, data.rhythm);
  renderFinding(elements, document, data.finding);
  renderDrill(elements, document, data.drill);
}
