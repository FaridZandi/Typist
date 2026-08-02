# Typist feedback and analysis roadmap

## Current implementation baseline

The following work is already implemented and should **not** be treated as future roadmap scope:

- Word-buffer typing with a hidden keyboard-capture input and a visible prompt surface.
- Current-word-only Backspace, Space-based word commits, visible caret, correction feedback, omissions, and persistent extra-character feedback.
- Per-text prompt catalog, explicit text selection, random selection, stable text IDs, and text-specific heatmap data.
- Versioned v2 typing storage, legacy heatmap-key cleanup, and per-text versus all-text chart scope.
- A separate test view and results view; completion automatically changes to the results view and Restart returns to the test view.
- Combined/tabbed heatmaps and trends, run-specific heatmap and histogram, responsive layout refinements, and an end-of-page history control.
- All-key inter-key timing for consistency, while matched prompt characters still supply character-speed heatmaps.
- A bounded v3 per-text analysis record for recent runs, including key events, committed-word alignment, error categories, and derived session summaries.
- A calmer in-run view (live performance metrics hidden) and a result summary with gross/effective speed, final/process accuracy, completion time, pauses, consistency, one observation, and one practice suggestion.
- A JSDOM regression suite covering the established interaction, persistence, chart-scope, and reaction-test behaviours.

The sections below preserve the rationale for these foundations, but they are marked as completed so the remaining roadmap begins with the feedback and analysis work in section 9.

## 1. Completed foundation: typing interaction model

The main prompt panel is the typing surface and the visible textarea is hidden. A tiny focused input captures keyboard and IME events without using `display: none`, so it remains focusable and accessible.

The prompt itself becomes the active interface:

- completed text is styled by outcome;
- the active word has a clear caret and typed-state treatment;
- extra typed letters appear at the end of the active word;
- the user never sees a separate “Type here” box.

The implemented interaction uses a word-buffer model rather than treating the textarea as freely editable text.

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

One-word-back editing remains intentionally out of scope. It would create difficult questions around already-recorded timing and persistent mistakes; if it is added later, it should be an explicit “reopen previous word” action rather than unrestricted caret movement.

## 2. Completed foundation: timing and word commits

The implemented timing model records key events associated with the current word buffer rather than inferring character timing from textarea length.

- Record timestamped keystrokes in the active word.
- On word commit, align keystrokes to expected characters.
- Attribute timing only to matched prompt characters.
- Preserve extra/missing characters in run-level accuracy data.
- Keep “mistakes are remembered” as a deliberate metric: a corrected key within the current word remains a recorded error, while the final rendered letter can show as corrected.

This makes WPM, accuracy, consistency, per-character speed, and heatmaps all describe the same interaction model. Consistency now uses every captured key press rather than only matched characters; the richer event persistence proposed later is still future work.

## 3. Completed foundation: text catalog and selection

Prompts are represented as a static catalog rather than one hard-coded joined string:

```js
{
  id: "calm-precision",
  title: "Calm precision",
  body: "...",
  durationSeconds: 60
}
```

The selection UI provides:

- numbered texts with titles;
- a short preview or word count;
- a `Random` choice;
- a current-text label near the test title.

Random should choose a text when the page loads or a run restarts, then display exactly which text was selected. A completed run must always store its resolved `textId`, never merely `random`.

## 4. Completed foundation: versioned v2 storage

The app uses new v2 storage keys and does not migrate the old format.

Suggested keys:

- `typist-typing-stats-v2` — per-text heatmap and character-speed data, keyed by `textId`
- `typist-typing-runs-v2` — all completed runs, each containing `textId`
- `typist-typing-settings-v2` — selected text or `random` mode, chart filter preference, etc.

Each stored run includes at least:

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

On startup, the app deletes legacy typing keys matching:

```text
typist-heatmap:*
```

The reaction-mode storage keys do not need to change for this work.

## 5. Completed foundation: chart scope

Heatmaps use the active text only. The current test selection establishes their text context.

Run Progress and Speed–Consistency Tradeoff use the compact scope control:

- `This text`
- `All texts`

In `All texts` mode, the app:

- include every typing run;
- show text title in tooltips;
- optionally use a subtle color or symbol per text once there are enough texts to justify it.

In `This text` mode, the app retains the clean single-text trend view; this is the default because it makes practice improvement easier to read.

## 6. Completed foundation: result and chart layouts

The result panel no longer tries to balance a long text heatmap against a small histogram.

Implemented layout:

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

## 7. Partially completed: visual direction

The project could lean into a more expressive “practice instrument” feel:

