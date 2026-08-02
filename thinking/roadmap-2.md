# Roadmap 2 — from metrics to a run story

## Why a second roadmap

Roadmap 1 established the typing model, local event records, result summary, heatmaps, rhythm detail, error categories, and early character/transition/word feedback. It also introduced the important safeguards: confidence thresholds, bounded local storage, process versus final accuracy, and clearly approximate cross-text speed comparison.

What remains is not primarily more metrics. It is making the existing and future evidence easy to understand. A finished run should answer:

1. What happened overall?
2. Which events meaningfully shaped that outcome?
3. Where did those events happen in this passage?
4. What is the smallest useful next practice step?

The central rule for this roadmap is: **the result screen tells one main story; the passage provides the evidence; detail remains available without competing for attention.**

## Principles carried forward

- A single event is evidence, not a diagnosis.
- Frequency, impact, and repeated appearance determine whether an event becomes feedback.
- Raw run metrics stay primary. Cross-text speed remains approximate.
- Cross-text aggregation is valuable for comparable units: characters, n-grams, recurring substitutions, and repeated words or patterns.
- The app may show several observations, but only one should lead the result screen and recommendation.
- Every claim needs a sample count, scope, and an honest confidence state.
- Text annotations must help the reader locate evidence without making the passage unreadable.

## Phase 1 — Build a consistent event-to-annotation layer

**Status:** Implemented: category-specific committed errors (substitution, omission, insertion, transposition, duplication, capitalization, and punctuation), corrections, meaningful pauses, run-relative slow transitions, length-normalized slow words, and meaningful pace changes now become selectable run notes that highlight the affected word in the passage. Each annotation carries a word scope, severity, evidence, confidence, and plain-language message.

### Goal

Turn completed-run events into a small, reusable set of annotations that can be placed directly on the run’s rendered passage.

### What it includes

Define a derived annotation record, separate from raw key events. Each annotation should include:

```text
kind                 pause | correction | omission | insertion | substitution |
                     transposition | slow-transition | slow-word | pace-change
scope                character range, word range, transition, or run segment
severity             low | medium | high
evidence             count, duration, slowdown, or error detail
confidence           run-only | learning | supported
message              short plain-language explanation
```

The first set should be deliberately small:

- pauses above the run-relative threshold;
- corrections and remaining committed-word errors;
- omissions, insertions, substitutions, and transpositions;
- slow aligned bigrams compared with the typist’s own run or supported baseline;
- unusually slow words after normalizing for length;
- a meaningful first-third versus final-third pace change.

### UI shape

Keep the top result summary unchanged in spirit: outcome, one observation, one next action.

Add a compact **Run notes** row beneath the recap. It can contain a few quiet, clickable chips such as `2 long pauses`, `3 corrections`, or ``tr`` slowed twice. Selecting a chip focuses or highlights the relevant place in the passage. The run heatmap/passage becomes the evidence surface:

- use a restrained underline, marker, or border rather than a second competing color system;
- show a short explanation on hover and keyboard focus;
- allow one annotation category to be active at a time;
- keep errors visible even when no note is selected.

Do not annotate every ordinary correct character. The passage should remain readable as text first.

### Remaining Roadmap 1 work addressed

- representative examples for error categories;
- meaningful speed/pause annotations rather than an undifferentiated timeline;
- direct passage-level feedback for character, transition, and word evidence;
- a unified observation format across expandable sections.

### Acceptance tests

- A pause, correction, omission, insertion, substitution, transposition, and slow transition each create deterministic annotation records.
- Annotation placement remains correct with extra characters and current-word alignment.
- No-data and low-confidence annotations do not become supported claims.
- Keyboard focus and hover reveal the same explanation.
- Dense passages remain readable when several categories exist.

## Phase 2 — Turn annotations into useful feedback bundles

**Status:** Implemented: primary and secondary feedback bundles now expose observation, interpretation, evidence, practice, and a deterministic priority. Supported character accuracy/substitution, bigram and trigram timing, exact-word errors, and prefix/suffix word-pattern evidence use cross-text coverage where applicable. Up to three secondary bundles are available in a collapsed “Other patterns” section, and a supported prior focus remains primary when its current evidence is still close. A cautious Shift timing hypothesis is included only when coverage is adequate.

### Goal

Study the completed run as a set of events, group related events, and decide what deserves the main story versus secondary detail.

### Feedback bundle model

A bundle is not a raw event. It is a concise explanation built from one or more annotations:

```text
observation      what happened and where
interpretation   cautious possible meaning
evidence         count, scope, confidence, representative locations
practice         one concrete next action
priority         confidence × impact × stability × actionability
```

