# docs/open-loops/OPEN-LOOPS.spec — his Open Loops spec, received 2026-11-01 as OPEN-LOOPS-SPEC.md, text unchanged (SE_D4: specs are .spec).
# A sovereign project of his, not a Nexus system (its own §0). Its v0.2 code: _archive/imports/2026-11-01-uploads/open-loops-v0.2.zip.

# OPEN-LOOPS-SPEC.md
## Open Loops — standalone sovereign project

Status: MAP (pre-build, per §3.3 — written artifact before implementation)
Owner: James Brooks
Relationship to other systems: sovereign — not owned by MASTERMIND or NEXUS, per §5.9–5.14 (every system sovereign, UI disposable, every layer replaceable). Integrates with MASTERMIND (Brain Map, Horizon Planner) as consumers of its data, and with ClearGlass (Guardian/Cortex/copilot) as a shared dependency for AI-assistance and memory — but Open Loops owns its own data, its own event types, and its own lifecycle. Either integration point could be swapped or dropped without touching the core.

---

## 0. Purpose

A module that turns unresolved mental loops into curiosity-driven, PDA-safe, agoraphobia-aware invitations to go outside — without ever functioning as a demand. Closes loops that are "outside-solvable" by routing them through real-world micro-quests instead of leaving them to spin.

Non-goals: this is not a habit tracker, not a fitness app, not an exposure-therapy protocol. It does not diagnose, does not escalate tiers on your behalf, and carries no penalty state.

---

## 1. Core Interaction Contract (immutable, PDA-safe)

- **No demand framing anywhere in copy, UI, or notifications.** No "you should," no "today's goal," no due dates.
- **Every offered action has exactly three responses:** `Yes` / `Not now` / `Reframe`. `Not now` costs nothing — no streak break, no red state, no missed-day counter.
- **`Reframe` always available** — pulls a different micro-quest from the same loop or a sibling loop instantly. PDA needs an alternative on hand, not just an escape hatch.
- **Ladder position is self-set, never system-advanced.** The system reads your current tier; it never proposes moving up.
- **Metrics only ever count positive events** ("loops discharged," "quests taken"). No absence is ever logged as a negative.

Any future feature added to this module must pass these five constraints before merge — treat as a permanent gate, same weight as an AXIOM.

---

## 2. Data Model

```
Loop {
  id: UUID
  text: string                  // raw capture, voice-first
  concepts: string[]             // extracted via existing concept extractor
  created_at: timestamp
  status: 'open' | 'desk_closed' | 'outside_closed' | 'dormant'
  solvability: 'desk' | 'outside' | 'unclassified'
  linked_node_id: UUID?          // Brain Map node this loop attaches to
}

MicroQuest {
  id: UUID
  loop_id: UUID                  // FK -> Loop
  prompt: string                 // curiosity-framed, specific, never imperative
  tier_required: ExposureTier.id
  location_hint: string?         // optional, e.g. "within 2 blocks"
  offered_at: timestamp[]        // every time it was shown (for reframe cycling)
  response_log: [{ ts, response: 'yes'|'not_now'|'reframe' }]
}

ExposureTier {
  id: UUID
  label: string                  // user-defined, e.g. "porch", "driveway", "block", "park"
  order: int                     // user-defined sequence
  active: boolean                // which tier the system currently reads from
  quest_flavor_notes: string     // what kind of bait works at this tier (user-authored)
}

DischargeEvent {
  id: UUID
  loop_id: UUID
  quest_id: UUID?
  ts: timestamp
  mode: 'desk' | 'outside'
  note: string?                  // optional post-hoc reflection, never required
}

PatternSet {
  id: UUID
  label: string                  // e.g. "silver-veined plants", "outside-vocabulary: sound"
  members: UUID[]                 // Loop or MicroQuest ids that belong to this set
  expected_size: int?             // null = open-ended set, only used for real, user-declared sets
  linked_node_id: UUID?           // Brain Map cluster this set visualizes as
}
```

