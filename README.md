# Typist

Typist is a small browser-based typing practice project. It currently has three standalone pages:

- `index.html`: a 60-second typing test with selectable practice texts.
- `reaction.html`: a reaction-time key drill.
- `dvorak.html`: a minimal Dvorak keyboard schematic.

The app is static HTML/CSS/JavaScript. There is no build step.

## Running

The typing page loads as ES modules, so it must be served over HTTP rather than
opened from the filesystem — browsers block module requests on `file://`. Serve
the project root and open the pages from there:

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
- `test/reaction.test.js` covers the reaction test and the shared Dvorak
  renderer, which are still classic scripts evaluated inside JSDOM.

## Typing Test

The main typing test shows a prompt and tracks:

- WPM
- accuracy
- consistency
- typing score
- per-character accuracy heatmap
- per-character speed heatmap
- run progress over time
- speed/consistency tradeoff
- session feedback: gross/effective WPM, final/process accuracy, corrections, pauses, and consistency
- expandable rhythm, error, transition, and word-review details

The prompt is the typing surface. A small focused input captures keyboard and IME events while the prompt renders the active word, caret, corrections, omissions, substitutions, and extra characters. Backspace edits only the active word; space commits it and aligns to the next prompt word. At timeout, the unfinished word is committed as-is.

Consistency measures the variation between consecutive captured key presses, including mistakes, extra characters, backspaces, and spaces. Per-character speed heatmaps remain based on matched prompt characters.

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

- `index.html`: typing test UI
- `reaction.html`: reaction test UI
- `reaction.js`: reaction test logic
- `dvorak.html`: standalone Dvorak schematic
- `keyboard-layout.js`: shared Dvorak renderer
- `styles.css`: shared styling

The typing test is split into modules under `src/`, layered so that nothing
below the view layer knows the DOM exists:

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
- `view/`: prompt, heatmap, and result-screen rendering
