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

- [x] TYP-024 Add an animated live hard-word cloud
  Priority: P2
  Order: 1
  Context: User wants a word cloud above the existing hard-word table, sized by difficulty rank with hardest words largest. Use a library with animated live updates rather than building layout/animation from scratch. Research compared ECharts wordcloud (recreates words) with d3-cloud layout plus D3 keyed transitions; choose the latter for persistent animated word updates and permissive licenses, served locally.
  Done when: A compact cloud above the table shows supported hard words, sized by stable difficulty rank. Recorded outcomes update it live with animated entry, exit, movement and size changes; unchanged ranks do not trigger pointless relayout. Empty/single/dense history, narrow screens and reduced motion work. Unrecorded practice leaves it unchanged. Library versions/licenses and reproducible local asset ownership are documented. Existing practice controls and stream input/motion remain functional.
  Verify: Synthetic histories check rank order/font size, live entry/rank change/removal and actual intermediate animation; stable nodes/no relayout on unchanged ranks; reduced motion, narrow bounds, empty/dense and practice override. Run Node/Stream browser regressions, inspect screenshots and update brief.
  Source: src/stream/boot.js; src/stream/model.js; stream.html; styles/stream.css
  Depends on: TYP-023
  Notes: TYP-023 is Done. Cloud uses the same trouble score and alphabetical tie-breaking as difficulty ranks, and shows only supported trouble. Existing cross-tab refresh and trouble-retirement limitations remain separate backlog work.
  Evidence: 2026-10-23: npm test passed 106/106 and npm run test:browser passed 23/23 Chromium tests. Two new acceptance tests use synthetic histories to verify a third recorded attempt immediately enters the cloud, harder ranks have larger fonts, D3 has observable intermediate entry/size animation, rank changes preserve DOM identity, retired words animate out, unchanged visible ranks retain layout, and unrecorded practice leaves the cloud unchanged. Single/empty states, dense 100-word histories, 48/24 display caps, actual text bounds, no horizontal overflow, desktop/390px layouts and reduced motion (no active transitions) pass. Existing Stream input, motion, focus control, storage/backup/recovery and practice regressions pass. Inspected desktop/mobile and live-update screenshots. npm run vendor:cloud reproduced distributions/licenses byte-for-byte; npm install audit reported zero vulnerabilities. Updated PROJECT_BRIEF.md and documented library choice/ownership in vendor/README.md. git diff --check passed. Installation and Chromium/local-server checks needed sandbox escalation; Safari/Firefox, physical mobile devices and assistive technology remain unverified. Layout may omit words that cannot fit; caption reports actual displayed count and the complete table remains available.
  Commit: 28caea4
  Stability follow-up: User reports the cloud scrambles on every refresh and requests a more stable layout. Done when: Identical history at the same width produces identical settled placements across reloads; live rank changes retain word positions where they still fit, rather than repacking the whole cloud. Keep library layout and live size animation, responsive bounds, reduced motion and practice isolation. Verify: Repeated page reload geometry, rank-change and entry/removal displacement/overlap checks, and existing Stream browser regressions with synthetic histories.
  Stability evidence: 2026-10-25: Reproduced full repacking on a one-word rank change in a synthetic 30-word history: many words moved hundreds of pixels (maximum over 500px). Initial identical-data reloads were already deterministic; the change addresses live repacking as well as retaining the evolved layout through refresh. Added stable word-identity homes/spiral seeds, preserved placement order, and removed whole-cloud recentering. Reuses settled anchors from a bounded optional sessionStorage cache (three viewport sizes, up to 48 word names/coordinates each), separate from performance history and backups. d3-cloud retains collision masks, edge bounds and spiral packing through documented optional initial-position/sort hooks, reproduced by vendor:cloud. npm test passed 108/108; npm run test:browser passed 24/24 Chromium tests. Regression verifies three identical reloads, a rank-1 to rank-30 change with median displacement below 20px and maximum below 65px, unchanged anchor for the resized word, zero overlapping glyph pixels, identical post-update reloads, mobile reload/desktop return, cache bounds and denied-storage fallback. Node tests cover cache persistence, capacity, malformed/out-of-bounds entries and denied storage. Existing animation, word entry/removal, empty/singleton, motion, practice isolation and storage regressions pass. Inspected stable desktop and dense mobile screenshots; vendor assets/hooks reproduce byte-for-byte; git diff --check passed. Updated PROJECT_BRIEF.md last-verified date and vendor documentation. Local movement is still allowed to prevent collisions when font sizes change, and a new viewport gets a separate layout. Cache lasts for the tab session; physical mobile, Safari/Firefox and assistive technology remain unverified.
  Stability commit: 8589645
  Probability-sizing follow-up: User requests the cloud sizes follow the probability curve, so stronger focus enlarges the first few words. Done when: The cloud and plot consume the same before-cooldown distribution; sizes reflect full selection probability, not conditional target-only weights or an independent rank formula. Slider changes animate cloud sizes immediately while preserving stable anchors where possible, partial input, buffered words, practice data and practice override. Flat probabilities produce equal sizes, concentrated probabilities visibly favor likely words, and tooltips identify the displayed percentage. Keep readable size limits and existing responsive/reduced-motion behavior. Verify: Deterministic mapping checks for equal/low/default/high probabilities; browser comparison of curve/cloud percentages and sizes, live slider resize animation, stable identities, reload, narrow/reduced-motion and all Stream regressions.
  Probability-sizing evidence: 2026-10-30: npm test passed 110/110 and npm run test:browser passed 25/25 Chromium tests. Cloud and plot receive the same before-cooldown wordProbabilities result; supported vocabulary words use their full global probability including broad and targeted mass. Font size uses a bounded square-root mapping with a readable 13px floor and 58px desktop/42px compact maximum, reaching that maximum at 50% probability; cloud-only probabilities are not renormalized. Flat distributions give equal sizes; low/default/high tests verify leading words grow and the tail shrinks with concentration. Browser acceptance compares every displayed cloud percentage with the plot, checks actual size transition, preserved word identity, unchanged partial input/track/buffer and exported history, high-focus reload persistence, compact sizing and reduced-motion updates. Existing stable-anchor/glyph non-overlap, practice override, storage/recovery and Stream motion regressions pass. Inspected low/high desktop and mobile screenshots. Updated PROJECT_BRIEF.md, policy and vendor integration documentation; git diff --check passed. Size floors/caps, integer layout rounding and long-word fit scaling limit literal proportionality. Physical devices, non-Chromium browsers and assistive technology remain unverified.
  Probability-sizing commit: 6bce629
  Contrast/live-drag follow-up: User requests more exaggerated cloud size differences, clearly shrinking lower-probability words as focus rises, and live updates during slider dragging. Context: The old absolute square-root scale compresses tail sizes against a 13px floor; frequent 420ms eased transitions can also lag repeated input. Done when: Stronger relative probability produces visibly larger head words and smaller tail words, with readable bounded sizes and exact probability tooltips unchanged. Real pointer dragging visibly updates the cloud before release, using the latest slider value without stale work, while preserving anchors, typing input/history and reduced motion. Verify: Equal/low/default/high distributions, quantified tail shrink/head contrast, real held-pointer drag with intermediate cloud measurements, rapid reversals/latest result, narrow/reload/motion and Stream regressions.
  Contrast/live-drag evidence: 2026-10-31: npm test passed 110/110 and npm run test:browser passed 26/26 Chromium tests. Size now uses the squared ratio of full probability P to the word’s exploration baseline B from the shared calculation, with neutral/max 28/84px desktop and 22/64px compact and a 9px floor. Model baseline exposure preserves actual sampling masses. Unit checks across 3/30/100/470-word pools verify high-focus head growth above 1.6x, tail shrink above 25% versus exploration and 15% versus balanced, and head/tail contrast above 3x. A real mouse drag verifies growing head and shrinking tail while pointer remains down, tail below 60% of starting size and head/tail above 4x, rapid input reversals resolving to the latest plot, and unchanged partial input/track/exported history. Input is coalesced per animation frame with 80ms linear transitions; ordinary recorded updates retain 420ms animation. Density/long-word scaling keeps dense mobile words fitted; glyph non-overlap, reduced motion, persistence/reload, practice override and Stream regressions pass. Larger headlines require a wider local collision allowance: stability fixture median remains below 20px, at least 90% below 65px and all below 170px. Inspected low/high desktop and compact screenshots. Existing retention test had a midnight/DST-sensitive fixed-day fixture (364 days); set its synthetic clock to local noon, with production storage unchanged. Updated brief/policy/integration docs and last-verified date; git diff --check passed. Physical devices, Safari/Firefox and assistive technology remain unverified; font caps/floors, density fit and integer rounding are display limits.
  Contrast/live-drag commit: b0b9a23


