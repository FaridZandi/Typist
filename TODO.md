# Development tasks

The single active development backlog. IDs stay stable when tasks move.
Use Now for at most one active task; Next for ready work; Later for ideas;
Blocked for work waiting on a named decision or dependency; Done for completed work.
Every task records completion criteria and verification. Done requires evidence.
Mention the task ID in implementation commits; record commit hashes when known.
Historical plans remain context: [old backlog](thinking/backlog.md), [roadmap](thinking/roadmap.md), [finding plan](thinking/roadmap-2.md), [stream design](thinking/stream-mode-storage.md).

## Now

## Next

- [ ] TYP-001 Restore remaining finding signals
  Context: Fold the remaining signal types from the old feedback engine into the finding ladder as extra rungs: Shift timing, trigrams, and prefix/suffix word patterns. They were measured and ranked before the ladder replaced that engine, and the aggregates that produced them still exist in `src/aggregates.js`. Recover the wording and thresholds from `src/feedback.js` in the history if needed.
  Done when: The finding ladder includes supported Shift, trigram, and prefix/suffix findings with calibrated thresholds.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md

- [ ] TYP-002 Validate findings against drill outcomes
  Context: Use drill outcomes to test a finding. A drill records its focus and its events, so a later run can ask whether the pattern actually improved — and the app can retract a finding it can no longer support.
  Done when: A focused drill can validate or retract a finding using comparable before/after outcomes.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md

- [ ] TYP-003 Explain or fix the first-character heatmap
  Context: The first letter of the text is never coloured in the letter-speed heatmap; it stays grey no matter how many runs are recorded. Cause: `src/run-engine.js` only records a matched interval once there is a previous matched keypress, so prompt index 0 never gets one and `getAverageLetterWpm` returns `null` forever. It is not a coverage threshold problem, so more practice will not fix it.
  Done when: The first-character display has a documented meaningful timing or unavailable state; repeated runs do not leave an unexplained grey cell.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md

## Later

## Blocked

## Done

- [x] TYP-021 Write and verify the project brief for incoming agents
  Priority: P2
  Order: 1
  Context: New Codex sessions receive a task snapshot but lack project orientation, recent decisions, user preferences, and awareness of other work. Inspect this project and produce its own concise, durable handoff document; do not assume undocumented history.
  Done when: A root PROJECT_BRIEF.md explains the app purpose, supported entry points, how to run it, architecture and internal/external dependencies, data locations and persistence or backup behavior, development and verification commands, current work, and known pitfalls. Record established user preferences and decisions with references; explicitly label uncertainties. Link the canonical TODO.md and AGENTS.md rather than duplicating the backlog. Include a last-verified date and maintenance instructions. Add an AGENTS.md instruction to read and maintain the brief so incoming agents discover it.
  Verify: Check commands, paths, entry points, architecture, dependency ownership, and data claims against current code and configuration. Review planning documents and the current Git state. Ensure references resolve, exclude secrets and personal data, and identify anything that could not be verified. Confirm the brief is concise enough to orient a new agent.
  Notes: Documentation task only: inspect the project before writing. Do not invent user preferences or undocumented decisions. At completion follow the standing agent policy: verify, commit only assignment-related changes with the task ID, and push to the configured upstream; report blockers.
  Evidence: 2026-10-11: Reviewed all four HTML entry points, module imports, package/lockfile, configs, storage and backup implementations, planning documents and Git state. Added a 1,170-word PROJECT_BRIEF.md with referenced policies/decisions, current-work guidance, known pitfalls, explicit uncertainties, last-verified date and maintenance instructions; AGENTS.md now requires reading and maintaining it. All 33 file references resolve; manual review found no secrets or personal practice data. npm test passed 101/101; npm run test:browser passed 13/13 Chromium Stream tests. Python HTTP server on port 8001 returned 200 with appropriate types for /, all four pages, three boot modules and shared CSS; initial sandbox bind restrictions were overcome using approved escalation. git diff --check passed. Existing dependencies/browser were used; installation commands were checked against configuration, not rerun. Hosted deployment, live CDN, Safari/Firefox and physical mobile behavior were not verified; source/config review, not the regression suites alone, establishes the documentation claims. Preserved pre-existing App Manager edits outside the assignment commit.

