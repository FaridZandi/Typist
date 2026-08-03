# Backlog

Carried over from the original `todo` file. See [roadmap.md](roadmap.md) and
[roadmap-2.md](roadmap-2.md) for the larger arc, and [policy.md](policy.md) for
how results should be worded.

## Open

- [ ] Fold the remaining signal types from the old feedback engine into the
      finding ladder as extra rungs: Shift timing, trigrams, and prefix/suffix
      word patterns. They were measured and ranked before the ladder replaced
      that engine, and the aggregates that produced them still exist in
      `src/aggregates.js`. Recover the wording and thresholds from `src/feedback.js`
      in the history if needed.

- [ ] Use drill outcomes to test a finding. A drill records its focus and its
      events, so a later run can ask whether the pattern actually improved — and
      the app can retract a finding it can no longer support.

- [ ] The first letter of the text is never coloured in the letter-speed
      heatmap; it stays grey no matter how many runs are recorded.

      Cause: `src/run-engine.js` only records a matched interval once there is a
      previous matched keypress, so prompt index 0 never gets one and
      `getAverageLetterWpm` returns `null` forever. It is not a coverage
      threshold problem, so more practice will not fix it.

## Done

- [x] Show elapsed time as a progress bar above the typing panel.
- [x] Record speed, accuracy, and consistency per test, and plot their
      progression over time with a real charting library.
- [x] Send letter speed through a windowed average before recording it — each
      letter averages itself with the five before it.
- [x] Only draw heatmaps for characters seen in at least 50% of runs, so rarely
      practised stretches cannot distort the range with 0%/100% outliers.
- [x] Support multiple texts, recording data and metrics per text, with an
      explicit picker and a random option.
- [x] Move the prompt catalog out of the main script into its own file
      (now `src/texts.js`).
- [x] Add a basic readme.
