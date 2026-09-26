# NEXUS — Session Handoff (2)

**Repo state:** `master` at `1cd9090`. Working tree clean. `system` version bumped 0.39.38 -> 0.39.46 in lib/version.js and package.json (was drifted 8 versions behind real work before this update — the parallel session's own 0.39.39-0.39.46 numbering was never reflected here since it lived in an uncommitted, unmerged zip until now).

This is a continuation of `docs/2026-09-02-session-handoff.md` — read that one first for everything through `d957861`. This document covers what happened after: the fork it flagged got resolved, plus three real bugs found from James's own live testing.

---

## 1. The userscript fork — resolved, not a real divergence

The previous handoff flagged `guardian/nexus-hey-claude.user.js` vs `guardian/userscript-claude.js` as an unreconciled fork. Checked directly: `userscript-claude.js` has every function the `.user.js` file has, plus 11 more (the whole tool-calling loop, the ACK-injection hat fix). Zero functions exist only in the old file. It's stale, not divergent — left untouched (§0.3), all real work continued on `userscript-claude.js`.

## 2. What shipped since the last handoff

| Commit | What |
|---|---|
| `789d548` | Real Intelligence & Contracts panel in the NEXUS tab (claude+chatgpt only — gemini/perplexity deliberately excluded, their own headers document a leaner design) |
| `a7a0e0a` | Cookie-vault IPC round-trip — found a real bridge already existed (`webview-bridge.js`), WebRTC was never needed |
| `b8cbb47` | Userscript protocol parity — found 3 of 4 provider scripts never wired `window.__nexusInjectAnswer` at all (wake-word answers silently never rendered) |
| `16f512e` | AM8 — the real, two-step element-picker "add as new agent" pairing flow |
| `6420bb9` | **The big one** — real root cause of "Guardian: DISCONNECTED" + wake word never firing (mixed content blocking every local HTTP call from an HTTPS page in a real standalone browser), the `agents:list` IPC crash (collided with a pre-existing, real agent-mesh registry), and versionium's own missing contract-path registration |
| `1cd9090` | Merged a real parallel session's uncommitted work: the RAID "always fails" bug (missing SEAM VERDICT instruction), agent-mesh→Guardian connection, and the first real slice of primitive/invariant boundary checking |

## 3. The three real bugs from James's own live testing (`6420bb9`)

All three came from one real boot log and one real screenshot, and all three trace to genuine root causes, not surface patches:

- **Mixed content, not "the userscript is broken."** James tested in a real standalone browser (not clear-glass). Every local endpoint these scripts talk to is plain `http://127.0.0.1:<port>`, while `claude.ai`/`chatgpt.com` are HTTPS — a standard browser security block with zero code-level workaround from a normal page. `GM_xmlhttpRequest` is the real, correct answer (Tampermonkey-privileged, bypasses this), but 12+ real call sites still used plain `fetch()`, and the live NCP connection used a native `EventSource` with no privileged equivalent by default. Since wake-word arming only happens inside that connection's `onopen`, a blocked connection meant "hey nexus" was never armed — one root cause, two reported symptoms. Built real `_gmFetch()`/`_gmEventSource()` wrappers (the latter a genuine incremental SSE parser over `GM_xmlhttpRequest`'s `onprogress`, not polling pretending to stream) and converted every real call site across all 4 provider userscripts. 21 tests confirm zero plain calls remain.
- **The `agents:list` crash was my own regression.** AM8 (built last session) picked a channel name that collided with a pre-existing, real agent-mesh registry handler. Electron's `ipcMain.handle()` throws on a duplicate registration — this is almost certainly also why "agent mesh does nothing when clicked" was reported separately. Renamed to `custom-agents:*`.
- **versionium's contract 404 was my own earlier gap.** VS1 (built this session) never got added to orchestrator's `CONTRACT_PATHS` map, so every poll hit the wrong URL and got a plain-text 404 that orchestrator tried to parse as JSON. One-line fix, now tested against every sovereign system.

## 4. What the merged parallel session's work adds (`1cd9090`)

- **RAID contracts were failing 100% of the time, regardless of real outcome.** `officiator.js`'s submitted content never asked the agent to report a verdict in the exact literal format (`"SEAM VERDICT: PASS/FAIL"`) `contract-intake.js`'s default checker requires. An agent doing genuinely correct work still had no reason to say those words. Fixed in both real dispatch paths.
- **`agent-mesh.js` now tries Guardian first** for claude/chatgpt specifically (the only two with real Guardian userscript coverage), falling through honestly to its own DOM automation on any failure. This directly answers James's own question from earlier in the session ("is it mapped to the agent mesh, guardian?") — yes, now it is.
- **The first real slice of primitive/invariant boundary checking** — `context-gate.js` + `context-synthesis.js`, honestly scoped: only `primitive_match` is actually evaluated today (checked `warp/core/Axiom.js` directly first — a context candidate isn't shaped for it, so this doesn't fake-call it). `invariants`/`principles` are carried through as real, unevaluated data since every real boundary row's `invariants` are still empty arrays.

## 5. Real, still-open asks from this same conversation, not yet started

- **Per-system primitives lists in every spec + a self-updating aggregator.** Checked: only `warp.spec` and eravos's kernel spec have a real `primitives:` field today. Recommended approach: pilot on versionium's spec first (already the most complete "living model" example) before building the aggregator or touching the other ~13 systems.
- **Autopilot has no `event-taxonomy.js` of its own** — a real, previously-flagged gap (T2 in the vision phasemap), still unbuilt. It does already read guardian's real ledger/artifacts live, so it isn't blind to guardian, but has no formal taxonomy file the way guardian/orchestrator/cortex/clear-glass/versionium do.
- **"JSON-style tool responses from agents"** — James asked for agents' tool-call responses to be listened for and parsed as structured JSON/commands. Not investigated yet this pass.
- **SEAM's explicitness** — James: "the seam is still explicit... I am not here to type everything in." Folding SEAM's real chunking capability into the NEXUS tab (removing it as a standalone paste-box tab) is still deliberately deferred, not started.
- **The "Agent Connected" log format** (`provider=... agent=... intent=... contract=... tab=...`) — flagged one real, open question worth verifying against actual code before assuming: whether `tab` is a stable session identifier or a fresh UUID per connection, since "tab id is the chaturl" is a specific factual claim that hasn't been checked against the real code yet.

## 6. Test coverage added this session (all passing as of `1cd9090`)

New since the last handoff: `test-nexus-intelligence-section.js` (7), `test-cookie-vault-ipc-roundtrip.js` (8), `test-userscript-protocol-parity.js` (12), `test-guardian-agent-registry.js` (11), `test-userscript-mixed-content-fix.js` (21), `test-contract-handshake-paths.js` (9). `test-raid-officiator.js` extended to 13 (added OFF-012/013 for the SEAM VERDICT fix).

`node scripts/precommit-check.js` clean as of `1cd9090` — 54 specs synced, same 3 pre-existing, unrelated warnings as every prior check this session.
