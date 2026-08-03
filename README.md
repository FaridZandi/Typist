# Typist

Typist is a small browser-based typing practice project. It currently has three standalone pages:

- `index.html`: a 60-second typing test with selectable practice texts.
- `reaction.html`: a reaction-time key drill.
- `dvorak.html`: a minimal Dvorak keyboard schematic.

The app is static HTML/CSS/JavaScript. There is no build step.

## Running

All three pages load as ES modules, so they must be served over HTTP rather
than opened from the filesystem — browsers block module requests on `file://`.
Serve the project root and open the pages from there:

```sh
python3 -m http.server 8000
```

```text
http://localhost:8000/index.html
http://localhost:8000/reaction.html
http://localhost:8000/dvorak.html
```

The typing page has no external dependencies. The reaction page loads Chart.js
from a CDN, so it needs an internet connection for its history chart.

## Testing

Install the development dependency, then run the tests:

```sh
npm install
npm test
```

The suite is split by what each test needs:

- `test/analysis.test.js` imports the analysis modules directly, with no DOM and
  no page boot, and covers aggregation thresholds, feedback ranking, progress
  states, fluency, difficulty, and annotation categories.
- `test/app.test.js` boots `index.html` in JSDOM and drives the real page:
  word commits, extra-character scoring, text-specific timing, timer expiry,
  passage annotations, history behaviour, and tab interactions.
- `test/reaction.test.js` boots `reaction.html` and covers warm-up, hits,
  errors, target selection, malformed-storage recovery, key metrics, settings
  persistence, and metronome controls, plus the shared Dvorak renderer.

## Typing Test

The main typing test shows a prompt, then a debrief of the run.

### The debrief

Nothing on the result screen is asserted in prose. Each claim is a thing to look
at:

- **speed** placed inside the range this typist has produced on this same piece,
  with the previous run behind it — "good" is defined by them, not by a global
  number;
- **accuracy** as filled cells, because counting the red ones is faster than
  reading a percentage;
- **rhythm** as one mark per keystroke spaced by real time, so steady typing
  looks like a comb and a hesitation is a gap you find by looking;
- **the finding** drawn on the Dvorak keyboard when it is a movement, with
  comparison bars against the same class of movement;
- **the fix** as drill words that can be started, not a sentence describing an
  exercise the app cannot provide.

### The finding ladder

Exactly one finding is shown, taken from the highest rung the evidence supports:

```text
transition → word → character → pause → pace → this run → nothing
```

The upper rungs need cross-run support. The lower ones describe only the run
that just happened and are labelled `this run`. When nothing clears its bar the
screen shows less rather than inventing a diagnosis.

### Not fooling ourselves

A raw inter-key interval has several causes competing for credit, so a movement
is only measured when the evidence can separate it from the alternatives:

- intervals past the run's pause threshold are hesitation, not movement, and are
  excluded outright rather than averaged in;
- each occurrence is scored against *the other movements in the same word*, so a
  hard or unfamiliar word makes all of its movements slow together and none of
  them stands out;
- a pattern must appear in at least three distinct words, or it is a fact about
  one word;
- a pattern seen only at the start of words cannot be told apart from the cost of
  recognising the word, and stays unattributed;
- widely varying timings are inconsistent rather than difficult;
- movements are compared against their own physical class, since a same-finger
  hop is slower for everyone.

The chips beside a finding are the record of which of these rivals the evidence
actually ruled out.

Drill words come from the practice catalog rather than a bundled dictionary, and
deliberately include occurrences in the middle of words — a drill built only of
words *starting* with the pattern could never confirm the pattern it practises.
A drill is practice rather than a measurement of the piece, so it never enters
the per-text history, though its events are recorded so a later run can test
whether it helped.

The prompt is the typing surface. A small focused input captures keyboard and IME events while the prompt renders the active word, caret, corrections, omissions, substitutions, and extra characters. Backspace edits only the active word; space commits it and aligns to the next prompt word. At timeout, the unfinished word is committed as-is.

Consistency measures the variation between consecutive captured key presses, including mistakes, extra characters, backspaces, and spaces.

Typing history is stored locally in versioned `localStorage` records. Character statistics are keyed by text ID, while completed runs retain their resolved text ID even when the Random selector was used. A bounded v3 analysis record retains detailed event data for the most recent 12 runs of each text; clearing typing history clears both the aggregate and detailed records.

## Reaction Test

The reaction test shows one target key at a time. The user must press that key.

It tracks:

- hits
- errors
- average reaction time
- accuracy
- best, median, and P90 reaction time
- progress across completed runs
- per-key accuracy
- per-key reaction time

Wrong key presses count as an error for both:

- the target key that should have been pressed
- the wrong key that was actually pressed

Per-key accuracy and reaction time use exponential moving averages so recent runs matter more than old data. The weighted target selector is calculated at the beginning of each test: every key has a baseline chance to appear, while keys with worse recent accuracy or slower recent reaction times appear more often.

Reaction history is stored in `localStorage`.

## Dvorak Schematic

`dvorak.html` shows a compact Dvorak keyboard layout with only typing keys. It is used as the basis for the reaction-test heatmaps.

## Files

- `index.html`, `reaction.html`, `dvorak.html`: the three pages
- `styles/`: stylesheets, imported in cascade order by `styles/index.css`
- `src/`: application modules
- `test/`: test suite
- `thinking/`: design notes, roadmaps, and the backlog

Both tests are split into modules under `src/`, layered so that nothing below
the view layer knows the DOM exists. The typing test lives in `src/`:

- `boot.js`: browser entry point
- `main.js`: element lookups, session state, and event wiring
- `run-engine.js`: the keystroke state machine and completed-run summary
- `storage.js`: versioned `localStorage` records
- `texts.js`: typing prompt catalog
- `text-model.js`: word boundaries, run length, difficulty estimate
- `alignment.js`: prompt-to-typed alignment and error categories
- `metrics.js`: scoring and timing maths
- `aggregates.js`: cross-run character, n-gram, word, and Shift aggregation
- `progress.js`: progress states over a series of runs
- `annotations.js`: derived passage annotations
- `transitions.js`: confound-controlled key-to-key measurement
- `finding.js`: the ladder that picks the one thing to show
- `drills.js`: practice material generated from the catalog
- `view/`: the prompt surface and the debrief

The reaction test mirrors it in `src/reaction/`:

- `boot.js` / `main.js`: entry point and wiring
- `storage.js`: history, per-key statistics, and settings
- `key-stats.js`: per-key accuracy and reaction-time records
- `targeting.js`: weighted target selection
- `metrics.js`: run averages, accuracy, and percentiles
- `metronome.js`: the optional visual beat
- `charts.js` and `view/keyboards.js`: history chart and key heatmaps

`src/shared/keyboard-layout.js` holds the Dvorak schematic used by the standalone
page, the reaction heatmaps, and the finding diagram. `src/shared/keyboard-map.js`
adds the finger and hand assignment that classifies a movement.
