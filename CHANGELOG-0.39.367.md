# 0.39.367 — 2026-10-07

James: "okay begin building this, phase it, build it, one by one, focus on coding using overlapping primitives?. honestly. i want to be able to begin using you inside of the nexus repo. make it enterprise, consistent both in style and architecture, most amount of leverage, least amount of tokens without losing capability or power."

## Mapped first
`docs/2026-10-07-compartment-control-and-activity-phasemap.spec`, registered in `SPEC-REGISTRY`. The order is CC1 → AL1 → AL2 → DT1 → VM1 → NC2 → BO1.

Every phase reuses one of four primitives, never a second way of doing the same thing:

| Primitive | Where it lives | What it is |
|---|---|---|
| **land** | `lib/repo-inject.js` | One file an agent produced, through one path |
| **activity** | `lib/activity-log/compartment.js` | One durable row per thing that happened (AL1) |
| **dispatch** | `lib/repo-agent.js` | The one door to the agent wearing a hat |
| **intent** | `cos/foundation/intent.js` | A compartment's end state |

**NC1 is answered.**
- Nothing edits the files the running Nexus is made of except through the approval gate that already exists.
- A Nexus system's desktop runs a **copy** of Nexus.

## CC1 — Claude Code lands like every agent
**Found:** Claude Code was already a provider (IN2a), and it already works in a copy of the repo. But its diff was written back straight through the repo layer. That skipped two things:
- the repo's inject mode, so it bypassed review;
- a Nexus repo's approval gate, so it bypassed approval.

**Built:**
- **`land()`** takes one file an agent produced and passes it through the same steps every time:
  1. the `code.write` gate: never empty, and it must parse where that can be checked;
  2. the collapse guard: never a bare path or a sliver over a real file;
  3. the repo's mode: staged (the economy), proposed (review), or applied (auto). A Nexus repo is always proposed through its gate.
- **`fromReply()`** now calls `land()` once per fenced block; behaviour is unchanged.
- **`fromChanges()`** calls `land()` once per changed file of a coding agent's diff. A binary file is refused with its reason.
- **Claude Code's diff now goes through `fromChanges()`.**

So picking **claude-code** as the provider on `nexus/core` means Claude working inside the Nexus repo, with every change a proposal on the work surface that touches the live tree only when you approve it. The settings card now names claude-code as a choice.

## Brought up to date (docs/CLAUDE.md's rules)
- **`lib/version.js` and `package.json`** go from 0.39.360 to 0.39.367. Versions 361–366 had been released without a version line; each now has one, opening with your words.
- **run-all** now registers the five suites that were missing: agent-record, chunked-phase-build, resource-adaptive, provider-host-load, repo-activity.
- **Loom:**
  - new `loom/maps/declare-map.js`: the declare loop every hand map re-implemented, now written once;
  - `loom/maps/compartment-activity-map.js`: idearium's `_require` edges into repo-activity, resource-monitor and repo-inject, which the scanner can't read.
- **Addendum** to IN2 in the emerge-field phasemap, recording the drift found and the fix.

## Proof

| Suite | Result | What it shows |
|---|---|---|
| `test-claude-code-backend` | 6/6 | CC-04 now covers both modes: review gives three proposals and writes nothing; auto writes, and PH1 still proves |
| `test-nexus-inject-approval` | 9/9 | New IG-009: a coding agent's diff on a Nexus repo becomes proposals through the gate, owned by the system; a collapsed file and a binary are refused; the live tree is untouched |
| `test-repo-inject` | 83/83 | Unchanged after the extraction |
