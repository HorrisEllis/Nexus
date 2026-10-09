# docs/guardian.spec — MOVED. One guardian spec: guardian/spec/guardian.spec.
# GA1 (docs/2026-10-02-emerge-field-memory-build-phasemap.spec, invariant E13) — "the two guardian.spec copies surfaced and
# made one". This copy stood at 3.6.2 while the real one moved to 3.19.1; every line of it was already in the real one
# (checked by diff: only its version line and the real spec's 6 events and 400 lines of addenda differed), so nothing
# is lost by keeping only the pointer. Guardian's agent facts are its provider nodes (guardian/data/nodes/provider/),
# served at GET :7820/api/providers — not this file, and not either spec's ncp_providers list.
spec:
  meta:
    name:     guardian-spec-moved
    moved_to: guardian/spec/guardian.spec
    moved_at: 2026-10-02
    why:      "one guardian spec (GA1): this copy was 13 versions stale"

## ADDENDUM 2026-10-10 — 0.55.2: the job lifecycle, checked end to end (docs/2026-10-09-hardening-pass-phasemap.spec HP13–HP22)
James: "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents."
- **Delivered is not taken.** `lib/dispatcher.js` arms a pickup watch on every send over the tab's connection (NCP). With no word from the tab about the job within GUARDIAN_PICKUP_MS (90 s), the job fails at "tab takes the job". The userscripts send GUARDIAN_PROGRESS stage 'accepted' on receipt.
- **A typed prompt is never re-queued.** The idle window and a mid-flight disconnect now send it to awaiting_transcript, not back to the queue.
- **cancel(jobId).** The dispatcher re-reads every job before sending it. askSync cancels an untyped job it stops waiting for, gives up after GUARDIAN_NO_TAB_MS (45 s) when there is no tab, and gives up at once when the economy holds the job longer than GUARDIAN_ECONOMY_WAIT_MS (30 s) or longer than it will wait.
- **Gate trail.** `gateOfError` reads an unknown gate (the userscripts' 'handleJob') from its error text. `guardian.economy.wait` is a waiting gate with its reason.
