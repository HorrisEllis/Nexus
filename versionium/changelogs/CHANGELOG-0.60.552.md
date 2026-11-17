# 0.60.552: the officiator asks local first and falls back as he sets it; RAID's options get a door; Intelligence's failure reports land in its own folder

James, 2026-11-17, with his screenshot of COS's intelligence Data tab (data folders / own / failures: "Empty."): "also failure mode reports
should be going in here. yes. it needs to fallback. i wanted options for all this so i can configure it. like in raid."

## Found (his log, 2026-11-17)
- At 08:22, RAID's officiator sent "Synthesize ONE real build contract…" to the Claude tab. That tab was a paid Claude Code session.
- Why it went to Claude:
  - RAID ranked Claude first for contract synthesis.
  - The officiator's "ollama" went through Guardian's browser-tab path (NCP), which has no Ollama tab, so Ollama could never answer.
- RAID's tunables had no door: they could only be changed by editing Cortex's store by hand.
- Intelligence's failure-mode taxonomy lived only in its process's memory, plus five lines in Cortex's event_log, so its `failures` folder
  stayed empty.

## Built (backend → route → command; the UI is his)
- **RAID's options** (`cortex/core/raid/tunables.js`), each refused when the value does not fit:
  - `officiatorAgents`: his list, asked first, default `["ollama"]`;
  - `officiatorFallback`: `raid` asks RAID's ranked candidates next, `none` stops there (no paid agent);
  - `officiatorModel` (blank = the bridge's default) and `officiatorMaxTokens`.
  - A key added after the table was first seeded now reaches an existing install, seeded and logged.
- **The officiator** (`cortex/core/raid/officiator.js`):
  - asks his list first, then RAID's ranking only when the fallback is `raid`;
  - asks local agents (ollama, mistral) through `lib/ollama-port.js`, still inside WARP. A local failure counts as silence, which teaches
    RAID nothing.
- **The door:** Cortex `GET /api/raid/tunables` (every option: value, default, changed) and `POST /api/raid/tunables { key, value }`.
  Commands:
  - `raid tunables`
  - `raid tune <key> <json>`, e.g. `raid tune officiatorFallback none` or `raid tune officiatorAgents '["ollama","chatgpt"]'`
- **Failure reports** (`intelligence/index.js`): each failure scan writes one report per fault class to
  `intelligence/data/failures/<faultClass>.json`, with a Windows-safe name and rewritten only when it changed, and appends one line to
  `_scans.jsonl`.
  - The coder's reading, to confirm: these are Intelligence's reports (its analysis). The failure-mode records stay Cortex's, as the books.

## Proof
- `test-officiator-local-first` 4/4 (new, in run-all):
  - OL-01: the options reach an existing table, and bad values are refused;
  - OL-02: the local agent is asked through the port, never through NCP;
  - OL-03: with `none`, no other agent is asked;
  - OL-04: reports land in `failures/`, unchanged files are not rewritten, and one line is added per scan.
- Unchanged and still green: `test-raid-officiator` 18/18, `test-build-paths` 6/6, `raid-tunables` 8/8, `intelligence` 15/15,
  `test-intelligence-core-wired` 7/7.
- `test-raid-officiator` now sets `officiatorAgents` to `[]`, because it tests RAID's ranked walk, which is unchanged. In OFF-RT1b, RAID's
  own "ollama" candidate is stubbed at the port instead of NCP. Said, not hidden.

## Not yet (said)
- **The default still falls back to RAID's ranking**, which can reach Claude when Ollama fails. To never reach a paid agent here:
  `raid tune officiatorFallback none`.
- **Not run on his machine.** The proof there: the next staged artifact appears as an ollama-bridge job ("caller cortex.raid.officiator"),
  not a Guardian job to claude; and `intelligence/data/failures` fills within one failure scan.
- **No UI yet** for the options (his order: the UI is his, last).
- **Found, not fixed:** running `intelligence.test.js` and its neighbours rewrites tracked files in the real tree
  (`intelligence/data/nodes/bep_pattern/*`, `data/lattice/…`). Restored by hand here, not committed. A test-sandbox leak to close.
- Versionium: recorded on his machine by the boot sync.
