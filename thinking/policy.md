# How Typist should talk to people

Typist should feel like a thoughtful practice partner, not a dashboard that grades someone all day.

The point is simple: after a test, the app should help the user understand what happened and choose one useful thing to try next.

## Tell one story, not every possible story

The first result screen should be easy to read in a few seconds.

It should say:

1. **How did the run go?** Show the important basics: speed, accuracy, consistency, time, and pauses.
2. **What most affected it?** Pick one useful observation, such as several pauses, many corrections, or a transition that was repeatedly slow.
3. **What might explain that?** Be careful. Say “this may have disrupted your rhythm,” not “you use the wrong finger.”
4. **What should the user try next?** Give one short exercise or suggest another calm run.

Everything else belongs behind expandable sections. A chart or metric is useful only if it helps answer a natural follow-up: where did this happen, how often, how sure are we, and what can I do about it?

If Typist does not have enough evidence, it should say so. “Try this piece again; I need more examples” is much better than making up a weakness.

## Start with events, then look for patterns

After every run, Typist should ask a simple question about each kind of event: **did this happen, where, and how often?** Examples include a long pause, a correction, an extra character, an omission, a difficult letter pair, a slow word ending, or a change in pace near the end.

One event is not automatically feedback. It may be a slip, an unfamiliar word, or ordinary variation. But a frequent event—or one with a large enough effect—can become a useful observation. Over several runs, the app can decide whether it is still learning, supported by enough examples, or improving.

The result screen may show more than one observation, but they should have different jobs:

- one primary story and one recommended next step at the top;
- a small set of secondary observations in expandable detail;
- direct markings on the typed text when the text itself explains the event best.

The passage is often the best evidence surface. Highlight a pause before a word, a repeatedly slow transition, an omitted letter, or a corrected error where it happened. A person should be able to move from “this was a problem” to “I can see the exact place it happened” without decoding a separate chart.

Text annotations should be quiet and explainable. They should use the same visual language as the prompt feedback, reveal detail on hover or focus, and avoid colouring every character until the passage becomes unreadable.

## Comparing different texts

Raw results are always important. If someone types 55 WPM, that should stay visible exactly as it is.

Different texts are not equally hard, though. Capitals, punctuation, long words, unusual letter pairs, and unfamiliar vocabulary can all slow a person down. So an all-text trend can offer an **approximate normalized WPM** as an optional extra. It must stay clearly labelled as approximate; it is not a universal measure of typing ability.

For judging progress on speed, compare the same text whenever possible. For learning about typing patterns, combining data from different texts is often helpful:

- a character typed incorrectly in many texts is more meaningful than one mistake in one passage;
- a slow `tr` or `ing` pattern becomes more convincing as it appears in more places;
- the same word or word pattern can become useful evidence after it occurs repeatedly.

Keep the context. A pattern should always carry its sample count and the texts it came from. A rare word may simply be unfamiliar; that is different from a recurring mechanical difficulty.

## Progress takes time

One good run is encouraging, but it is not proof that a skill has stuck.

Use simple language for the stages of evidence:

- **Learning**: there is some data, but not enough to draw a strong conclusion.
- **Supported**: the pattern has enough examples to be worth showing.
- **Recent improvement**: recent runs are meaningfully better than earlier ones.
- **Retained improvement**: that improvement still appears after time away.
- **Needs a refresh**: later evidence suggests the improvement is no longer holding.

For the first version, “retained” should require a later check after at least a week. Look at small groups of runs, not a single personal best or a single bad day. A bad day is not a regression by itself.

## Recommendations should be scarce

Give one main recommendation, not a list of everything the app noticed.

Choose it because it has enough evidence, happens often enough to matter, has been reasonably steady, and leads to a practical exercise. A common small problem is usually worth more than a rare dramatic one.

Prefer accuracy and recovery before urging more speed. If someone typed quickly but made many errors or spent a lot of time correcting them, the next step is probably a calmer pace—not “go faster.”

Use the same shape everywhere:

> **What happened** → **what it may mean** → **what to try**

For example: “`tr` was slower than your usual transition in 18 examples” → “that movement may be breaking your rhythm” → “try a few short `tr` words slowly, then repeat them comfortably.”

## Be honest about what the app knows

Typing events can show timing, corrections, mistakes, and repeated patterns. They cannot prove posture, finger choice, attention, or ability.

The app should show how much evidence supports a claim. Missing, sparse, or non-comparable data is not bad performance. Timing feedback may not make sense for an IME, assistive device, or accessibility workflow; in those cases, Typist should avoid timing conclusions.

Correcting an error is good, and the app should acknowledge that. It should also keep the process visible: a final clean word can still have taken extra effort.

## Respect the user and their data

Keep analysis local by default. Keep detailed event history only for a limited recent set of runs, keep long-term summaries separately, and let the user clear all of it easily.

Users should be able to look behind any recommendation, or ignore coaching and focus on raw results. If the app ever adds more live metrics or stronger coaching, the calm, low-pressure experience should remain the default.

The numbers and thresholds in this document are starting points, not laws of typing. Keep them visible, versioned, and tested. Change them only when the change makes feedback more useful and more honest.

Before adding a new metric, ask: does it help someone make a better next decision? If not, it probably does not belong in the interface.