- stronger typographic hierarchy and less generic card repetition;
- a clearly animated active-word caret;
- subtle progress/rhythm cues while typing;
- distinct but restrained feedback for omission, substitution, extra input, and correction;
- text-selection cards that make each prompt feel like a practice piece;
- charts visually tied to the same accent/feedback palette.

The important design principle remains: the prompt should feel like the instrument, while analytics feel like the reflection after practice. The active caret, prompt feedback, tabbed analytics, and compact spacing are implemented; the future visual work is the coaching-oriented result screen described below.

## 8. Completed foundation: test-first slices

Completed implementation order:

1. Introduce text catalog and v2 storage, with existing single-text behaviour preserved.
2. Add text selection, random selection, and `This text` / `All texts` chart filters.
3. Replace textarea-driven alignment with a word-buffer engine.
4. Move visible typing feedback into the prompt panel and hide the input affordance.
5. Rework result/chart layouts and visual styling.
6. Add tests for word commits, extra characters, omissions, backspace within a word, timeout with an unfinished word, per-text persistence, random selection, and chart filtering.

The key decision is now implemented: **current-word-only editing, with Space as the commit-and-realign action.** It gives the app predictable metrics and achieves the typing behavior described here without turning it into a general text editor.

## 9. Evolve the feedback model from scores to coaching

### Product principle

The app should not merely say whether a run was fast or accurate. It should help a typist understand *what happened*, *what likely caused it*, and *what to try next*.

Every substantial piece of feedback should follow the same pattern:

> **Observation → interpretation → recommended practice**

For example:

> You pause markedly before capital letters → Shift combinations are interrupting your rhythm → practise short mixed-case words while alternating Shift keys.

The interpretation must be framed as evidence-based guidance, not a diagnosis. Timing can suggest a habit; it cannot prove hand position, finger choice, posture, or intent.

### Feedback priorities

1. Make the typing surface calm and legible while a run is in progress.
2. Make the first result screen useful in a few seconds.
3. Put detailed analysis behind progressive disclosure.
4. Prefer a small, confident recommendation over a long list of weak possibilities.
5. Separate insufficient data from a genuinely strong or weak pattern.

## 10. In-run experience: immediate feedback without performance pressure

Already implemented: the prompt is the main typing surface and it shows correct, incorrect, corrected, omitted, extra, active-word, and caret feedback. The remaining in-run change is to reduce metric pressure.

During a run, the visible interface should show only feedback that helps the next action:

- correct characters;
- incorrect characters;
- corrected characters;
- omitted characters once a word is committed;
- extra characters that remain visible after the word is committed;
- the current word and caret;
- a discreet elapsed-time/progress indicator.

Implemented: live WPM, score, and other performance stat cards are hidden during a run, leaving the prompt and discreet progress indicator. A future optional “show live metrics” preference may expose provisional values for people who explicitly want them.

The active input model should continue to record each key press, including mistakes, extra characters, Backspace, and Space. The visual prompt can remain word-oriented, while the event record remains key-oriented.

## 11. Session event record and alignment model

Richer feedback needs a durable per-run event record before it needs more charts. Store enough information to reconstruct both the final text outcome and the typing process.

Suggested event shape:

```js
{
  type: "character" | "space" | "backspace",
  key: "t",
  timestampMs: 1842.3,
  wordIndex: 6,
  bufferOffset: 2,
  expectedCharacter: "r" | null,
  modifiers: { shift: false, alt: false, ctrl: false, meta: false }
}
```

Implemented foundation: each completed run now persists a bounded v3 key-event record (including actual Shift/Alt/Ctrl/Meta state) plus a Damerau-Levenshtein-style committed-word alignment. It distinguishes substitutions, insertions, omissions, adjacent transpositions, capitalization, punctuation, and duplicated insertions. Keep both of these views:

- **process view** — every key event, deletion, pause, correction, and final word commit;
- **final-text view** — the aligned state of the committed word after any permitted corrections.

This separation prevents final accuracy from hiding a difficult or correction-heavy process.

## 12. Headline session results

Implemented foundation: the result view now includes gross/effective WPM, final/process accuracy, completion time, pauses, consistency, corrected-versus-remaining errors in its observation, and one rule-based recommendation. The run heatmap and histogram remain below that summary. The remaining work is confidence-based interpretation and progressive disclosure.

### Headline metrics

Show these measures with short definitions or tooltips:

