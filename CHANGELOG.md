# CHANGELOG

## [3.1.0] — 2026-06-15

### Added
- `guardian/lib/cli-registry.js` — JAA-backed dynamic CLI command store. Every custom command is a UUID record: `{ name, selector, action, provider, desc }`. Operations: `set`, `markPickPending`, `resolvePick`, `resolve`, `list`, `delete`. `resolve()` gates execution — blocks if selector is null or pick is pending.
- `guardian/lib/dom-picker-inject.js` — Browser JS string injected via NCP `NEXUS_DOM_PICK`. Full-page overlay, crosshair cursor, blue highlight box tracking hovered element, selector label. On click: computes stable CSS selector (semantic attrs → id → nth-of-type path), posts `/cli/pick-result`. ESC/30s timeout posts `/cli/pick-cancel`.
- `guardian/server.js`: eight new routes — `GET/POST /cli/commands`, `DELETE /cli/commands/:name`, `POST /cli/pick`, `POST /cli/pick-result`, `POST /cli/pick-cancel`, `POST /cli/exec-command`, `POST /bda/observe`.
- `guardian/server.js`: `cli` sub-commands in `/cli/exec` switch — `cli list | set | pick | del | run | help`.
- `guardian/server.js`: `NEXUS_CLI_RESULT` case in `_handleNCPMessage` — logs exec result to bus + cockpit SSE.
- `guardian/userscript-claude.js`: `NEXUS_DOM_PICK` NCP case — evals `pickerScript` or falls back to `_domPickerActivate`.
- `guardian/userscript-claude.js`: `NEXUS_CLI_EXEC` NCP case — calls `_execDOMCommand`.
- `guardian/userscript-claude.js`: `_execDOMCommand` — runs click/focus/read/hover/clear/type:/attr: on live DOM with native input event dispatch for React/Vue compatibility.
- `guardian/userscript-claude.js`: `_postCliResult`, `_domPickerActivate`, `_stableSelector` — fallback picker, result posting, selector algorithm.

### Changed
- `guardian/api-dispatch.js` → v1.1.0: one `BDAKernel` per provider, persisted for process lifetime. Observes `assistant` responses only (coding drift is an LLM output property). Events: `regime` → `console.warn` + `raid.recordDrift()`, `drift` → `console.warn` with all 5 signals, `alert` (DYSREGULATED/COLLAPSING) → `console.error` + `escalation.escalate()`, `gap` (crit ≥ 0.85) → `console.warn`. Every dispatch logs structured `OK` line with regime and gapScore. `bdaState()` exported.
- `cortex/core/raid/index.js` → v6.1.0: `recordOutcome()` implemented (was stub). `recordDrift()` added — regime-scaled weight penalty (OSCILLATING=0.05 … COLLAPSING=0.60), writes JAA gap, escalates at ≥0.35. Diagnostic engines run on every dispatch failure (causal chain trace, invariant scan, SNR floor). Agent going offline at 3+ consecutive fails triggers escalation level 1. Every routing decision, skip, and failure emits structured console line. `getState()` exposes `diagEnabled` and `escEnabled`.
- `guardian/userscript-ollama.js`: added `_streamBuffer` — accumulates all tokens during stream. On `done` (both `onprogress` and `onload` paths): posts full text to `Guardian /bda/observe` via `GM_xmlhttpRequest`. Logs drift regime/sigma/trust to console. Widget shows drift warning if regime ≥ OSCILLATING.

### Axioms satisfied this session
- §1.2 — every failure, drift event, and gap is loud, specific, and console-traced
- §2.3 — BDA state observable via bus events, cockpit SSE, and `/bda/observe` response
- §5.1 — every cli_commands record has a UUID in JAA
- §5.2 — streaming providers now connect to Guardian BDA bridge via `/bda/observe`
- §5.3 — full system patch: 5 files modified, 2 files added, all cross-references updated
- §5.7 — drift signals route to RAID via `recordDrift()`, not direct module coupling
- §8.3 — SISO and JAA present at session start; all work built on canonical foundation

