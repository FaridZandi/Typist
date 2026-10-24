# Typist — agent orientation

Last verified: **2026-10-23** (difficulty-focus policy and UI; baseline orientation reviewed 2026-10-11).
Read [AGENTS.md](AGENTS.md) and the canonical [TODO.md](TODO.md) before work.
This brief is orientation; task status and acceptance criteria live in TODO.

## Purpose and entry points

Typist is a local browser practice tool: timed typing with an evidence-based
debrief, reaction-key drills, and continuous adaptive word practice. It is
static HTML/CSS/JavaScript with native ES modules, no build step, backend,
account service, or server-side practice database in this repository.

| Page | Browser entry | Purpose |
| --- | --- | --- |
| [index.html](index.html) (also `/`) | [src/boot.js](src/boot.js) | 60-second typing test, text picker, debrief and drills |
| [reaction.html](reaction.html) | [src/reaction/boot.js](src/reaction/boot.js) | Weighted key practice, heatmaps, optional metronome |
| [stream.html](stream.html) | [src/stream/boot.js](src/stream/boot.js) | Continuous words, Space submits, Backspace edits current word |
| [dvorak.html](dvorak.html) | Inline module using shared keyboard renderer | Standalone Dvorak schematic |

The typing header links to Stream and Reaction; both provide a typing return
route. Dvorak is available directly. Serve the root over HTTP; `file://` cannot
reliably load these modules. See [README.md](README.md) for user-facing usage.

## Run and verify

From the project root:

```sh
python3 -m http.server 8000
# Open http://localhost:8000/ (or any page listed above).
```