- **Gross WPM** — all entered printable characters divided by five, per minute; this reflects raw output rate.
- **Effective WPM** — correctly produced expected characters divided by five, per minute; this reflects useful output rate.
- **Final accuracy** — correctness of committed text after permitted corrections.
- **Process accuracy** — correctness before corrections, including inserted and deleted errors.
- **Completion time** — time from the first accepted key press to completion or timeout.
- **Pauses** — count and duration of unusually long inter-key gaps.
- **Consistency** — variability of inter-key intervals across every captured key press, independent of whether those keys matched the text.

Corrected errors should be reported separately from errors left in final text. A clear summary could read:

> 96% final accuracy · 89% process accuracy · 7 corrected errors · 3 remaining errors

This rewards recovery without pretending the run was effortless.

### First-screen structure

Order the result view as follows:

1. **Headline metrics** — gross/effective WPM, final/process accuracy, completion time, consistency.
2. **One important observation** — the strongest sufficiently supported pattern from this run.
3. **One recommended exercise** — a short, specific next action tied to that observation.
4. **Run-specific visual recap** — the existing text heatmap and speed distribution, if they reinforce the observation.
5. **Expandable detail sections** — speed timeline, keyboard/transition analysis, word analysis, error categories, and long-term trends.

Avoid presenting more than one primary observation and one primary exercise until the user chooses to explore detail.

## 13. Speed over time, pauses, and fluency

Implemented foundation: consistency uses every captured inter-key interval, v3 retains the event record, and the result screen has an expandable inter-key speed timeline. It highlights the pause threshold, reports observed post-error recovery time, and compares the first and final thirds of the run. Burst analysis and repeated-pattern confidence remain future work.

### Measurements

- rolling effective WPM over a small event or time window;
- inter-key interval for every captured key;
- rolling median interval, which is less distorted by a single long pause;
- pause count, pause duration, and pause location;
- recovery time after an error or Backspace;
- burst length: consecutive key presses within a stable rhythm range;
- hesitation at spaces and at the first character of a new word.

A pause should be relative to the typist as well as bounded by an absolute floor. For example, flag an interval only when it exceeds both a minimum duration and a multiple of the run’s rolling median. This avoids calling naturally slow typists “paused” on every key.

### Interpretation examples

- Speed falls gradually in the final third → possible fatigue or loss of attention.
- A sharp pause precedes the same transition repeatedly → likely transition-specific hesitation.
- Errors are followed by several erratic intervals → recovery is disrupting fluency.
- Fast bursts alternate with large pauses → the typist may be rushing ahead of reliable control.

The chart should annotate only meaningful events—long pauses, errors, or section boundaries—not every key press.

## 14. Character-level weaknesses with confidence

Implemented foundation: the Keyboard and transitions detail now aggregates expected-character attempts across recent runs for the active text, showing process accuracy, available inter-key speed, common substitutions, and the same 12-attempt learning/supported state. It deliberately surfaces data rather than declaring a weak key; percentile speed, hesitation relative to baseline, corrected-error rate, and confidence intervals remain future work.

For every expected character, track:

- attempts and coverage;
- final-text accuracy;
- process accuracy;
- median and percentile speed;
- hesitation time relative to the typist’s baseline;
- corrected-error rate;
- common substitutions and the number of times each occurs.

Do not rank a key as weak from a small sample. Every character card or keyboard key should carry a confidence state:

- **No data** — no attempts.
- **Learning** — below a minimum sample threshold; show observations but no conclusion.
- **Supported** — enough attempts to compare against the typist’s own baseline.
- **Strong pattern** — enough attempts and a sufficiently large, stable deviation to recommend practice.

The threshold should depend on the metric. Accuracy needs fewer samples than speed variance; a sensible first implementation can use a fixed minimum such as 12–20 attempts, then evolve to confidence intervals or Bayesian shrinkage toward the user’s overall baseline.

## 15. Key transitions and sequences

Implemented foundation: the result screen aggregates correctly aligned adjacent-character transitions across the bounded recent v3 runs for the active text. It applies a 12-sample confidence threshold, labels lower coverage as learning, reports inter-key speed, and can make a supported high-slowdown transition the one focused recommendation. Trigrams, richer impact ranking, and layout-based movement inference remain future work.

Character statistics alone cannot reveal whether the problem is a key or the movement into it. Record transition data for adjacent expected characters when both can be aligned to key events.

Track, at minimum:

- bigram and trigram frequency;
- median interval and hesitation rate by transition;
- error rate by transition;
- repeated-letter transitions such as `ll`;
- common suffixes such as `ing`, `tion`, and `ed`;
- row jumps, same-finger movements, and hand alternation where the keyboard layout supports those inferences.

