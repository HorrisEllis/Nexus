# 0.60.429 — metrics while coding in Emerge; every extension defined

James, 2026-11-06: "remember to take note of metrics while coding in emerge, and expanding emerge while you do." · "node files, eg files, yaml
files, and database files. all new extensions need to be defined in a taxonomy and ledger."

No code. The rules, the measurements and the map:
- **CLAUDE.md (addendum 0.60.429):**
  - every slice of Emerge work records its metrics in `docs/BENCHMARKS.md`: wall time, .eg lines added, JS lines removed, tests, failed
    runs before the pass and what each taught, and the gaps found;
  - every gap found in Emerge gets the phase that builds it into Emerge;
  - every new extension is defined, with a ledger line, in the registry of the system that owns it.
- **`docs/BENCHMARKS.md`:** today's two Emerge slices now carry these metrics.
  - Slice a: 7 failed runs before the pass, each one what it taught.
  - Slice b: 1 failed run. +95, 146 and +12 lines of .eg; 0 JS removed yet.
- **The extension census, measured** (git ls-files, `data/` excluded): 141 extensions, 66 with no definition. Among them are `.eg` (67
  files), `.nex` (168), `.yaml` and `.yml`, `.sql`, `.jsonl` and `.ndjson`. The 75 that are defined sit in `lib/node-schemas`, one central
  folder.
- **The map:**
  - EQ2 expanded with the metrics.
  - EQ5 written: the taxonomy and ledger of extensions, a census in .eg, Emerge's extensions first.
  - EQ_D1 decided by the axioms (§5.9, §5.15, §5.16): each extension is defined by the system that owns it. "Database files" is to confirm.
  - CIE14 written for the gaps found while coding: frozen lenses natively, newlines inside a map literal, writes through a let natively,
    stderr natively.

  Each has its ledger line and its graph.
