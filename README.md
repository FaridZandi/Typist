# Typist

Typist is a small browser-based typing practice project. It currently has three standalone pages:

- `index.html`: a 60-second fixed-text typing test.
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

Mistakes are remembered even if they are later corrected. When a typed space is pressed, comparison realigns to the next expected space so a single missed or extra character does not shift the rest of the run forever. Skipped characters are still counted as mistakes.

Typing history is stored in `localStorage` per prompt text.

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
- `script.js`: typing test logic
- `reaction.html`: reaction test UI
- `reaction.js`: reaction test logic
- `dvorak.html`: standalone Dvorak schematic
- `styles.css`: shared styling
