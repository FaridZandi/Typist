## 1. Define the typing interaction model

I’d make the main prompt panel the typing surface and hide the visible textarea. Under the hood, keep a tiny focused input purely for keyboard/IME capture; it should not be `display: none`, since it still needs to receive focus accessibly.

The prompt itself becomes the active interface:

- completed text is styled by outcome;
- the active word has a clear caret and typed-state treatment;
- extra typed letters appear at the end of the active word;
- the user never sees a separate “Type here” box.

Use a word-buffer model rather than treating the textarea as freely editable text.

- Users type into the current word.
- Backspace may edit only the current word buffer.
- Pressing space commits that word and advances to the next prompt word.
- Space always aligns to the prompt’s following space—even if the user typed too many or too few letters.
- At the end of the timer, the active unfinished word is committed.

This directly supports the desired “extra letters before space” behavior. For example, expected `typing`, entered `typpping`, then space: the word is committed as one attempt, the extra `p`s count as errors, and the next input begins at the next word.

For scoring, align the typed and expected characters within each committed word. This should distinguish:

- substitutions;
- omitted expected characters;
- extra typed characters.

Expected-character heatmaps receive outcomes for their own characters; extras count toward overall accuracy/errors but have no prompt position, so they should not distort the text heatmap.

I would not start with one-word-back editing. It creates tricky questions around already-recorded timing and persistent mistakes. Build current-word editing first; later, if it feels restrictive, add an explicit “reopen previous word” behavior rather than unrestricted caret movement.

## 2. Rework timing and metrics around word commits

The current timing model infers character timing from textarea length, which breaks with edits. Replace it with key-event records associated with the current word buffer.

- Record timestamped keystrokes in the active word.
- On word commit, align keystrokes to expected characters.
- Attribute timing only to matched prompt characters.
- Preserve extra/missing characters in run-level accuracy data.
- Keep “mistakes are remembered” as a deliberate metric: a corrected key within the current word remains a recorded error, while the final rendered letter can show as corrected.

This makes WPM, accuracy, consistency, per-character speed, and heatmaps all describe the same interaction model.

## 3. Add a text catalog and text selection

Represent prompts as a static catalog, rather than one hard-coded joined string:

```js
{
  id: "calm-precision",
  title: "Calm precision",
  body: "...",
  durationSeconds: 60
}
```

The selection UI can offer:

- numbered texts with titles;
- a short preview or word count;
- a `Random` choice;
- a current-text label near the test title.

Random should choose a text when the page loads or a run restarts, then display exactly which text was selected. A completed run must always store its resolved `textId`, never merely `random`.

## 4. Replace typing storage with a versioned schema

Use new storage keys; do not migrate the old format.

Suggested keys:

- `typist-typing-stats-v2` — per-text heatmap and character-speed data, keyed by `textId`
- `typist-typing-runs-v2` — all completed runs, each containing `textId`
- `typist-typing-settings-v2` — selected text or `random` mode, chart filter preference, etc.

Each run should include at least:

```js
{
  textId,
  completedAt,
  wordsPerMinute,
  accuracy,
  consistency,
  typingScore
}
```

Each text’s stats should have its own character array, because prompt positions only have meaning within that exact text.

To start cleanly, delete the existing old typing key or keys matching:

```text
typist-heatmap:*
```

The reaction-mode storage keys do not need to change for this work.

## 5. Make chart scope explicit

Heatmaps always use the active text only. Their title should make that obvious, for example: “Calm precision · character accuracy.”

For Run Progress and Speed–Consistency Tradeoff, add a compact scope control:

- `This text`
- `All texts`

In `All texts` mode:

- include every typing run;
- show text title in tooltips;
- optionally use a subtle color or symbol per text once there are enough texts to justify it.

In `This text` mode, retain the clean single-text trend view. This is likely the default because it makes practice improvement easier to read.

## 6. Redesign the result and chart layouts

The result panel should stop trying to balance a long text heatmap against a small histogram.

Recommended layout:

1. Result heading and key metrics.
2. Full-width “Last run” text heatmap.
3. Full-width histogram beneath it.

This gives both visualizations enough room and removes the uneven two-column silhouette. If a desktop two-column layout is desired later, use equal-height cards with constrained/scrolling heatmap content—not naturally-sized text beside a fixed-height chart.

For the Speed–Consistency Tradeoff:

- remove the square, max-520px wrapper;
- use the full available panel width;
- use a landscape chart height;
- keep a sensible minimum height on mobile.

A scatter plot benefits from width; the current square constraint creates unnecessary empty space.

## 7. Refresh the visual direction

The project could lean into a more expressive “practice instrument” feel:

- stronger typographic hierarchy and less generic card repetition;
- a clearly animated active-word caret;
- subtle progress/rhythm cues while typing;
- distinct but restrained feedback for omission, substitution, extra input, and correction;
- text-selection cards that make each prompt feel like a practice piece;
- charts visually tied to the same accent/feedback palette.

The important design principle: the prompt should feel like the instrument, while analytics feel like the reflection after practice.

## 8. Implement test-first in slices

Suggested implementation order:

1. Introduce text catalog and v2 storage, with existing single-text behaviour preserved.
2. Add text selection, random selection, and `This text` / `All texts` chart filters.
3. Replace textarea-driven alignment with a word-buffer engine.
4. Move visible typing feedback into the prompt panel and hide the input affordance.
5. Rework result/chart layouts and visual styling.
6. Add tests for word commits, extra characters, omissions, backspace within a word, timeout with an unfinished word, per-text persistence, random selection, and chart filtering.

The key decision I’d lock in before implementation is: **current-word-only editing, with space as the commit-and-realign action.** It gives the app predictable metrics and achieves the typing behavior you described without turning it into a general text editor.