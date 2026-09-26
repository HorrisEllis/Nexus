# copilot-tool-system.spec

```
spec_id:      nexus.spec.copilot-tool-system
uuid:         nexus-spec-copilot-tool-system-v1-0000-2026-0819-001
version:      0.1.0
status:       Specified                     # §17.2
owner:        copilot                       # §17.1
authority:    direct read of nexus-2026-08-19-hey-nexus-merged
governs:      lib/agent-tools/**, lib/agent-reach.js, lib/tool-forge*,
              copilot/lib/autonomy-router.js, guardian NCP surface
created:      2026-08-19
```

## §0 The ask, and what already answers it

> "a huge co-pilot tool system. like you can program and customize, expand
> edit, with co-pilot. like full config with options. the change agents tool
> needs to connect to the actual chats with the ncp, userscripts, clearglass."

Two things, and they are at very different stages.

**The second is a defect, and it is fixed in this drop.** `switch_agent` v1
wrote a row to `copilot_identity` and stopped. It never asked guardian whether
a tab was open, so switching to a closed ChatGPT window succeeded exactly as
loudly as switching to a live one. `lib/agent-reach.js` + `switch_agent` 2.0.0,
12 tests. See §3.

**The first largely exists.** `forge_tool` (2026-08-09, *"giving the system a
system for its own capabilities"*) already lets co-pilot make tools, and its
central decision is the right one: **a forged tool is DATA — a name, a JSON
schema, and steps that bind to things already proven to exist.** Nothing new
executes. That is what makes a self-extending tool system safe rather than a
remote-code-execution surface with a friendly name.

So this spec does not build a tool system. §1.1, §16.5, §16.7. It specifies the
**config layer** that is genuinely missing on top of the one you have.

## §1 What exists (verified, not assumed)

| piece | file | state |
|---|---|---|
| ~71 tools across 8 categories | `lib/agent-tools/tools/*/` | real |
| tools that make tools | `execution/forge-tool.js` | real — forged tools are data |
| tool runtime | `copilot/tool-runtime.js` | real |
| tool index (persisted) | JAA `tool_index`, 66 rows | real |
| conversational control of tools | `copilot/lib/autonomy-router.js` 2.0.0 | real, propose-then-confirm |
| capability declaration/serving audit | `coordination/capability-tools.js` | real — already names 16 declared-and-unserved |
| **per-tool config** | — | **missing** |
| **enable/disable a tool** | — | **missing** |
| **edit a forged tool** | — | **missing (forge is create-only)** |
| **tool-level budgets / rate limits** | — | **missing** |

## §2 The gaps

- **CTS-GAP-1 — no config surface.** A tool is on or it is absent. There is no
  per-tool `{enabled, defaults, limits, allowedAgents, requiresConfirm}`. "Full
  config with options" is exactly this and it does not exist.
- **CTS-GAP-2 — forge is create-only.** You can make a tool and you cannot edit
  it. Same defect class as hat-forge before 2026-08-18: an artifact you can
  create but not amend is one you replace instead, and the replacements
  accumulate as duplicates (§0.3, §16.5).
- **CTS-GAP-3 — no per-tool budget.** `run-command`, `safe-apply` and
  `parallel-dispatch` all cost real money or real writes and none carries a
  ceiling. §15.1 wants a budget that is loud on exhaustion.
- **CTS-GAP-4 — tools cannot say whether their dependencies are live.** This is
  the general form of the `switch_agent` bug just fixed: a tool that dispatches
  to chatgpt should be able to report "my dependency is not connected" *before*
  an agent plans around it, not after the dispatch times out. `agent-reach.js`
  is the first instance of the answer; nothing else has one.
- **CTS-GAP-5 — no config provenance.** When a tool's behaviour changes,
  nothing records who changed it, when, or why (§17.3, §17.5).

## §3 Phases

### P0 — the change-agent connection  ✅ **DONE in this drop**

`lib/agent-reach.js` 1.0.0 + `switch_agent` 2.0.0 + 12 tests.

Three states, never two: `reachable` / `unreachable` / `unknown`. "Guardian is
down so I could not ask" is a different fact from "the tab is closed", and v1
had neither — it reported success for both. Not every agent is a tab: ollama is
a local bridge on :3749 and `auto` is a routing decision, so a naive
everything-is-NCP check would have refused a working ollama switch and been
worse than the bug.

Default is refusal with the list of what IS connected. `force:true` overrides
and is **recorded as forced** (§17.5) — a tab closed now may open a second
later, and a hard block would cost optionality (§0.4).

---

### P1 — a tool config record  *(closes CTS-GAP-1, CTS-GAP-5)*

- **Do:** one JAA-backed record per tool: `{ toolName, enabled, defaults,
  limits, allowedAgents, requiresConfirm, notes, changedBy, changedAt, reason }`.
- **§17.5:** every change appends; nothing overwrites (§0.3). "Why is this tool
  behaving differently than last week" must be answerable.
- **§5.14:** absence of a record means default behaviour. Adding config must
  not change what an unconfigured tool does — otherwise landing this patch
  silently alters 71 tools at once.
- **§16.3:** `enabled: false` is refused at the runtime, structurally, not by
  each tool checking politely.
- **Gate:** disable one tool; it disappears from the surface the agent sees AND
  refuses if called directly by name. Both, or the gate has not passed.

---

### P2 — forged tools become editable  *(closes CTS-GAP-2)*

- **Do:** `forge_tool` gains `edit` and `disable`. Steps are re-proven at edit
  time exactly as at forge time — §1.1 does not weaken because a tool already
  exists.
- **§0.3:** an edit appends a version; the previous one stays readable.
- **Gate:** edit a forged tool, break one of its steps deliberately, and watch
  the edit refused with the specific step named.

---

### P3 — per-tool budgets  *(closes CTS-GAP-3)*

- **Do:** `limits: { perHour, perSession, maxConcurrent, wallClockMs }`,
  enforced in the runtime.
- **§15.1/§1.2:** exhaustion emits a specific event naming the tool, the limit
  and the spend. It never silently no-ops.
- **Gate:** a tool at its ceiling refuses with a loud, specific reason, and the
  event is in `event_log`.

---

### P4 — dependency health per tool  *(closes CTS-GAP-4)*

- **Do:** a tool may declare `dependsOn: ['guardian:ncp:chatgpt', 'cortex']`.
  The runtime resolves those through `agent-reach.js` and the existing health
  surfaces, and reports them **before** an agent plans around the tool.
- **§12.6:** this is the diagnostic-engine law applied to the tool layer.
- **Gate:** with the chatgpt tab closed, a tool depending on it reports
  unavailable *before* dispatch rather than timing out during it.

---

### P5 — surfaces (§3.4, in order, after P1's gate)

API → CLI → UI. A tool-config panel is a projection (§5.12) and comes last.

**Before any of it: run the P0 audit from `clear-glass-toolkit.spec`** — 71
declared vs 26 served. Building a config UI over tools that do not resolve
would put a switch next to a capability that leads nowhere.

## §4 Invariants

- **CTS-INV-1** A forged tool is data. Nothing forged ever executes new code.
- **CTS-INV-2** An unconfigured tool behaves exactly as it does today. (§5.14)
- **CTS-INV-3** Config changes append with author and reason. (§0.3, §17.5)
- **CTS-INV-4** `enabled:false` is enforced structurally, not per-tool. (§16.3)
- **CTS-INV-5** Steps are re-proven on edit, not only on create. (§1.1)
- **CTS-INV-6** A tool reports its dependencies' health before dispatch, not
  after timeout. (§12.6)
- **CTS-INV-7** Unavailable, unreachable and unknown stay three distinct
  states everywhere. (§1.2)

## §5 Tests (§12.1)

`CTS-001` a disabled tool is absent from the agent surface AND refuses direct
calls · `CTS-002` an unconfigured tool is byte-identical in behaviour to
pre-patch · `CTS-003` a config change records author, time and reason ·
`CTS-004` an edit with a broken step is refused, naming the step · `CTS-005`
the previous version of an edited tool stays readable · `CTS-006` a tool at its
hourly ceiling refuses loudly and emits the event · `CTS-007` a tool depending
on a closed NCP tab reports unavailable before dispatch · `CTS-008` an agent
cannot enable a tool it is not allowed (§IP-5) · `CTS-009` config is never
executable — a config value that looks like code is stored as text

## §6 Drift (§12.5)

| date | checked | finding |
|---|---|---|
| 2026-08-19 | written | P0 implemented and tested (12). P1–P5 unimplemented. `forge_tool`, tool-runtime, `tool_index` (66 rows) and autonomy-router all verified present. |
| 2026-08-19 | P1 IMPLEMENTED | `lib/tool-config.js` 1.0.0 + `tool_config` agent tool + enforcement at BOTH gates in `lib/agent-tools/index.js` (`getToolSchemas` and `executeTool`). 22 tests. **The ratchet:** tightening applies immediately from anyone; loosening requires `by:'user'` and returns a proposal otherwise. The agent tool has no `by` parameter, so the model cannot promise it is the user (TC-009, TC-010). CTS-INV-2 pinned by TC-001 — an unconfigured tool is byte-identical to pre-patch, which is what protects the other ~71. Limits/budgets deliberately NOT included: a stored limit nothing enforces is a placeholder that looks like a safeguard (§1.3) — that is P3. |

## §7 Rejected alternatives (§17.3)

- **A new tool system.** Rejected: `forge_tool` exists and its data-not-code
  decision is correct. A second one is §10.3.
- **Letting forged tools contain executable code.** Rejected hard. It converts
  a self-extending capability layer into remote code execution wearing a
  friendly name. The current design gives the same expressive power by
  composing proven steps.
- **Hard-blocking a switch to an unreachable agent.** Rejected: tabs flap —
  `"ncp: flap"` is a crystallised pattern in your own `bep_patterns`. Refuse by
  default, allow `force`, record that it was forced.
- **One `available: true/false` field instead of three states.** Rejected: it
  is the exact collapse that produced this bug. A caller that cannot tell "I
  could not ask" from "it is closed" will do the wrong thing with both.