- [x] TYP-023 Add a difficulty-focus control with a live word-probability plot
  Priority: P2
  Order: 1
  Context: User wants a distinctive, polished difficulty control for recorded Word Stream practice. Moving it changes how strongly difficult words are favored while retaining new-word discovery. On hover, a popup plot must show the actual probability of selecting the nth hardest practiced word: x=1 is the currently hardest word, x=2 the second hardest, and so on. The curve changes live with the control. Design the distribution thoughtfully rather than exposing a cosmetic slider or an arbitrary difficulty score.
  Done when: A compact, visually distinctive control consistent with Typist communicates exploration versus difficult-word focus and supports mouse, touch, and keyboard operation. Hover or keyboard focus opens a readable probability plot; tapping provides an equivalent persistent preview. Plot x is difficulty rank among practiced vocabulary words, with stable tie-breaking; y is actual selection probability in percent, not the trouble score or conditional targeted-only weight. Word labels/tooltips identify ranked words. Show total probability reserved for unseen words separately, so the rank curve does not misrepresent discovery. Slider movement updates both the real sampling policy and the preview immediately, without saving a typing attempt, interrupting the active word, or causing stream-motion jumps. Explain that changes apply to newly generated words rather than pretending already-buffered words were resampled. Preserve an explicit exploration floor when unseen words exist, avoid starvation or endless repetition, and handle empty history, no reliable hard words, one candidate, and an exhausted unseen pool honestly. Account for recent-word exclusion and other sampler constraints in the effective next-generated-word probabilities, or clearly identify any preview projection; never present a different distribution as the exact sampler. A single probability-calculation function drives the sampler and plot. Persist the chosen preference separately from performance history; the unrecorded practice set remains an exclusive override and the control explains that it is inactive there. Document the chosen probability policy, calibration, and limits, and update the project brief.
  Verify: Deterministic tests verify normalization, nonnegative probabilities, rank ties, exploration guarantees with unseen words, empty/small pools, cooldown exclusions, preference persistence, and practice-set override without recording data. Seeded sampling frequencies must agree with displayed probabilities within stated statistical tolerance. Compare low/default/high settings to show the expected redistribution toward the hardest words while retaining discovery. Browser tests cover live plot updates, correct rank/word/percentage labels, hover/focus/touch dismissal, keyboard slider controls, narrow layouts, and preserving partial input and continuous stream motion. Use synthetic practice histories and run existing Stream regressions.
  Source: src/stream/model.js; src/stream/boot.js; src/stream/render.js; stream.html; styles/stream.css
  Notes: Suggested starting design, to evaluate rather than accept blindly: a normalized mixture P(w)=(1-a)B(w)+aH(w), where B explicitly reserves discovery mass for unseen words and also covers other vocabulary, H weights sufficiently evidenced difficult words by a smooth rank-decay family such as (rank+c)^(-beta), and the control changes a and concentration beta smoothly. Bound a below 1 so hard-word focus cannot eliminate exploration; renormalize after actual candidate exclusions. Keep the displayed ranking distinct from eligibility: sparse evidence must not masquerade as proven difficulty. Select and explain calibrated endpoints and a reasonable default rather than introducing several exposed tuning controls. Coordinate with TYP-017/TYP-018 without requiring those separate fixes or silently declaring them complete. Task only; no implementation or agent launch requested.
  Evidence: 2026-10-23: npm test passed 106/106; npm run test:browser passed 19/19 Chromium tests. Deterministic model tests cover normalization, nonnegative mass, alphabetical rank ties, sparse/empty/singleton/exhausted pools, cooldown and explicit unseen-floor release, low/default/high redistribution and separate preference persistence/denied storage. 60,000 seeded draws at each setting agree with calculated marginal probabilities within six binomial standard errors plus .001 absolute probability. Browser tests compare displayed rank/word/percent labels to the shared calculation with actual buffered cooldown, verify live keyboard changes, hover/focus/Escape, touch pin/close/outside dismissal, reload persistence, unchanged partial input/track and saved data, uninterrupted completion, and disabled practice override with unchanged stores. Existing motion, reduced-motion, input, storage/recovery and practice regressions pass. Inspected desktop and 390px screenshots and verified no horizontal overflow. Documented calibration/constraints in thinking/stream-focus.md and updated PROJECT_BRIEF.md. git diff --check passed. Chromium/local-server tests required sandbox escalation; physical touch devices, Safari/Firefox and assistive technology remain unverified. TYP-017 and TYP-018 remain open; learning effectiveness is not claimed.
  Commit: db3f0bd
  Follow-up: User requests the difficulty control fit inside the statistics row, with no preview button, card chrome or persistent explanatory clutter. Done when: Compact row placement retains hover/focus/touch preview and existing behavior. Verify: Stream browser regressions and desktop/narrow screenshots.
  Follow-up evidence: 2026-10-23: Removed the separate card, preview button, value badge and persistent copy; slider now shares the desktop statistics row and wraps within that section on narrow screens. Touching the slider pins the plot; details stay inside the popup. All 106 Node tests and 19 Chromium tests pass, including row alignment, control height below 70px, no preview button, direct touch dismissal, input/motion and practice regressions. Inspected 1280px and 390px screenshots. PROJECT_BRIEF.md reviewed and updated. git diff --check passed; physical mobile devices and non-Chromium browsers remain unverified.
  Plot follow-up: Close on mouse departure even with slider focus; use logarithmic difficulty-rank x coordinates and readable rank ticks. Done when: Mouse exit closes the popup while keyboard/touch still work and the log plot retains exact probability values. Verify: Browser regression for focused mouse departure and log geometry with a large synthetic vocabulary history; inspect screenshots.
  Plot evidence: 2026-10-23: 106 Node and 20 Chromium tests pass. Verified mouse departure closes the popup after slider click/focus, moving into the popup keeps it open, keyboard input reopens it, and touch dismissal remains intact. A 100-word synthetic history verifies rank 10 lies halfway between ranks 1 and 100, first ranks spread out, and 1/2/5/10/20/50/100 ticks appear. Inspected desktop and 390px screenshots; no horizontal overflow. Probability calculation unchanged. Updated brief and policy; git diff --check passed. Physical touch devices, non-Chromium browsers and assistive technology remain unverified.
  Cooldown plot follow-up: User reports the rank curve dropping to zero at rank 2. Context: Recent-draw exclusions have real zero next-draw probability but the connected curve presents those exclusions as the rank weighting. Done when: Cooldown zeroes are visibly identified and do not pull the eligible-word curve down; exact ranks and probabilities remain visible. Verify: Synthetic ranked history with rank 2 excluded, exact zero versus positive neighboring probabilities, distinct cooldown markers and curve gaps; Stream regressions and screenshot review.
  Cooldown plot evidence: 2026-10-23: 106 Node tests and 21 Chromium tests pass. Synthetic alpha/beta/gamma history reproduces a positive rank 1, zero rank 2 (beta recently drawn), and positive rank 3. Browser assertions verify the exact zero remains at its original rank, its marker/title and visible cooldown legend identify the reason, and eligible curve segments break at the excluded rank. Inspected popup screenshot. Existing logarithmic geometry, exact probabilities, mouse dismissal, keyboard/touch, storage and motion regressions pass. Sampler policy and probabilities are unchanged. Updated PROJECT_BRIEF.md and policy; git diff --check passed. Physical devices and non-Chromium/assistive-technology behavior remain unverified.
  Preview follow-up: User explicitly requests the plot show the distribution without cooldowns. Done when: Plot, word values and unseen mass use the shared calculation with no recent exclusions; cooldown markers/legend are removed; preview is labeled before cooldown and actual sampling retains cooldown. Verify: Compare preview against no-cooldown model results and ensure an actually excluded rank-two word has positive preview probability; run Stream regressions.
  Preview evidence: 2026-10-23: 106 Node and 21 Chromium tests pass. Plot now uses wordProbabilities with an empty recent list, as do the ranked word percentages and unseen mass; actual appendWord sampling still uses recentDraws. Removed cooldown markers, note and curve gaps; heading labels the projection before cooldown. Browser acceptance compares live labels with the no-cooldown calculation, verifies an excluded rank-two word has positive preview probability and a continuous curve, and confirms actual draws still exclude it. Inspected popup screenshot. Log-axis, mouse dismissal, touch/keyboard, storage and motion regressions pass. Updated PROJECT_BRIEF.md and policy; git diff --check passed. Physical devices and non-Chromium/assistive-technology behavior remain unverified.


