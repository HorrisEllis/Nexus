# 0.39.304 — 2026-10-02

James: "get ollama solid. i need this done."
James: "can we just have the files grey until they are actual js files?"

## Every phase that names files can now be proven
**Before:** no phase in the maps declared `conditions:`, so every phase run read "no-proof" and Ollama never got feedback.

**Now:** a phase that declares no conditions is checked against what it *does* declare, its `files:`:
- **each file must exist;**
- **each JavaScript file must be real, working JS:** it has to pass `node --check`.

Broken JS counts as unmet, and its error goes back to Ollama as the next attempt's feedback. A file counts only once it's actual, valid JavaScript.

**Proof:** `tests/modules/test-phase-proof.test.js` passes **7/7**. The new case, PP-07, has a stand-in agent write broken JS: the run reads unproven, with the syntax check named as the unmet promise. When the agent writes valid JS, the run reads proven.