Rank transitions by a blend of impact and confidence:

```text
impact = frequency × (slowdown from personal baseline + excess error rate)
```

This ensures a rare difficult pair does not outrank a common pair that costs meaningful time every run.

Surface a transition only when it has adequate coverage and a practical explanation, for example:

> `tr` is 34% slower than your typical letter-to-letter transition across 28 samples → practise short `tr` and `str` word groups at a controlled pace.

## 16. Word-level feedback

Implemented foundation: the result screen now aggregates committed-word errors and length-normalized timing across the bounded recent runs for the active text. It uses a four-observation learning/supported threshold. Prefixes/suffixes, vocabulary familiarity, and transition-normalized difficulty remain future work.

At word commit, store final alignment, process errors, elapsed duration, and normalized duration.

Useful word-level measures include:

- final and process error rate;
- median duration per character;
- pauses before the word and inside it;
- correction count;
- whether the word’s difficulty comes from one transition, a prefix, a suffix, capitalization, or punctuation.

Avoid treating unfamiliar vocabulary as a pure mechanical weakness. Compare a word against:

- its character length;
- the measured difficulty of its transitions;
- its frequency in the app’s text catalog or an optional word-frequency source;
- the user’s prior experience with that same word or pattern.

Group useful recurring patterns:

- prefixes: `re`, `con`, `trans`;
- suffixes: `ing`, `tion`, `ment`;
- repeated letter patterns;
- capitalization and punctuation variants.

Word feedback should identify a pattern, not shame a one-off word:

> Words ending in `tion` are consistently slower even after accounting for length → focus on the `ti` to `on` transition rather than memorizing a single word.

## 17. Error taxonomy

Classify committed-word alignment outcomes into explicit categories:

- **substitution** — one expected character replaced by another;
- **omission** — an expected character skipped;
- **insertion** — an extra typed character;
- **transposition** — adjacent expected characters reversed;
- **duplication** — an unintended repeated character;
- **capitalization** — correct base character with incorrect case;
- **spacing** — missing, early, late, or extra word boundary;
- **punctuation** — missing, substituted, or misplaced punctuation;
- **correction** — an error later removed or replaced within the permitted edit window.

One physical event can contribute to more than one summary only when that relationship is clear. For example, an inserted repeated letter should count as an insertion and be labelled a duplication subtype, not counted as two unrelated mistakes.

Implemented foundation: the expandable Errors section shows the categories present in the completed run, while the headline separates corrected and remaining errors. Future work is category rates, representative examples, and the explanatory guidance below.

Show categories by count and rate, with a short “what this often means” description:

| Pattern | Possible interpretation | Practice direction |
| --- | --- | --- |
| Frequent substitutions | Key targeting or finger precision may be unstable | Slow targeted key groups |
| Omissions near word endings | Rhythm may be running ahead of control | Deliberate word-end practice |
| Duplications | Release timing may be inconsistent | Repeated-letter drills at a lower pace |
| Transpositions | Sequence planning may be ahead of execution | Short ordered-pair practice |
| Spacing errors | Word-boundary rhythm may be unstable | Phrase typing with deliberate spaces |

## 18. Technique feedback as cautious inference

Implemented foundation: the Keyboard and transitions detail compares captured Shift-modified character timing with lowercase timing only after both have eight samples. It presents the comparison as a supported or learning observation, never as proof of finger technique. Pinky, row-jump, same-finger, and hand-pattern inference remain future work.

Technique feedback should never claim certainty from timing alone. Phrase it as a possibility and state the evidence.

Potential observations include:

- persistent slowdown on pinky-associated keys;
- slow or error-prone Shift combinations;
- unusually high Backspace use;
- recurring same-finger transition slowdowns;
- row-jump hesitation;
- differences between left- and right-hand patterns where the layout mapping is known.

Use language such as:

> Capital-letter transitions are slower than your lower-case baseline. This may indicate that Shift coordination is interrupting your rhythm.

Then offer a testable exercise rather than a correction presented as fact:

> Try a short mixed-case drill, alternating the Shift key when comfortable, and compare the next three runs.

## 19. Long-term progress and normalization

Long-term history should preserve raw results while adding comparable measures.

Track across sessions:

- gross/effective WPM;
- final/process accuracy and correction rate;
- consistency, pauses, and recovery time;
- recurring character, transition, word, and error-category patterns;
- fatigue slope within runs;
- retention: whether a weakness improves and remains improved after time away.

