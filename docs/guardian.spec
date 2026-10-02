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
