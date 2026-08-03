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

function bar(document, { label, mono, widthPercent, value, slow }) {
  const row = el(document, "div", `bar-row${slow ? " slow" : ""}`);
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
  elements.findingChips.replaceChildren();
  elements.findingBlock.hidden = finding.level === "none";
  if (finding.level === "none") return;

  const { measure } = finding;

  if (finding.level === "transition") {
    const [from, to] = finding.subject.value;
    elements.findingVisual.append(renderKeyboard(document, { lit: [from, to], hop: [from, to] }));
    const worst = Math.max(measure.valueMs, measure.baselineMs || 0) || 1;
    elements.findingBars.append(
      bar(document, { label: `${from} → ${to}`, mono: true, widthPercent: (measure.valueMs / worst) * 100, value: `${measure.valueMs}ms`, slow: true }),
      bar(document, { label: "same words", widthPercent: ((measure.baselineMs || 0) / worst) * 100, value: `${measure.baselineMs}ms` }),
    );
  } else if (finding.level === "character") {
    elements.findingVisual.append(renderKeyboard(document, { lit: [finding.subject.value] }));
    elements.findingBars.append(
      bar(document, { label: finding.subject.value, mono: true, widthPercent: measure.accuracy, value: `${measure.accuracy}%`, slow: true }),
      bar(document, { label: "correct", widthPercent: 100, value: `${measure.attempts - measure.wrong}/${measure.attempts}` }),
    );
  } else if (finding.level === "word") {
    elements.findingVisual.append(el(document, "div", "subject-word", finding.subject.value));
    const worst = Math.max(measure.valueMs, measure.baselineMs || 0) || 1;
    elements.findingBars.append(
      bar(document, { label: "this word", widthPercent: (measure.valueMs / worst) * 100, value: `${measure.valueMs}ms`, slow: true }),
      bar(document, { label: "your words", widthPercent: ((measure.baselineMs || 0) / worst) * 100, value: `${measure.baselineMs}ms` }),
    );
  } else if (finding.level === "pause") {
    elements.findingVisual.append(el(document, "div", "subject-count", String(measure.count)));
    elements.findingBars.append(
      bar(document, { label: "longest", widthPercent: 100, value: `${Math.round(measure.longestMs / 100) / 10}s`, slow: true }),
      bar(document, { label: "before a word", widthPercent: (measure.beforeWords / measure.count) * 100, value: `${measure.beforeWords}/${measure.count}` }),
    );
  } else if (finding.level === "pace") {
    elements.findingVisual.append(el(document, "div", "subject-count", `${measure.percent}%`));
    const worst = Math.max(measure.earlyMs, measure.lateMs) || 1;
    elements.findingBars.append(
      bar(document, { label: "first third", widthPercent: (measure.earlyMs / worst) * 100, value: `${measure.earlyMs}ms` }),
      bar(document, { label: "final third", widthPercent: (measure.lateMs / worst) * 100, value: `${measure.lateMs}ms`, slow: measure.lateMs > measure.earlyMs }),
    );
  } else {
    elements.findingVisual.append(el(document, "div", "subject-count", String(measure.errorsLeft)));
    elements.findingBars.append(
      bar(document, { label: "left wrong", widthPercent: 100, value: String(measure.errorsLeft), slow: measure.errorsLeft > 0 }),
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
