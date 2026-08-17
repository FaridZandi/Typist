# Stream mode — what we record, and why

A design note, not a plan. Nothing here is built. It covers a second practice
mode that sits beside the existing 60-second test rather than replacing it, and
the storage shape that mode needs.

See [roadmap-2.md](roadmap-2.md) for the arc this continues, [policy.md](policy.md)
for how findings should be worded, and [backlog.md](backlog.md) for what is queued.

## The mode

No texts, no start button, no timer. A continuous stream of words scrolls
right-to-left through a fixed cursor. You type the character under the cursor;
the text slides one character-width left; the next words arrive from the right.
You stop by stopping. Pause longer than the threshold and recording suspends;
type again and it resumes.

Two properties matter more than the interaction:

**It is a designed experiment, not an observational one.** Because the stream is
generated, we control which pairs appear, in which words, and how often. Today
`transitions.js` corrects for confounds after the fact and is chronically
sample-starved — a movement finding needs 12 scored samples across 3 distinct
words, and a passage you did not choose rarely supplies them. Here we can supply
them on purpose.

**Letter-by-letter scrolling fixes screen position as a constant.** Every
character is typed at the same pixel. Position stops being an uncontrolled
variable, and the visual disturbance moves off the word boundary, which is
exactly where word recognition and onset latency live. The cost is that reading
ahead is harder against drifting text — that is the real tradeoff, and it may
simply feel worse to type even where the data is cleaner.

Scroll behaviour must be a **fixed constant of the mode, not a setting**. If
animation or preview width varies between sessions, history stops being
comparable and the trend line acquires a step nobody can explain. The parameters
are stamped into every session record so future changes are detectable.

## Rules the shape follows

1. **Record atoms, not conclusions.** Our analysis rules keep changing —
   within-word normalisation, hesitation exclusion, motor-class baselines and the
   word-start gate all arrived after data was already being collected. Keeping
   raw samples means every future rule change applies retroactively to the whole
   history. Histograms or running means would freeze old data under the rules we
   happened to hold that month.

2. **Never scan raw events to answer an all-time question.** Today
   `getStoredAnalysisRecords()` flattens every run of every text and hands it to
   `measureTransitions` and every aggregator in `aggregates.js`. That works only
   because the 12-run cap keeps it near 192 records. At 10,000 sessions it is
   ~100 MB to load and clone before a single number appears.

3. **Chunk by time, never one growing list per subject.** A single `"ab"` record
   holding every sample ever means read-modify-writing a growing array on every
   session. Keyed `[pair, period]`, appends touch only today's chunk and
   "ab over the last month" is a range scan of the periods asked for.

4. **Derived data is not stored** unless recomputing it needs a join the store
   cannot do. Motor class, hand, finger and row are pure functions of the pair.
   Per-letter statistics are marginals of the pair store.

5. **Projections are caches, not sources.** The keystroke stream is the only
   atom. Pairs and words are materialised indexes over it, existing because
   IndexedDB cannot index into the middle of a blob. When a rule changes, they
   are dropped and rebuilt, never migrated.

## The stores

| store | key | holds | scanned |
|---|---|---|---|
| `sessions` | `startedAt` | the keystroke stream, columnar | recent window only |
| `pairs` | `[pair, period]` | samples for one movement on one day | by range, per pair |
| `words` | `[word, period]` | onset and execution times | by range, per word |
| `vocab` | `id` | word id ↔ string | loaded whole, small |

`localStorage` keeps what it is good at — settings, and the small aggregate
stores — because synchronous access at boot is genuinely convenient there.

## A worked example

Ten words, typed once, with one hesitation and one corrected typo. Every record
below is real output from a simulation of the projection, not illustrative JSON.

```
practice extra strokes until the rhythm relaxes and control returns
```

### The keystroke stream

Stored columnar. Characters as one string, everything else as parallel arrays —
an array of `{key, time, word, offset}` objects would repeat every key name 69
times.

```json
{
  "startedAt": "2026-08-12T09:14:03.000Z",
  "endedAt":   "2026-08-12T09:14:15.679Z",
  "mode": "stream",
  "stream": { "scroll": "letter", "font": "mono", "preview": 5,
              "source": "common-words@1", "rules": 1 },
  "pauseThresholdMs": 700,
  "keys": {
    "k": "practice extra strokes until the rhythm relaxes and controk\bl returns",
    "t": [0, 150, 285, 432, 601, 755, 901, 1064, 1239, 1411, 1676, 1901, 2151, ...],
    "w": "000000000111111222222223333334444555555566666666777788888888889999999",
    "o": "012345678012345012345670123450123012345601234567012301234566670123456"
  }
}
```

The typo is visible in the stream itself: `controk\bl`. The wrong key, the
backspace, the correction. Nothing needed a separate error record.

The threshold is adaptive — `max(700ms, 2.5 × median gap)` — as the existing code
already computes, so a fast typist and a slow one are treated comparably rather
than both being measured against a flat second.

### Pair samples

One chunk per `[pair, period]`. Today produced 38 distinct pairs:

```
pr ra ac ct ti ic ce ex xt tr st ro ok ke es un nt il th he rh hy yt hm
re el la ax xe an nd co on et tu ur rn ns
```