- [x] TYP-022 Add an unrecorded Word Stream practice set for hard words
  Priority: P2
  Order: 1
  Context: User wants a temporary Word Stream practice set built from the hard-word/revisit list. Selecting a single word should allow repeated practice of only that word; additional words can be added to a set. While the set is nonempty, it replaces adaptive/broad sampling. This practice is deliberately unrecorded.
  Done when: Hard-word rows provide an obvious keyboard-accessible way to practice a word immediately and an Add action to build a deduplicated practice set. Selecting one word starts a single-word set; adding other words expands the active set. A visible practice-mode indicator shows the chosen words and clearly says attempts are not recorded. While the set is nonempty every upcoming stream word comes from that set, including clearing/replacing any already-buffered normal words. A single-word set repeats only that word. Users can remove selected words and explicitly reset/clear the set to return to the normal adaptive stream; an empty set exits this mode. Switching modes discards the partial current word rather than recording a mixed attempt. Practice attempts never update stored attempts, word summaries, daily/lifetime totals, revisit eligibility, adaptive targeting, or recorded session history, including through retry/export flows. Existing pending recorded attempts remain intact and may finish saving normally. Keep the set temporary to the tab session, with no practice progress persisted. Preserve normal stream motion and the timed typing app.
  Verify: Browser tests cover selecting one hard word, repeated single-word practice, adding multiple words without duplicates, exclusive set sampling across buffered words, removing/resetting and resuming normal sampling, keyboard access, and narrow layouts. Compare IndexedDB attempts, word/day summaries, totals, and export before and after practice to prove no practice data is recorded. Cover partial-word mode switches, normal pending saves and retries, reload behavior, and existing motion/typing regressions. Update PROJECT_BRIEF.md with verified behavior and limits.
  Source: src/stream/boot.js; src/stream/model.js; src/stream/render.js; stream.html; styles/stream.css
  Notes: Task only; no implementation or agent launch requested. Practice-set contents are temporary UI state, not a new source of typing statistics. Do not silently discard recorded attempts already pending before entering practice mode.
  Evidence: 2026-10-18: npm test passed 101/101; npm run test:browser passed 17/17 Chromium tests, including four new practice acceptance cases. Verified keyboard word/Add/remove/clear actions, single-word repeats, deduplication, exclusive six-word previews, multi-word sampling, partial-word discard on entry/set change/exit, normal sampling after removal/reset and reload. Compared all exported attempts, word/day summaries and lifetime totals before/after practice (excluding export timestamp); actual downloaded export and retry remained unchanged, as did displayed summaries, revisit trails and recorded session outcomes. In-flight and failed normal saves survived practice, recovered exactly once, and kept export disabled until saved. Existing input, timed Node regressions, continuous-motion geometry and reduced-motion tests passed. Inspected 390px screenshot and checked no horizontal overflow and visible preview geometry. Updated PROJECT_BRIEF.md. Browser tests required sandbox escalation for local server/Chromium access; Safari/Firefox, physical mobile keyboards and assistive technology were not tested. git diff --check passed.
  Commit: 1f94f12