Implemented foundation: completed runs retain a clearly approximate normalized effective-WPM value based on a deterministic catalog difficulty multiplier. Raw WPM remains the primary displayed metric; this stored value is not presented as a precise equivalence between passages. The initial multiplier uses the following catalog-visible signals:

- length and punctuation density;
- capitalization rate;
- character and transition difficulty from population-independent catalog weights;
- the typist’s own historical performance on those characters and transitions.

When the Trends scope is **All texts**, the progress chart offers this series as `Approx. normalized WPM`; it remains opt-in through the chart legend and explicitly qualified.

Until the model is trustworthy, label cross-text comparisons as approximate and favor per-text trends. Never imply that a difficult passage result is directly equivalent to an easy-passage result without qualification.

## 20. Recommendation engine

Implemented foundation: the result view selects one short recommendation from meaningful pauses, a supported slow transition, correction-heavy process, remaining errors, or a controlled-run fallback. The transition path is coverage-gated; the remaining recommendation ranking and cross-run stability work below remains future scope.

Recommendations should be short, specific, and scarce. Produce one primary recommendation from the highest-confidence, highest-impact limitation.

### Recommendation selection

1. Exclude patterns below their coverage threshold.
2. Compare each supported pattern against the typist’s personal baseline.
3. Score candidates by frequency, severity, stability across recent runs, and expected usefulness of a drill.
4. Prefer a pattern that is both actionable and likely to matter in ordinary text.
5. Present one recommendation; optionally offer one secondary observation in expanded detail.

### Recommendation format

```text
Observation: `ing` sequences are 27% slower than your typical transitions.
Interpretation: The `i` → `n` → `g` movement is interrupting otherwise steady rhythm.
Practice: Type three short `-ing` word groups slowly, then repeat at a comfortable pace.
```

Recommendations should include a measurable follow-up when possible: “repeat three runs,” “keep process accuracy above 95%,” or “compare the next 20 occurrences.” Avoid generic advice such as “practise more” or “type faster.”

## 21. Result-screen information architecture

The results screen and its automatic view transition are already implemented. Progressive disclosure, coaching content, and expandable detail sections are not yet implemented.

### Always visible

- gross/effective WPM;
- final/process accuracy;
- completion time, pauses, and consistency;
- one observation;
- one recommended exercise;
- a compact run-specific visual recap.

### Expandable sections

1. **Speed and rhythm** — implemented basic inter-key speed-over-time and pause summary; recovery after errors and burst analysis remain.
2. **Keyboard and transitions** — implemented per-run timed bigram observations; key confidence, substitutions, cross-run difficulty ranking, trigrams, and layout-based hints remain.
3. **Words and patterns** — implemented per-run committed-word review; cross-run slow/mistyped patterns, prefixes, suffixes, and normalized difficulty remain.
4. **Errors** — implemented category breakdown; representative examples remain.
5. **Progress** — per-text and all-text trends, retention, and normalized comparison where supported.

Collapsed sections should still advertise their value with one short summary, such as “3 supported transition patterns” or “Spacing accounts for 40% of process errors.”

## 22. Storage, privacy, and implementation phases

The existing v2 aggregate storage supports current text-specific statistics and run history. The app also now has a bounded v3 analysis store for recent event records; older v2 runs intentionally are not reinterpreted as detailed analyses.

Suggested additions:

- `typist-typing-analysis-v3` — bounded recent run event records and derived per-text summaries (implemented; currently retains the most recent 12 runs per text);
- `typist-typing-runs-v3` — extended run summaries with process/final metrics and difficulty metadata;
- `typist-typing-settings-v3` — feedback preferences, expanded result sections, and optional live-metric preference.

Keep raw event history bounded—for example, retain detailed events for the most recent N runs per text while retaining aggregates indefinitely. State clearly that all analysis is local to the browser unless that changes in a future product decision.

Implement in measured phases:

1. **Completed foundation** — event record, process vs final metrics, error taxonomy, pause and all-key consistency.
2. **Partially completed session feedback** — headline results, one observation, and one recommendation are implemented; expandable result sections remain.
3. **Transition and word analysis** — confidence thresholds, bigrams/trigrams, word normalization, substitutions.
4. **Long-term model** — retention, fatigue trends, cross-text difficulty normalization, recommendation ranking.
5. **Technique hypotheses** — only after the underlying timing and confidence model has enough evidence.

Every phase should add deterministic tests for event ordering, alignment classifications, correction accounting, confidence thresholds, recommendation selection, and storage bounds. Use representative sequences for substitutions, omissions, insertions, transpositions, repeated letters, spacing, punctuation, and mixed case.
