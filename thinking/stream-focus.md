# Difficulty focus policy (TYP-023)

Verified design: 2026-10-31. `wordProbabilities` in `src/stream/model.js` is the
single source of probabilities for the sampler, SVG/table preview and word
cloud. The plot uses native SVG; the cloud uses the local D3/d3-cloud stack
documented in [vendor ownership](../vendor/README.md).

For focus t in [0,1], use P(w) = (1-a) B(w) + a H(w), a = 0.6t.
The default t=.5 retains the previous 30% targeted share, though the broad and
targeted distributions themselves have changed. H weights eligible supported
trouble words by r^(-beta), beta=.5+1.5t, normalized over eligible targets.
Here r is the eligible target rank, not the displayed practiced-vocabulary rank.
Supported trouble keeps the existing three-attempt/two-recent-miss gate and
smoothed trouble score. If no target is eligible, a=0.

B reserves half its mass uniformly for eligible unseen words, half uniformly
for eligible practiced words. If one group is empty, the other gets all of B.
Thus discovery receives 50%, 35%, 20% at low/default/high focus when both groups
and targets exist. Every eligible practiced word retains nonzero broad mass.
At high focus, the hardest versus second-hardest target has a 4:1 targeted
weight ratio, versus about 1.41:1 at low focus (where target mass is zero).
These endpoints are product calibration, not empirically validated learning
optima: a clear focus change while protecting discovery and ordinary practice.

Exclude the last five generated words before constructing B and H. If all
candidates are excluded, release only the least recently generated candidate.
If unseen words exist but all are excluded, release the oldest unseen word to
preserve the discovery floor.
A one-word pool necessarily repeats. Larger pools cannot be guaranteed a finite
maximum waiting time by a stochastic sampler, but every eligible word has
positive probability and cooldown prevents immediate repeated hard-word loops.

Display all practiced vocabulary words sorted by trouble score descending,
then ASCII alphabetical order. Sparse/clean evidence scores zero and is labeled
“no established trouble”, not asserted to be a reliable difficulty estimate.
At the user's request, the plot evaluates the same probability calculation
with an empty recent-word list: a projection before cooldown, explicitly labeled
in the popup. It shows a continuous curve without temporary exclusions; word
values and unseen mass all use that same projection. Actual draws retain the
last-five exclusion policy above. The y value is the full marginal P(w) of this
projection, never the score or H alone. Rank uses a logarithmic x-axis
with 1–2–5 ticks and the final rank, spreading out the hardest words; probability
remains linear. Mouse departure dismisses the popup even with slider focus,
while keyboard focus and touch preview remain available. Values round to two decimals
in percent; chart coordinates use unrounded probabilities. Unseen words are
not ranked; their combined mass and remaining count are shown separately.
An empty history has no rank curve and 100% unseen mass. An exhausted unseen
pool shows 0% discovery. A singleton is a point. The scrollable ranked list
provides every word/value without needing a mouse tooltip.

The hard-word cloud receives the very same before-cooldown distribution object
as the plot, filtered to words with supported trouble. To make concentration
visible, font size compares full global probability P with the same word's
exploration baseline B (the broad distribution before mixing in targeting).
`wordProbabilities` exposes B as `baselineProbability`; this adds no sampling
rule and does not renormalize among displayed words. With r=P/B, font size is
`9 + (max - 9) * r^2 / (r^2 + k)`, k=(max-neutral)/(neutral-9). Neutral/max are
28/84px desktop and 22/64px compact. Equal-to-baseline probabilities give neutral
sizes. The squared ratio exaggerates concentration: likely words grow toward
the maximum while less-likely words shrink toward 9px. The previous absolute
square-root mapping hid tail changes close to its 13px floor. Size and area are
therefore intentionally not literal probability encodings; tooltips keep the
full projected percentage to two decimals.

Long words and dense clouds get a common fit scale (including a padded text-area
estimate at 55% of the viewport), followed by a final 9px floor. The library
rounds sizes to integers. Slider input is coalesced to the latest value per
animation frame with 80ms linear transitions, so it updates while dragging,
rather than repeatedly restarting a slow easing curve. Recorded outcomes retain
420ms animation; reduced motion skips transitions. Cached anchors stay in use,
with local collision adjustments when the larger text needs room. Practice-set
mode still overrides sampling and disables the control.

The preview uses current tab summaries and preference before cooldown; it is
not the effective next-draw distribution or a forecast of the next completion's
unknown outcome. Completion can
change summaries before the next draw. Already-buffered words remain unchanged.
Changing focus never records a word, resets the renderer or replaces the queue.
Keyboard focus on the control preserves the current attempt; normal long-pause
and visibility timing exclusions still apply. The practice-set path exclusively
overrides normal draws, disables focus, and never saves practice outcomes.

The preference is localStorage `typist-stream-focus-v1`, not IndexedDB history;
Stream backup/restore does not replace it. It is tab-local when storage fails,
with a visible warning. It is not synchronized across already-open tabs.
The sampler still uses existing cached history and trouble evidence: TYP-016
cross-tab synchronization, TYP-017 early follow-up and TYP-018 age/clean-streak
retirement remain separate work. Broad accuracy is no longer uniform over the
vocabulary: its discovery/practiced split changes with pool availability.

Verification uses synthetic histories and 60,000 seeded fixed-state draws per
low/default/high setting. Each marginal frequency must fall within six binomial
standard errors plus .001 absolute probability of its displayed distribution.
This validates sampling agreement, not educational effectiveness. Browser tests
cover interaction, persistence, exact labels, input/track preservation and the
exclusive practice override; existing Stream motion and storage regressions run
alongside them. Physical touch devices, Safari, Firefox and screen-reader output
remain unverified.