- [x] TYP-021 Write and verify the project brief for incoming agents
  Priority: P2
  Order: 1
  Context: New Codex sessions receive a task snapshot but lack project orientation, recent decisions, user preferences, and awareness of other work. Inspect this project and produce its own concise, durable handoff document; do not assume undocumented history.
  Done when: A root PROJECT_BRIEF.md explains the app purpose, supported entry points, how to run it, architecture and internal/external dependencies, data locations and persistence or backup behavior, development and verification commands, current work, and known pitfalls. Record established user preferences and decisions with references; explicitly label uncertainties. Link the canonical TODO.md and AGENTS.md rather than duplicating the backlog. Include a last-verified date and maintenance instructions. Add an AGENTS.md instruction to read and maintain the brief so incoming agents discover it.
  Verify: Check commands, paths, entry points, architecture, dependency ownership, and data claims against current code and configuration. Review planning documents and the current Git state. Ensure references resolve, exclude secrets and personal data, and identify anything that could not be verified. Confirm the brief is concise enough to orient a new agent.
  Notes: Documentation task only: inspect the project before writing. Do not invent user preferences or undocumented decisions. At completion follow the standing agent policy: verify, commit only assignment-related changes with the task ID, and push to the configured upstream; report blockers.
  Evidence: 2026-10-11: Reviewed all four HTML entry points, module imports, package/lockfile, configs, storage and backup implementations, planning documents and Git state. Added a 1,170-word PROJECT_BRIEF.md with referenced policies/decisions, current-work guidance, known pitfalls, explicit uncertainties, last-verified date and maintenance instructions; AGENTS.md now requires reading and maintaining it. All 33 file references resolve; manual review found no secrets or personal practice data. npm test passed 101/101; npm run test:browser passed 13/13 Chromium Stream tests. Python HTTP server on port 8001 returned 200 with appropriate types for /, all four pages, three boot modules and shared CSS; initial sandbox bind restrictions were overcome using approved escalation. git diff --check passed. Existing dependencies/browser were used; installation commands were checked against configuration, not rerun. Hosted deployment, live CDN, Safari/Firefox and physical mobile behavior were not verified; source/config review, not the regression suites alone, establishes the documentation claims. Preserved pre-existing App Manager edits outside the assignment commit.
  Commit: 4025231

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
