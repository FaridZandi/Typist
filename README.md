# Typist

Typist is a small browser-based typing practice project. It currently has three standalone pages:

- `index.html`: a 60-second typing test with selectable practice texts.
- `reaction.html`: a reaction-time key drill.
- `dvorak.html`: a minimal Dvorak keyboard schematic.

The app is static HTML/CSS/JavaScript. There is no build step.

## Running

Open any page directly in a browser:

```text
index.html
reaction.html
dvorak.html
```

For the chart features, an internet connection is needed because Chart.js is loaded from a CDN.

## Testing

Install the development dependency, then run the browser-flow tests:

```sh
npm install
npm test
```

The tests run in JSDOM and cover the shared Dvorak renderer, word commits, extra-character scoring, text-specific timing, input limits, timer expiry, history behaviour, and analytics tab interactions, plus reaction-test completion, errors, target selection, malformed-storage recovery, key metrics, settings persistence, and metronome controls.

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
- `texts.js`: typing prompt catalog
- `script.js`: typing test logic
- `reaction.html`: reaction test UI
- `reaction.js`: reaction test logic
- `dvorak.html`: standalone Dvorak schematic
- `styles.css`: shared styling