`PatternSet` exists purely to make gaps *detectable* rather than *inferred* — §6c pattern-completion bait reads directly off `members.length` vs `expected_size` (or off a Brain Map cluster's dangling-edge count), never off a heuristic guess at what "should" be there. Keeps fabricated incompleteness structurally impossible, not just a style rule.

---

## 3. Event Bus Wiring (WARP v1.4)

New event types on the existing bus, following §5.1 (UUID+hook+bus on everything) and §5.2 (everything implements the bridge):

- `loop.captured` — fired on any Voice Lattice / quick-capture entry; triggers classification.
- `loop.classified` — fired when solvability tag is set (manual or heuristic-assisted, never auto-committed without visibility).
- `quest.offered` — fired when a MicroQuest is surfaced to the user.
- `quest.responded` — payload includes `yes|not_now|reframe`; `not_now` and `reframe` must not trigger any downstream "streak" or "score" consumer — enforce this at the bus level, not just the UI level, so no future module can accidentally add pressure.
- `loop.discharged` — fired on closure, carries `mode: desk|outside`.
- `tier.changed` — fired only on explicit user action; never system-initiated.

Content-addressable digest cache (existing WARP primitive) applies to Loop/MicroQuest pairs so repeated captures of the same underlying concern don't spam duplicate quests.

---

## 4. Brain Map Integration (consumer, not container)

Open Loops owns `loop_node` data; Brain Map just renders it as one more node type it knows how to display — same relationship it'd have to any other sovereign system feeding it nodes.

- New node type: `loop_node`, color-coded by `solvability` (desk vs outside vs unclassified).
- `outside_closed` loops get a distinct visual marker (e.g. small compass glyph) — a passive, non-gamified record that a loop was resolved by going out, not a badge/achievement system.
- Node linking: loops can attach to existing framework/insight nodes so an outside-closed loop visibly feeds back into the idea it was blocking.
- If Brain Map were ever unavailable or swapped out, Open Loops data stays intact — the node type is a rendering hint Brain Map consumes, not a schema Open Loops depends on.

## 5. Horizon Planner Integration (consumer, not container)

- ExposureTier list lives in Open Loops' own store; Horizon Planner surfaces it as a simple user-editable ladder (add/reorder/rename tiers, no system suggestions) the same way it'd surface any external planning data.
- Horizon Planner surfaces open `outside`-tagged loops as available quest sources — but only when you open the planner, never as a push/interrupt.
- No calendar scheduling of quests. Time-boxing, if ever added, would need its own PDA-safe design pass — flagging as explicitly out of scope for v1.

---

## 6. Curiosity Bait Generation

Heuristic for v1 (no LLM call required, keeps it deterministic and fast):
1. Pull `concepts[]` from the loop.
2. Match against a small user-authored "outside vocabulary" table (places, objects, sensory categories near you that could plausibly connect to a concept) — you seed this once, e.g. "plants," "the river," "the used bookstore," "the guy at the hardware store."
3. Generate a single-sentence quest phrased as an open question, not an instruction: "Is there a plant near you that has silver-veined leaves?" not "Go find a plant."
4. Tag with lowest tier whose `quest_flavor_notes` match the vocabulary category.

v2 (optional, later): route through Claude API for richer bait generation using loop text + concepts + current tier notes as context — same "Claude in Claude" pattern used elsewhere in your stack, gated behind explicit opt-in since it adds network dependency.

---

## 6b. Provocation Bait (PDA-native mode)

Curiosity bait asks a question. Provocation bait removes the question entirely and plants a claim — because for a PDA profile, being *asked* to do something is itself the trigger, even when the ask is gentle. A claim that might be wrong has no asker. There's nothing to resist. There's just something to disprove.

**Mechanic**: instead of phrasing the quest as an open question, phrase it as a mildly doubtful assertion about the world, about you, or about the loop itself.

Examples, same underlying loop ("silver-veined plant near the river"):
- Curiosity mode: *"Is there a plant near you with silver-veined leaves?"*
- Provocation mode: *"You probably won't find that plant near the river before it gets dark."*
- Provocation mode: *"Bet the bookstore's already closed."*
- Provocation mode: *"Doubt that hardware store guy would actually know the answer."*

The claim must:
- Be genuinely uncertain (not obviously true or false — if you already know the answer, it's not bait, it's just a fact).
- Never target self-worth, competence, or identity. It doubts the *world* or the *outcome* ("the shop's closed," "you won't make it before dark"), never doubts *you* ("you never follow through," "you can't stick to anything"). That line is absolute — provocation bait about the environment is fuel; provocation bait about your character is exactly the kind of internalized pressure this whole system exists to route around.
- Stay light — a dare, not a taunt. Tone target: someone ribbing a friend, not someone testing you.

**Data model addition**:
```
MicroQuest.bait_mode: 'curiosity' | 'provocation'
```
Both modes draw from the same Loop/concept pool in §6; generation just picks a different template family. Response logging (`yes`/`not_now`/`reframe`) is identical — provocation bait gets exactly the same zero-cost exit as curiosity bait. Proving a doubt wrong is still optional; that's what keeps it PDA-safe instead of just being demand-avoidance with extra steps.

**Mode selection**: v1 — a switch you flip per-loop or globally ("today I want to be dared, not asked"), never auto-selected by the system based on inferred mood; auto-selection would itself become a subtle demand ("the system decided what would work on me today").

**Six-lens addendum**: add to the Critical-user/PDA lens in §7 — every provocation string gets checked against the self-worth line above before it ships. This is the one place in the module where a badly-written string could actively cause harm, so it's worth being stricter here than anywhere else in the spec.

---

## 6c. Pattern-Completion Bait (systems-thinking lever)

Curiosity asks a question. Provocation plants a doubt. Pattern-completion does neither — it just shows an incomplete structure and lets the gap do the work. For a systems thinker, an open set with a missing member isn't a task, it's an itch. No one asked anything, so there's nothing to comply with — the pull is structural, not social, which is exactly why it should sidestep PDA the same way provocation does, from a different angle.

**Mechanic**: instead of a question or a claim, surface the loop as a partially-filled set, sequence, or map with a visible gap.

Examples, same underlying loop pool:
- *"4 of the 5 plants on your 'silver-veined' list are logged. One's unconfirmed — it's the one near the river."*
- *"Your outside-vocabulary table has a category with zero entries: 'sound.' Everything else has at least two."*
- *"This loop connects to three closed nodes and one open one. The open one is two blocks away."*

Generation logic: track any enumerable structure attached to a loop or its concepts — a list with one blank, a category with zero coverage, a Brain Map cluster with one dangling edge — and surface the gap itself as the bait, framed descriptively, never as an instruction to fill it.

The gap must:
- Be real, not manufactured — don't invent a fake 5th item just to create tension. If a set only naturally has 3 members and all 3 are done, it's closed; leave it closed. Fabricated incompleteness would train you to distrust the bait, and it'd be a form of demand-through-deception.
- Be shown, not narrated — state the structure and the gap, skip any "you should close this" framing entirely. The incompleteness argues for itself.

**Data model addition**:
```
MicroQuest.bait_mode: 'curiosity' | 'provocation' | 'pattern'
```
Requires `Loop` and `ExposureTier`/vocabulary entries to be tracked as members of an explicit set somewhere (a list, a category, a cluster) — this is the one bait mode that needs a little more structure upstream (§2 data model may need a lightweight `PatternSet { id, members[], label }` construct to make gaps detectable rather than inferred ad hoc).

**Mode selection**: same rule as §6b — user-selected or global toggle, never system-inferred. Three levers now sit side by side (curiosity / provocation / pattern); the switch is which *kind of mind* gets to pull today.

---

## 7. Six Lenses (hostile review, pre-build)

- **Cybersecurity**: no location data leaves local kernel; `location_hint` is user-authored text, not GPS. If v2 API routing is added, strip any location specifics before the outbound call.
- **Design**: zero red states, zero streak UI — verify literally no component renders a "missed" or "broken chain" visual.
- **Senior dev**: `not_now`/`reframe` handling must live in the bus layer (§6 above), not duplicated per-UI-surface, or a future screen will reintroduce pressure by accident.
- **QA**: test that tier auto-advance is structurally impossible, not just unused — i.e., no code path exists that changes `ExposureTier.active` except explicit user action.
- **Critical user (you, PDA-lens)**: every string of copy needs a pass read as "would this feel like being told what to do?" before it ships.
- **Adversarial**: could this system, over months, quietly turn into a guilt engine through metric creep (e.g., someone later adds a "loops per week" chart)? Constraint: no aggregate metric ships without an explicit accompanying rule that it can only ever go up, never signal a deficit.

---

## 8. Open Questions for Build Phase (session-start per FORGE-SKILL)

Before this moves from MAP to BUILD, need from you:
1. **Phase**: is MASTERMIND's modular rewrite far enough along that Brain Map / Horizon Planner have stable module boundaries to attach to, or does this wait on that rewrite?
2. **Last state**: current Brain Map node schema — does `loop_node` conflict with existing node types?
3. **Bugs**: any known instability in the WARP event bus right now that this shouldn't be built on top of yet?
4. **Intent**: v1 scope — desk-only heuristic bait (§6 v1) or go straight to Claude-API-backed bait (§6 v2)?
5. **SISO + Jaa**: confirm present for this session before any code generation.

---

---

## 9. Interaction Flow (single loop, full journey)

1. **Capture** — you voice-dictate a stray thought. `loop.captured` fires. No UI interruption; it just lands in the inbox.
2. **Classification** — next time you're in Brain Map or doing a pass, the loop shows as `unclassified`. You tag it `desk` or `outside` (or the system suggests based on concept-match against your outside-vocabulary table, shown as a soft suggestion you can ignore). `loop.classified` fires.
3. **Bait generation** — for `outside` loops, the engine drafts one MicroQuest per active bait mode (or just your selected default mode). Nothing is pushed yet — it sits ready.
4. **Surface** — the quest appears only when you open Horizon Planner or Brain Map, never as a push notification or interrupt. `quest.offered` fires on display.
5. **Response** — `Yes` → you head out, loop stays open until you log back. `Not now` → quest returns to the pool, no state change anywhere else. `Reframe` → same loop, next bait mode or next quest in queue, instantly. `quest.responded` fires with whichever.
6. **Discharge** — on return (or async, whenever), you mark the loop closed, optionally with a note. `loop.discharged` fires, `mode: outside`. Brain Map node gets its compass glyph.
7. **Dormant path** — if a quest sits unanswered (not declined, just untouched) past some long window, it doesn't nag — it just quietly moves to `dormant`. Dormant loops are visible if you go looking, invisible otherwise. No re-surfacing, no "you forgot about this."

Nothing in this flow has a clock except step 7's dormancy window, and that window's only effect is reducing clutter — never a prompt, never a badge.

---

## 10. Build-Readiness Assumptions

Rather than block on all five §8 questions, here's what I'd assume by default if you say "go" — flag any of these that are wrong and I'll adjust before generating anything:

1. **Phase** — assuming the modular rewrite has *some* stable surface for Brain Map / Horizon Planner even if incomplete elsewhere, and this module attaches at whatever that current boundary is rather than waiting on the full rewrite.
2. **Last state** — assuming no existing `loop_node` type conflict; if Brain Map already has a node type close to this, I'd want to see it before generating rather than assume.
3. **Bus stability** — assuming WARP event bus is stable enough for new event types; if there's a known issue in flight, that's the one item I'd actually want confirmed rather than defaulted, since building on a broken bus wastes the whole session. WARP now doubles as the load-order prerequisite too (replaces SISO), so this single check covers both "is the bus sound" and "is the prerequisite satisfied."
4. **Intent** — defaulting to **v1 scope**: deterministic heuristic bait (§6/§6b/§6c), no Claude API call yet. Keeps first build dependency-free and testable offline.
5. **Jaa** — this one I can't default. It's your call whether Jaa is present for this session.

If that's an acceptable set of defaults, say go and I'll start scaffolding: `PatternSet`/`Loop`/`MicroQuest`/`ExposureTier` models, the three bait-mode generators, and the bus event handlers, bottom-up per §3.1.

---

## 11. "Achievements" — Revealed Pattern, Not Score

Not badges, not streaks, not a progress bar with a percentage. Instead: the system already knows every `PatternSet` and every `DischargeEvent` — so it can render a **constellation view**, purely descriptive, purely retrospective, never comparative:

- "Silver-veined plants: 5/5 confirmed" is a shape you can look at, not a score you were chasing.
- No global leaderboard-of-one ("you closed 12 loops this week"). That number creates exactly the trackable-therefore-demandable structure §1 exists to prevent.
- Surfaced only in Brain Map, only when you're already looking at that cluster. Never a notification, never a summary email, never a "here's what you accomplished" digest.
- If a pattern completes, nothing fires — no confetti, no toast. It just sits there, complete, the next time you look at it. The reward is structural (a closed shape reads as more *settled* than an open one to a systems thinker) — the system doesn't need to editorialize on top of that.

This is bait-mode §6c's logic applied after the fact instead of before — same rule: real gaps only, shown not narrated, never fabricated for effect.

---

## 12. DM Listener → Open Loop Convergence

Unanswered DMs are a textbook open-loop source — scattered across platforms, each one a small unresolved thread pulling attention. Same architecture as the existing Claude Bridge userscript (DOM MutationObserver → concept extraction → `postKernel('/event', ...)`), generalized per-platform and converging on the same kernel.

**Convergence model**: each platform gets its own lightweight userscript (same skeleton as the Claude bridge — selector map, observer, event poster), each tagged with its own `src` (`'discord'`, `'instagram'`, `'x'`, etc.). They all POST to the same `KERNEL_URL`. The kernel is the convergence point — one inbox, many sources — not a new UI to check per platform.

**Open Loop tie-in**: a `dm_received` event auto-creates a `Loop` with `solvability: 'desk'` by default (replying is desk-solvable) and `concepts[]` extracted from the message preview, same extractor already in the bridge script. This means unanswered DMs show up in the same loop inbox as everything else — no separate "unread" UI to maintain across five apps, and DMs benefit from the same `not_now`/`reframe` contract as any other loop instead of sitting as a silent notification badge.

Scaffold below generalizes the existing bridge pattern — selectors are placeholders per platform since each DOM changes independently of anything here; you'd verify/update them against the live site the same way you already maintain `KNOWN_SELECTORS` in the Claude bridge.

---

## 13. AI-Assistance via ClearGlass Guardian

§6's v2 (Claude-API-backed bait) shouldn't build its own API integration — ClearGlass already has this solved. `guardian.dispatch(provider, prompt, sessionId)` and `mesh.route(prompt, preferAgent)` already exist in `src/copilot/tools.js` and route through Guardian to whichever provider (Claude, ChatGPT, Gemini, Perplexity) is healthiest. Open Loops v2 bait generation becomes just another Guardian dispatch:

```
guardian.dispatch({
  provider: 'claude',
  prompt: buildBaitPrompt(loop, concepts, tier, bait_mode),
  sessionId: `open-loops-${loop.id}`
})
```

`buildBaitPrompt` assembles loop text + concepts + tier's `quest_flavor_notes` + the selected mode's constraints (curiosity question / provocation-about-the-world-never-you / real-pattern-gap) into a single-purpose prompt, same discipline as the heuristic generators in §6/§6b/§6c — the model doesn't get creative license to invent gaps or make things personal, it fills in a template the constraints already bound.

Cortex is the natural home for gap-detection too: `cortex.gaps` already surfaces "open gaps" as a first-class concept in your architecture — `PatternSet` (§2) gaps for §6c pattern bait could just *be* Cortex gaps tagged with an `outside`-solvable flag, rather than a parallel structure. Worth deciding at build time whether `PatternSet` is a new table or a view over existing Cortex gap data — the latter is less to maintain and keeps §0.3 (information must never be lost) trivially true since it's one source of truth instead of two.

No architectural change to §1's constraints — Guardian just becomes the generator behind the curtain. The `yes`/`not_now`/`reframe` contract and the self-worth/fabricated-gap guardrails apply identically whether a human wrote the template or a model filled it in; if anything, hostile review (§7) should weigh a little harder here since model output is less predictable than the deterministic v1 templates.

---

## 14. Delivery Layer: Toasts + Text-to-Speech

Both are just *delivery channels* for a quest that's already generated — neither changes what gets said, only how it reaches you. Both have to pass the same test as everything else: **does this feel like being asked, or does it feel like something just... appeared?**

**Toasts**
- In-app only, never OS-level push — it only exists while you're already looking at MASTERMIND, same rule as quest surfacing in §9 step 4.
- Auto-dismisses on a timer (default ~8s) with zero consequence either way — dismissing is identical to `not_now`, not a separate "missed it" state.
- No unread dot, no badge count, no "3 new" — a toast that already vanished leaves nothing behind to feel guilty about not having seen.
- No sound by default. If you want an audio cue later, it should be a single soft tone, not an alert-style sound — nothing that reads as urgent.

**Text-to-speech**
- Opt-in per bait mode, off by default. Good fit for provocation mode specifically — a voice stating a doubt aloud lands as a passing remark, not a UI element demanding a response, which reinforces the "no asker" quality that makes provocation bait work in the first place.
- One-shot: reads the quest once when surfaced, doesn't loop, doesn't repeat, doesn't escalate volume or urgency if unanswered.
- Route through whatever TTS ClearGlass/Electron already exposes rather than adding a new dependency — check `src/providers` for anything already wired before reaching for a new API.
- Pattern-completion bait (§6c) is probably the weakest fit for TTS — a described gap in a list often needs to be *seen* (the shape of what's missing) more than heard. Worth defaulting TTS on for curiosity/provocation and off for pattern mode, overridable per your preference.

Neither toasts nor TTS should ever queue up ("you have 3 unheard quests") — a missed delivery just goes back into the pool silently, same as any other `not_now`.

---

## 15. Rewind for Open Loops State

`RewindEngine` already does exactly this shape of thing for browser sessions — auto-snapshot on significant events, bounded history per scope, manual `snapshot`/`list`/`restore`/`clear` gates, restore emits an event on the bus. Open Loops state is far lighter than a DOM+cookie+storage snapshot (it's just `Loop[]`, `PatternSet[]`, `ExposureTier[]`, active tier), so this reuses the pattern rather than the class directly.

**Snapshot triggers** — auto-snapshot on the events that actually change shared state, mirroring how `nav.loaded` triggers browser snapshots:
- `loop.discharged`
- `tier.changed`
- `quest.responded` where response is `yes` (a real commitment, not a `not_now`/`reframe` no-op — those shouldn't bloat history)

**Data shape**:
```
OpenLoopsSnapshot {
  id: UUID
  ts: timestamp
  loops: Loop[]
  patternSets: PatternSet[]
  tiers: ExposureTier[]
  activeTierId: UUID
}
```
Stored the same way as existing rewind snapshots — bounded (`MAX_SNAPSHOTS`, reuse the existing constant or give this its own smaller cap since it's higher-frequency, cheaper data), JSON file per scope, no new persistence layer.

**Gates**: `openloops.rewind.snapshot` (manual), `.list`, `.restore`, `.clear` — same naming convention as the existing `rewind.*` gates, dispatched through the same bus.

**Why this matters for the PDA-safe contract specifically**: rewind gives you a genuinely pressure-free undo. If a tier got bumped up impulsively and next-day-you feels crowded by it, stepping back down via restore isn't "admitting failure" — it's just picking a different point in a timeline you already own. Restore should never carry framing like "reverting your progress" — it's a neutral state change, same register as `ExposureTier.active` changes in §1: your call, no commentary attached.

One thing to decide at build time: whether restore should be all-or-nothing (whole snapshot) or field-level (restore just `tiers`, leave `loops` alone) — field-level is more useful here than it would be for a browser session, since you might want to roll back a tier change without also un-discharging three loops that happened after it. Worth scoping as a v1.1 nicety rather than blocking v1 on it.

---

## 16. Modular Widget Architecture

Every surface this spec has described — loop inbox, quest card, tier ladder, constellation view (§11), toast layer (§14) — is a widget, not a fixed panel. §5.9–5.14 already says UI is disposable and every layer replaceable; this just makes that literal instead of aspirational.

**Data shape**:
```
Widget {
  id: string                     // 'loop_inbox' | 'quest_card' | 'tier_ladder' |
                                  // 'constellation_view' | 'toast_layer' | ...
  enabled: boolean
  slot: string?                  // where it renders — 'brain_map' | 'horizon_planner' | 'floating'
  config: object?                // widget-specific settings (e.g. toast_layer.duration_ms)
}
```
`WidgetRegistry` is just a list of these, read by the shell at render time. Disabling a widget never touches underlying data — turning off `constellation_view` doesn't delete `PatternSet` records, turning off `toast_layer` doesn't stop `quest.offered` events from firing, it just means nothing renders them. §0.3 (information must never be lost) stays trivially true because widgets are a view layer, not a storage layer.

**Toast layer as a widget specifically**: this makes the "off by default is fine" option from §14 concrete rather than hypothetical — someone (you, future-you, whoever) can run the whole system with `toast_layer.enabled = false` and only ever see quests when they open Horizon Planner directly. That's not a degraded mode, it's just a different, equally valid delivery config — same as TTS being opt-in per bait mode.

**No mandatory widgets, one soft default**: technically every widget could be off simultaneously (system still runs, just invisible — data keeps flowing through the bus regardless). In practice `loop_inbox` is the only one worth defaulting to `enabled: true`, since without it there's no way to see captures at all; everything else defaults on but is a zero-cost toggle.

**Removing a widget carries no framing** — same rule as everything else in this spec. No "are you sure you want to disable your progress tracker?" confirmation dialog with implied stakes. It's a checkbox, not a decision that needs defending.

---

## 17. AI Memory & Commitment Tracking

Reuses what's already there rather than building a new memory store: `cortex.memory` / `cortex.event` are already the persistence layer, and the copilot tool registry (`src/copilot/tools.js`) is already how the AI gets capabilities. This section just adds a `memory.*` and `commitment.*` category so the AI can write and recall things across conversations, not just within one.

**New tools** (same registry shape as existing entries):
```
{ name: 'memory.remember', cat: 'memory', desc: 'Store a fact, commitment, or appointment', params: { content: 'string', type: 'fact|commitment|appointment|preference', when: 'timestamp?' } }
{ name: 'memory.recall',   cat: 'memory', desc: 'Query stored memory', params: { query: 'string?', type: 'string?' } }
{ name: 'commitment.upcoming', cat: 'memory', desc: 'List commitments/appointments due soon', params: { withinHours: 'number?' } }
```
The AI calls `memory.remember` proactively during normal conversation whenever you mention something worth tracking — "I've got a dentist thing Thursday," "remind me to call Jonathan about the grant" — the same way it already calls other tools, no separate "add to calendar" step required from you.

**Two categories, two different rules — this is the important split:**

| | Open Loops (§1–16) | Commitments/Appointments |
|---|---|---|
| Origin | Self-generated curiosity/thought | Real external obligation with a time and often other people |
| Cost of missing | None — a loop left open is just a loop | Real — a missed appointment has consequences outside the system |
| Delivery | Zero-cost dismiss, no push, widget-optional (§14/§16) | **Should actually alert reliably** — this is the one place a real push notification is the right call, not a violation of the PDA-safe contract |
| Framing | Curiosity/provocation/pattern bait | Plain, factual, no bait needed — "Dentist, 2pm Thursday" doesn't need to be interesting, it needs to be accurate |
| Tier/ladder | Applies | Doesn't apply — walking to a real appointment isn't a graduated-exposure quest, it's just what you're doing |

Commitments get their own minimal entity rather than being shoehorned into `Loop`:
```
Commitment {
  id: UUID
  title: string
  when: timestamp
  location: string?
  source: 'ai_captured' | 'manual'
  linked_loop_id: UUID?          // optional — e.g. "pack bag" loop tied to a trip commitment
  reminder_lead_minutes: number  // real alert, not a widget toggle
}
```
A commitment *can* spawn a Loop (prep tasks, things to bring, a question to ask while there) — that spawned loop stays fully subject to the soft rules in §1–16. It's only the commitment itself — the fixed time-and-place fact — that gets to bypass the zero-pressure delivery rule.

**Why this split matters rather than just extending §14's toast rules to everything**: applying the no-push, dismiss-for-free ethos to a real appointment would mean the system optimizes for feeling good over being useful, and a missed dentist appointment doesn't care how gentle the reminder was. The PDA-safe design in this spec is specifically for things where the demand itself was the problem (self-generated exploration). An external obligation isn't a demand the system is imposing — it's a fact the system is reporting, and it should report it plainly and reliably.

---

*This is a map, not code. No implementation exists until the above is confirmed, per §1.1 (nothing exists until proven) and §3.3 (map before build).*
