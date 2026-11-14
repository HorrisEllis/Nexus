# 0.60.532 — the Console reaches RAID and the agents; his request goes through RAID; the phase readers read his PC's maps

James, 2026-11-14, with a screenshot of COS › Automation › "His request" held at its first step ("say what you want — the flow starts from
your words"): "that pipeline needs to be from the cli into raid or copilot. like integrate this better" · "thats a problem also the console
in cos, is supposed to hook into each system, and agent. floating menu 3 way cli, nexus-cli, etc."

## Found (on his PC)
- "His request" run from the Automation page starts with no words: the page had no way to give them, so the first step answered HTTP 400.
- The Console's `request <words>` started the pipeline directly; RAID never saw his words (RD9's "every input reaches RAID first").
- The Console had no way to an agent. The floating menu's command line reaches three (Ollama, the co-pilot, a Guardian agent) by copilot's
  `/api/prompt`.
- A line the Console did not know was answered with the table and went nowhere (RD9 slice c was not built).
- **The phase readers saw 116 phases in 11 maps on his PC; there are 2,692 in 245.** His checkout has Windows line endings (CRLF), and
  `lib/phase-dag.js`, `lib/phase-files.js` and `lib/phasemap-parse.js` split on `\n` only, so every phase line ended in `\r` and matched
  nothing. Idearium's build pipeline, the DAG and the phase ledger read through them: on his PC a phase asked for by name was "no phase … in
  the map". (Found 2026-11-13 as the ledger's gap; first blamed on CRLF, then wrongly withdrawn, then proven by test.)

## Built
- **CH1, COS's Console (`cos/manager/cli.js`):**
  - `ask [@ollama|@copilot|@guardian[:agent]] <words>` (or just `@ollama <words>`): asks an agent by the floating menu's own route. Copilot
    starts on demand, so it is woken first; one that does not start is said.
  - `raid <words>`: his words to RAID (`POST /api/raid/input`): kept as a `.input` node, drafted into a contract, its gaps listed.
  - A line COS's table does not know goes to RAID as an input, and is said as such (RD9 slice c, for COS's Console). RAID not answering:
    said with why, and the table shown as before.
  - `request <words>` hands the words to RAID first; the run carries the input and contract ids. RAID down does not stop his request: said.
- **The Automation page:** a value a pipeline declares and leaves empty (its `words`) is asked for before Run starts.
- **LE1, the phase readers accept CRLF** (three files, seven line splits).

## Proof
- `node tests/modules/test-cos-console.test.js`: 10 passed, 0 failed (CC-12 is new; CC-09 skipped: no page engine in this checkout).
- `node idearium/spec-engine/phase-ledger.cjs` on his PC: before, "116 phases in 11 maps"; after, "2692 phases in 245 maps".
- `test-cos-pipeline` on his PC: 19 passed, 2 failed before; 20 passed, 1 failed after (CP-15, "no phase PC7_iterate_to_the_end_state", now
  passes). `test-phase-dag` 8/8.
- Not proved: `ask` and `raid` against his live copilot and Cortex (the tests use stand-ins); the Automation page's box, on his screen.

## Still failing on his PC, not from this release (named, to phase)
- `test-cos-pipeline` CP-13 ("the macro says what it needs") and `test-phase-ledger` PL-06 ("filled after the paint"): both fail the same
  way without this release's changes.

## Not built
- The Console reaching each system's own commands (SC10): Cortex has a door; DO1, DO2, DO5, DO7, DO8 are open. The Nexus CLI (`nexus.command`)
  sending what it does not know to RAID (the rest of RD9 slice c). RAID acting on what it routes (RD9's "the router acts").

Coder's part: the diagnosis, the code, the tests, and the wrong withdrawal of the CRLF finding on 2026-11-13, corrected the same day.