```json
{"pair":"tr","period":"2026-08-12","sid":"2026-08-12T09:14:03.000Z",
 "t":[2151,3011,10625], "ms":[250,244,276], "base":[225,157,150],
 "word":[1,2,8], "wi":[1,2,8], "o":[2,1,3], "f":[0,0,0]}

{"pair":"th","period":"2026-08-12","sid":"2026-08-12T09:14:03.000Z",
 "t":[5023,7416], "ms":[121,157], "base":[156,162],
 "word":[4,5], "wi":[4,5], "o":[0,3], "f":[2,0]}
```

Field by field: `t` absolute time, `ms` the interval, `base` the within-word
baseline, `word` a vocab id, `wi` the word's index in the session, `o` the
offset inside the word, `f` bit flags (`1` hesitation, `2` at word start).

**`base` is the one derived field worth storing.** Within-word normalisation
compares a movement against the other movements in its own word — and for
`extra` those are `ex`, `xt`, `tr`, `ra`, which live in four different chunks.
Recomputing it later would need a join the pair store cannot do. Everything else
derived is left out.

Note `th` carries `f: 2` on its first sample: it began the word `the`, so it is
confounded with recognising the word and the word-start gate can exclude it
without a second pass.

### Word records

Onset and execution are stored separately, because they measure different
things — reading versus moving. Collapsed into one number they cancel out.

```json
{"word":5,"onsetMs":1594,"execMs":765, "keys":6,"errors":0}   // rhythm
{"word":8,"onsetMs":337, "execMs":1587,"keys":9,"errors":2}   // control
```

Two things fall straight out. `rhythm` shows a 1594 ms onset — the hesitation was
*before* the word, not inside it, which is why zero pair samples were flagged as
hesitations. Pauses live between words. And `control` took 1587 ms to execute
against ~1000 ms for words of similar length, with `errors: 2`: the correction
cost is visible without being asserted.

## What comes out without storing anything more

```
tr        median 250 ms vs within-word baseline 157 ms
          -> 59% slower, 3 distinct words, class same-hand-reach
```

Three distinct words in ten words of typing — the existing
`MINIMUM_DISTINCT_WORDS` gate, met by one short session, which is the whole
argument for the mode.

Letter statistics are marginals, never stored:

```
into x     ex:265  ax:255     n=2
out of x   xt:225  xe:231     n=2
```

Which also shows the problem with per-letter questions. `x` is ~0.15% of English
— roughly 27 occurrences an hour at 60 WPM, so about 30 minutes of typing to
clear a 12-sample gate. `e` is ~12%, around 2,160 an hour. **`e` collects in one
hour what `x` collects in eighty.** One bucket width cannot serve both letters:
the chart has to widen buckets adaptively until each holds enough, meaning the
`x` view shows weeks where the `e` view shows sessions, and it must say which.

Transitions into `x` also span four motor classes on this layout — `ux`, `ix`
same-finger; `ax`, `ox`, `ex` same-hand-reach; `dx`, `hx`, `tx`, `nx`, `sx`
alternating. Averaging them is averaging four different physical acts. "Letter x
performance" is only meaningful as the **column marginal normalised against motor
class**. The raw number is a property of x's neighbours, not of x.

## Size, honestly

The ten-word example costs 85 chars per keystroke, but that figure is an
artefact: chunk scaffolding is paid once per pair per day and there is almost
nothing to amortise it over. Replaying into one day:

```
replays  keystrokes   sessions    pairs    words    total   chars/key
      1           69       1048     4261      589     5898        85.5
      5          345       5236     8585     2941    16762        48.6
     20         1380      20941    25847    11761    58549        42.4
     100        6900     104701   120933    58801   284435        41.2
```

Settling near **41 chars per keystroke as JSON**. At 60 WPM:

- ~725 KB per hour of typing
- ~258 MB for an hour a day for a year
- ~150 MB packed as typed arrays

Against a measured ~10 GB origin budget, comfortable. Against localStorage's
measured ~5 MB hard cap, impossible — which is what actually forces the move to
IndexedDB, more than anything about the existing test mode.

One inefficiency already visible above: `vocab` is repeated in every session
record. It belongs in its own store.

## Open questions

- **Where do the words come from?** A neutral, stationary sampling distribution
  keeps the measurement clean. Feeding more words containing weak pairs teaches
  faster but confounds improvement with exposure and makes the "worst pair" list
  self-referential. Suggestion: neutral by default, adaptive streams tagged as a
  separate mode, so measurement and practice never mix — the rule already applied
  to drills.
- **What happens on a typo?** Backspace, auto-advance, or type-through? Does a
  corrected word still count for word timing? An interval after a correction is
  not comparable to a clean one, and in a continuous stream this comes up
  constantly.
- **How long are sessions retained?** They are the re-derivation source, so
  dropping them forfeits the ability to change rules retroactively. Keeping them
  forever is affordable; the question is whether it is worth it.
- **Does the finding machinery read stream data at all**, or does stream mode get
  its own analysis? Mixing 60-second test runs with continuous practice in one
  measurement seems wrong, but they clearly inform each other.
- **`navigator.storage.persist()` and an export.** The origin is currently
  best-effort and evictable. Persistence should be requested; a JSON export is
  the only real backup, because no browser storage is one.