- [x] TYP-020 Make Word Stream discoverable from the typing page
  Priority: P2
  Order: 1
  Context: The user cannot reach Word Stream through the main typing app and has to type stream.html manually. Add an obvious direct navigation link using the existing app style.
  Done when: A clear Word Stream navigation link is available from the main typing page, with a return route; timed-test behavior and data remain unchanged.
  Verify: Browser navigation and keyboard-focus checks; run existing timed-test regression tests.
  Source: index.html
  Notes: 2026-10-11: User explicitly requested this fix as a task. Reused the existing TYP-020 task and raised it from low to normal priority.
  Evidence: 2026-10-11: Added the header Word Stream link using the existing secondary-link style; retained the existing Typing test return link. npm test passed all 101 tests, including timed-test regressions. Headless Chromium checks passed at 1280×900 and 390×844: visible link and keyboard focus outline, Shift+Tab/Enter and mouse navigation in both directions, no horizontal overflow, completed timed run with virtual timer, byte-for-byte unchanged localStorage after stream practice and return, persisted stream word, and no page errors. Screenshots inspected at both widths; git diff --check passed. Safari/Firefox and physical mobile keyboard checks were not run.

- [x] TYP-004 Show elapsed time as a progress bar above the typing panel.
  Context: Show elapsed time as a progress bar above the typing panel.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-005 Chart speed, accuracy, and consistency over time
  Context: Record speed, accuracy, and consistency per test, and plot their progression over time with a real charting library.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-006 Smooth letter speed with a six-character window
  Context: Send letter speed through a windowed average before recording it — each letter averages itself with the five before it.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-007 Require 50 percent coverage for heatmaps
  Context: Only draw heatmaps for characters seen in at least 50% of runs, so rarely practised stretches cannot distort the range with 0%/100% outliers.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-008 Support per-text metrics and random prompt selection
  Context: Support multiple texts, recording data and metrics per text, with an explicit picker and a random option.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-009 Extract the prompt catalog into its own file
  Context: Move the prompt catalog out of the main script into its own file (now `src/texts.js`).
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-010 Add a basic readme.
  Context: Add a basic readme.
  Done when: The described feature is available in the current app.
  Verify: npm test; verify the affected interaction in the browser.
  Source: thinking/backlog.md
  Evidence: Marked complete in the original backlog; historical completion retained, not newly acceptance-tested.

- [x] TYP-012 Export and restore practice history
  Context: Portable practice history and recovery checks.
  Done when: Valid history restores; malformed imports leave existing history intact.
  Verify: npm test
  Evidence: 90 tests passed on 2026-09-30, including 8 portability tests.
  Commit: b1b54a0
- [x] TYP-011 Decide the stream-practice storage design
  Context: The stream-mode note is a proposal, not a shipped feature. Resolve sampling, typo handling, retention, comparability, and export before implementation.
  Done when: A chosen design and bounded implementation tasks are recorded.
  Verify: Review the decision against existing run history and export formats.
  Source: thinking/stream-mode-storage.md
  Evidence: Design recorded in thinking/stream-v1.md: 70/30 broad/targeted draws, corrected-error scoring, pause exclusion, lifetime word summaries and bounded audit windows, isolated IndexedDB and export/restore.

- [x] TYP-013 Build continuous adaptive word practice
  Context: A separate page streams words, records per-word mistakes including corrected errors, and mixes broad practice with targeted repeats. Keep the timed test independent.
  Done when: Continuous practice, useful word and daily statistics, bounded IndexedDB storage, safe export/restore, and recovery feedback work without changing the timed test.
  Verify: npm test; browser checks for typing/corrections, pause handling, persistence, adaptation, retention, malformed restore, and navigation.
  Source: thinking/stream-v1.md
  Evidence: 2026-10-04: 101 Node/JSDOM tests and 11 Chromium browser checks passed. Browser coverage includes corrected errors, uninterrupted/blur timing, mobile-style input, reload, independent timed data, concurrent writes, adaptive targets, retention, backup buttons, malformed and cancelled restore, transaction rollback, and recovery of 200 queued attempts. New page served successfully on the existing port 8000. Safari acceptance was not run.

- [x] TYP-014 Keep word-stream motion continuous across Space
  Context: The prompt currently removes the completed word and animates its transform back to zero, making upcoming words jump at every Space.
  Done when: Space advances the existing stream left without resetting its coordinate system; trimming old words and rapid typing do not introduce jumps.
  Verify: Browser geometry checks at Space, during in-flight animation, after history trimming, and with reduced motion; existing stream browser suite.
  Source: src/stream/boot.js
  Evidence: 13 Chromium browser checks passed. New geometry regression verifies that upcoming words retain their position at Space, move only left, and do not jump when trimming completed words during an unfinished transition. Reduced-motion behavior and the existing stream workflows also passed.
