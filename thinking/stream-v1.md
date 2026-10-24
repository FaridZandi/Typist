# Continuous word practice — shipped design

The first version is a separate `stream.html` page. The timed test and its
storage stay independent. This supersedes the speculative storage shape in
`stream-mode-storage.md` for this word-focused mode.

## Interaction and selection

Type immediately, use Space to submit a nonempty word, and Backspace to edit
only that word. A wrong word can be submitted; corrected mistakes still count
as a troubled attempt. Empty Space is ignored. Paste, composition, shortcuts,
and key repeats are not scored as typing. A partially typed word is never
counted as a completed attempt. Leaving the page discards only that partial word.

Five upcoming words provide reading context. The active word advances character
by character through a fixed cursor; words advance on Space. Taking a break
needs no button. Inter-key gaps over five seconds and gaps across blur/visibility
changes do not contribute to active typing time. Interrupted attempts retain
their accuracy information but are excluded from word speed comparisons.

The vocabulary is a versioned, local, mixed English word list. Selection now
uses the [difficulty-focus policy](stream-focus.md): a 0–60% targeted mixture
(default 30%), with explicit unseen discovery and a live probability preview.
The evidence gate remains at least three attempts and two troubled outcomes
in the last 20. Queueing means new settings affect newly generated words,
not the current word or its five buffered successors.

Targeted and broad draws are recorded separately. Per-word trails show up to
20 recent clean/troubled attempts. Overall clean rate reflects practice, not an
unbiased proficiency test: the mix intentionally gets harder. Broad-draw clean
rate is also shown, with its sample count. Neither is a promise of improvement.

## Storage and recovery

Database `typist-word-stream`, schema version 1:

- `words`: one lifetime summary per word, recent 20 attempts, and separate broad
  and targeted counts. Counts, clean attempts, corrections, and active timing
  totals are retained; the entire key stream is not.
- `attempts`: word outcome, timing, corrections, actual submitted spelling,
  source, and rule/vocabulary versions. Retain at most 10,000 records and 30
  days; trim every 50 saved attempts and at boot. Raw input is bounded to 64
  characters per word. This is a rolling audit window, not an unlimited archive.
- `days`: daily totals, separated by source. Retain the most recent 365 days.
- `meta`: all-time totals and format information.

Each completed word updates all four stores in one transaction. Different tabs
serialize transactions in IndexedDB; no read/modify/write localStorage races.
The UI updates immediately, queues saves, and clearly shows failed/unsaved
records. Retry preserves queued attempts; closing with unsaved work warns.
If saving remains unavailable, the queue is bounded to 200 attempts and typing
is disabled until recovery, rather than silently discarding more data.

Storage persistence is requested only through an explicit button. Browsers may
deny it, and clearing site data still deletes the database. Export is the backup.
Exports contain summaries and the retained audit/history windows. Restore
validates the complete file before opening a replacement transaction; malformed
files leave current history intact. Restore replaces stream history only and
requires confirmation. It never touches timed-test or reaction localStorage.

Retention sacrifices future re-analysis of old individual attempts. Summary
rules are versioned; a future incompatible analysis starts a new version rather
than claiming to reconstruct unavailable raw history. Settings and storage
origins remain browser-specific: use the same hostname and port consistently.
