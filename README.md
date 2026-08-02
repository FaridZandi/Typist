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

For the chart features, an internet connection is needed because Chart.js is loaded from a CDN.

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

The main typing test shows a prompt and tracks:

- WPM
- accuracy
- consistency
- typing score
- per-character accuracy and speed
- run progress over time
- speed/consistency tradeoff
- session feedback: gross/effective WPM, final/process accuracy, corrections, pauses, and consistency
- expandable rhythm, error, transition, and word-review details

### The result screen

Effective WPM and final accuracy lead; the other six numbers stay deliberately
quieter beneath them.

The passage is rendered **once** and a single control changes what it encodes:
run notes, letter speed for this run, letter speed across all runs, or accuracy
across all runs. Each option states its own scope, so this-run and all-runs
evidence are never mistaken for each other. Run notes act as the index into it —
hovering one lights the word it refers to, selecting one pins it. Hovering a bar
in the letter-speed histogram keeps only letters in that speed band lit.

The prompt is the typing surface. A small focused input captures keyboard and IME events while the prompt renders the active word, caret, corrections, omissions, substitutions, and extra characters. Backspace edits only the active word; space commits it and aligns to the next prompt word. At timeout, the unfinished word is committed as-is.

Consistency measures the variation between consecutive captured key presses, including mistakes, extra characters, backspaces, and spaces. Per-character speed remains based on matched prompt characters.

Typing history is stored locally in versioned `localStorage` records. Character statistics are keyed by text ID, while completed runs retain their resolved text ID even when the Random selector was used. A bounded v3 analysis record retains detailed event data for the most recent 12 runs of each text; clearing typing history clears both the aggregate and detailed records. The progress and tradeoff charts can show either the active text or all texts.

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
- `feedback.js`: ranked observations and the primary recommendation
- `annotations.js`: derived passage annotations
- `charts.js`: Chart.js wrappers
- `view/`: prompt, passage-heatmap, and result-screen rendering

The reaction test mirrors it in `src/reaction/`:

- `boot.js` / `main.js`: entry point and wiring
- `storage.js`: history, per-key statistics, and settings
- `key-stats.js`: per-key accuracy and reaction-time records
- `targeting.js`: weighted target selection
- `metrics.js`: run averages, accuracy, and percentiles
- `metronome.js`: the optional visual beat
- `charts.js` and `view/keyboards.js`: history chart and key heatmaps

`src/shared/keyboard-layout.js` holds the Dvorak schematic used by both the
standalone page and the reaction heatmaps.