Examples:

- Several pauses before capitalized words → Shift-related moments may interrupt rhythm → practise a short mixed-case group at a comfortable pace.
- Multiple corrections inside word endings → the run may be getting ahead of reliable control at word ends → repeat short ending-focused groups slowly.
- A supported `tr` slowdown across texts → this transition is repeatedly slower than the personal baseline → practise a small `tr` and `str` group.

### Ranking and display rules

1. Generate many candidate bundles from this run plus supported history.
2. Remove candidates below their evidence threshold from primary recommendation eligibility.
3. Rank remaining candidates by confidence, impact, stability, and actionability.
4. Show one primary bundle at the top.
5. Show up to three secondary bundles in **Run notes** or expandable detail.
6. When nothing clears the threshold, show a neutral “collect another run” story.

The app should never make the user choose among five equally urgent drills. More observations can be useful; more primary recommendations usually are not.

### Cross-text use

Use cross-text aggregation for units that travel well:

- character accuracy and substitutions;
- bigrams and trigrams;
- suffix/prefix patterns when enough comparable examples exist;
- the exact same word when it repeats.

Keep passage-specific observations local: a word’s position, one passage’s unusual vocabulary, and a run’s text heatmap should not be generalized automatically.

### Remaining Roadmap 1 work addressed

- recommendation ranking and tie-break rules;
- stable cross-run character, transition, and word patterns;
- trigrams, prefixes, suffixes, and representative error examples;
- cautious Shift and other technique hypotheses when enough comparable data exists.

### Acceptance tests

- A rare severe event loses to a common supported pattern when its real impact is lower.
- A supported but non-actionable observation does not displace an actionable exercise.
- Cross-text n-gram evidence records its source texts and sample count.
- Low-coverage patterns appear only as learning detail.
- The same candidate set always yields the same primary bundle.

## Phase 3 — Make feedback durable across time

**Status:** Implemented: per-text raw speed, supported bigram progress, and first-to-last-third pacing use three-run windows to distinguish learning, recent improvement, retained improvement after a seven-day follow-up, and a meaningful spaced decline that needs a refresh. Old runs without event records remain visibly limited for pattern claims. New detailed runs preserve the feedback derivation version, source-text IDs, progress snapshot, and primary-feedback snapshot.

### Goal

Show whether a supported issue is improving, retained after time away, or ready for a refresh—without turning normal variation into a verdict.

### Progress states

Use the policy vocabulary consistently:

- **Learning** — evidence exists but is not yet reliable.
- **Supported** — enough coverage exists to show a pattern.
- **Recent improvement** — a recent robust window beats an earlier baseline.
- **Retained improvement** — that improvement appears again after a spaced follow-up (initially at least seven days).
- **Needs a refresh** — later spaced evidence no longer supports the retained state.

Keep per-text raw trends as the default. In All texts, retain raw values and the opt-in approximate normalized series, but do not use normalized speed alone to declare improvement.

### UI shape

Expand the Progress detail into a compact narrative, not another dense dashboard:

- `Recent runs are steadier on this text` with the small evidence window;
- `Your “tr” transition is improving, check again after a week`;
- `This pattern needs a refresh` with one representative location and a practical repeat.

Use timelines and charts as supporting evidence, not as the only way to discover the story.

### Storage and model discipline

- Keep detailed events bounded per text; retain stable aggregates and derivation versions.
- Do not invent rich historical detail for old aggregate-only runs.
- Preserve source text IDs, timestamps, coverage, and model version for each derived progress state.
- Validate any difficulty-model change on held-out runs before making it more prominent.
- Keep the clear-history action comprehensive and local-only by default.

### Remaining Roadmap 1 work addressed

- retention and spaced follow-up;
- fatigue/recovery trends that become meaningful across runs;
- careful long-term normalization;
- recommendation stability rather than run-by-run churn.

### Acceptance tests

- One strong run is not called retained improvement.
- A supported pattern becomes retained only after the spacing rule and adequate follow-up.
- A single poor day is not called regression.
- A later meaningful decline changes a retained pattern to `Needs a refresh` without erasing its history.
- Old runs and missing event records remain visibly limited rather than being backfilled with invented detail.

## Suggested order of work

Start with Phase 1. It is the bridge between the data already collected and the human experience the app lacks today. Phase 2 should follow once annotations are reliable, because recommendations need visible evidence to feel credible. Phase 3 should come last: long-term claims are only as trustworthy as the event and bundle model beneath them.