In another terminal:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
git diff --check
```

The lockfile owns reproducible development dependencies. [package.json](package.json)
defines Node's test runner, JSDOM and Playwright; neither library ships in the
app. `npm test` runs `test/*.test.js` (models, JSDOM page interaction and data
portability). The browser script runs only the Stream suite, creates its own
temporary localhost server and isolated Chromium contexts, and checks persistence,
recovery, retention, input and motion. It is not whole-app browser acceptance.
Verify affected UI in a browser as required by the assigned task.

Verified environment: Node 24.7.0, npm 11.5.1, Python 3.9.6. The project declares
no minimum Node version. Package/browser installation requires network access;
use existing installations when available. No lint/build/deploy script is defined.

## Architecture and dependency ownership

- Timed typing: [src/main.js](src/main.js) owns state and wiring;
  [run-engine.js](src/run-engine.js) captures word/key events. Alignment, metrics,
  aggregates, annotations, transitions, finding and progress modules derive
  evidence; `src/view/` renders prompt and debrief. `src/texts.js` owns prompts;
  `src/config.js` owns timing, evidence thresholds and storage keys. Drills use
  catalog words and retain evidence separately from per-text run history.
- Reaction: `src/reaction/main.js` wires targeting, key statistics, metrics,
  metronome, charts and keyboard views. Its config/storage modules own its data.
- Stream: `src/stream/boot.js` owns input, queue and recovery UI; `model.js` owns
  attempts and the shared sampling/preview probability calculation, `focus.js` owns
  the difficulty control and its separate localStorage preference, `render.js` owns
  continuous motion, `storage.js` owns
  IndexedDB transactions/backup, and `words.js` owns versioned vocabulary.
- Shared: `src/shared/keyboard-layout.js` and `keyboard-map.js` own Dvorak
  rendering and movement classification. Stream reuses `src/alignment.js`.
  `src/data-portability.js` serves both timed and reaction backup controls.
  `styles/index.css` imports the common cascade; Stream adds `styles/stream.css`.
- Runtime external dependency: Reaction loads Chart.js **4.5.0** from jsDelivr
  in `reaction.html`, outside npm/lockfile ownership. Without it the history
  chart is skipped. Other pages use local assets and browser APIs. No remote
  practice-data sync or telemetry integration was found in source.

## Data and recovery

Practice data lives in the browser profile, scoped by scheme/hostname/port,
not in repository files. A different port/profile means different history.
Clearing site data can delete it; there is no automatic off-device backup.

- Timed localStorage: `typist-typing-{stats,runs,settings}-v2`,
  `typist-typing-analysis-v3`, `typist-typing-transitions-v1`
  ([config](src/config.js), [storage](src/storage.js)). Detailed analysis retains
  12 runs per text; compact run/transition histories are not capped. Legacy
  `typist-heatmap:*` keys are removed rather than migrated. Prompt edits that
  change length rebuild that text's character stats.
- Reaction localStorage: `typist-reaction-history`, `typist-reaction-key-stats`,
  `typist-reaction-settings` ([config](src/reaction/config.js)); history is uncapped.
- Timed/Reaction **Export practice data** includes localStorage keys with
  `typist-` or `reaction-` prefixes. Import checks the envelope and JSON values,
  confirms replacement, downloads current data first, then reloads. It does not
  deeply validate every record schema; rollback can also fail under storage
  restrictions ([implementation](src/data-portability.js)). It excludes IndexedDB.
- Stream preference `typist-stream-focus-v1` in localStorage stores only difficulty
  focus (0–100, default 50), separately from performance history. It is excluded
  from Stream backups; the generic Typing/Reaction localStorage export includes
  it by prefix. A denied write keeps the preference in this tab with a notice.
  The control changes only new draws and preserves partial input and track motion.
  The compact slider sits in the statistics row without a separate preview button
  or card. Hover/focus previews probabilities; touching the slider pins the
  preview until outside tap, close or Escape. Details stay inside the popup.
  The ranked curve includes broad plus targeted mass after cooldown constraints;
  unseen probability appears separately. The snapshot uses current tab history,
  which the next completion can change. Practice sets disable this control.
  See [policy and calibration](thinking/stream-focus.md). The existing evidence
  gate and age/clean-streak limitations remain; this does not resolve TYP-017/018.
- Stream database `typist-word-stream`, schema 1: `words`, `attempts`, `days`,
  `meta`. Completed words update all stores atomically with ID deduplication.
  Lifetime word summaries include the last 20 outcomes; audit attempts retain
  at most 10,000/30 days, daily totals at most 365 days. Trimming runs at open,
  every 50 saves, export and restore, so limits are not enforced after every word.
  Partial words are discarded on reload. Failed saves stay in tab memory;
  retry and closing warnings are provided, recorded typing stops at 200 pending attempts,
  and backup controls are disabled while attempts are pending. Closing can lose
  that queue. Stream backup validates before confirmed replacement of Stream
  alone. Persistent-storage permission is an explicit button, not a backup.
  See [storage](src/stream/storage.js) and [shipped design](thinking/stream-v1.md).
- Stream word rows offer a keyboard-accessible word button for immediate solo
  practice and Add for a deduplicated temporary set. While nonempty, the set
  replaces every current/upcoming draw. Its visible indicator says attempts are
  not recorded; remove buttons and Clear return to normal sampling when empty.
  Set changes discard partial input and reset the track; completed practice
  words keep the normal motion but bypass summaries, totals, session outcomes,
  saves and exports. Pending recorded saves remain recoverable. The set and
  practice progress are never persisted and reload returns to normal mode.
  See [boot](src/stream/boot.js), [UI](stream.html) and
  [browser acceptance tests](test/browser/stream.test.mjs).

## Established direction, current work and pitfalls

Documented product guidance in [thinking/policy.md](thinking/policy.md): calm
practice, one primary observation/action, local analysis, honest sample/confidence
claims, and accuracy/recovery before speed. These are project policies; no
additional personal user preferences are established by this review.
[thinking/problems.md](thinking/problems.md) explicitly requests transition
timing for the current run and visible progress over time; [README's debrief
description](README.md#the-debrief) records the resulting visual approach.

Current decisions: current-word-only editing and Space realignment
([roadmap](thinking/roadmap.md)); one finding chosen by an evidence ladder
([README](README.md#the-finding-ladder), [finding.js](src/finding.js)); Stream
separate from timed history with adjustable 0–60% targeted draws (30% default),
corrected mistakes counted, and interrupted word timing excluded
([stream-v1](thinking/stream-v1.md), [model](src/stream/model.js)).

Use [TODO.md](TODO.md) for current priorities. It tracks timed-save safety as
the P1 concern and Stream synchronization/input/sampling follow-ups alongside
finding work. Source confirms timed and reaction save errors are swallowed;
timed writes are separate and can partially succeed. Stream database writes
serialize across tabs, but displayed summaries/targets are cached per tab.
Current targeting ignores elapsed age; broad sampling can take a long time to
confirm an early miss. Repeated-key filtering has a beforeinput bypass. These
known issues are open work, not guarantees made by the shipped design.

[Old backlog](thinking/backlog.md), [roadmap](thinking/roadmap.md) and
[roadmap 2](thinking/roadmap-2.md) preserve rationale, not current completion
status: roadmap 2 describes the older feedback bundles, superseded by the ladder.
[stream-mode-storage.md](thinking/stream-mode-storage.md) is a superseded proposal.
README's final file list omits Stream; rely on the entry table above.

Git snapshot at brief creation (2026-10-11): `main`, HEAD `301ec62`, two commits ahead of
`origin/main`; AGENTS.md and TODO.md already had uncommitted App Manager edits.
Inspect fresh status before staging; preserve unrelated work. Standing
[agent instructions](../../tools/codex-instructions.md) authorize task commits
and pushing the current configured upstream. Git status is transient, not a
deployment record. Hosted deployment, current CDN availability, Safari/Firefox
and physical mobile behavior were not verified; there is no declared browser
support matrix or deployment configuration in this repository.

Baseline verification (2026-10-11): 101 Node tests and 13 Chromium Stream tests
passed; Python's HTTP server served all four pages and entry modules on port
8001. All 33 document references resolve. Existing dependencies/browser were
used; installation commands were checked against configuration, not rerun.

Verification on 2026-10-18: 101 Node tests and 17 Chromium Stream tests passed,
including keyboard practice selection, exclusive buffered sampling, removal/reset,
partial-word switches, unchanged stored/exported history, reload and pending-save
recovery. Inspected the 390px practice UI screenshot. Safari/Firefox, physical
mobile keyboards and assistive technology were not tested.

Verification on 2026-10-23: 106 Node tests and 19 Chromium Stream tests passed.
Difficulty-focus tests use synthetic histories, seeded sampling and exact preview
comparisons; desktop and 390px screenshots were inspected. See TODO Evidence for
acceptance details and the policy document for statistical tolerance and limits.

## Maintenance

Read this brief on entry. Update relevant claims and the last-verified date when
entry points, commands, architecture, storage, dependencies or durable decisions
change. Check claims against code/config and link their source; label remaining
uncertainties. Re-read TODO before editing it because App Manager also writes it.
Keep task details there, and never add private practice records, exports or secrets
to this brief. Record assignment-specific verification and limits in TODO Evidence.
