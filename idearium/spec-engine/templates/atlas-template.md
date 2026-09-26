<!--
  SYSTEM ATLAS TEMPLATE
  A living map of one system: what it is, how to run it, and every real
  thing in it — modules, nodes, commands, routes, events, architecture
  facts. This is not a document written once. It is edited in place
  every time the real system changes (SPEC_IS_LIVING_MODEL) — the same
  discipline this convention's own .spec files already follow.

  ── ADDRESSING — read this before filling in anything below ──────────
  Every entity this atlas describes has exactly one id, and that id is
  never invented here — it is always the same id the entity already
  carries in .architecture/nodes/. This document does not have its own
  naming scheme; it is a second view onto the one real graph.

    Component  →  id matches .architecture/nodes/component/<id>.json
    Hook       →  id matches .architecture/nodes/hook/<id>.json
    Wire       →  id matches .architecture/nodes/wire/<id>.json
    Command    →  referenced as [component id].[command] — which node
                   it operates on, and which directory that node's file
                   lives in, both stated, not implied
    Event      →  referenced as node_id + hook_id, the same pair every
                   ledger entry for it carries — an event with no
                   node/hook reference is malformed, here and in the
                   ledger both
    Route      →  states which node/hook it serves, not just its path

  ── LINKS — every file reference is a real, clickable path ───────────
  A path in this atlas is never bare prose ("see the dispatch file") —
  it is a markdown link to a real, repo-relative path, with a line
  number when the reference is to one specific place, not a whole file:

    [`path/to/file.js:123`](path/to/file.js#L123)

  This opens directly in any IDE/file-browser that resolves relative
  links against the repo root (VS Code, GitHub, most others) — an
  atlas is a navigation surface, not just documentation, and a
  reference that can't be clicked through defeats that. A reference to
  a whole file (no specific line) omits the line number and #L anchor;
  don't invent a line number for a whole-file reference.

  If something described here has no node file yet, it doesn't belong
  in this atlas yet either (§1.1 — nothing exists until proven) — it
  belongs in "Modules Not Yet Built."

  Fill every bracket. Delete no section headers — write "None yet" or
  "Not applicable" rather than removing a heading, so a missing section
  is visible as a gap, not silently absent.
-->

# [System Name] — [One-line description of what it is]

> **v[version]** · [N] modules built · [N] modules specced · [one short capability line] · [one key constraint, if any]

**Author:** [name] · [site or org link]
**License:** [license type] — [link, if applicable]

| Repo | Description |
|---|---|
| **[repo name]** (this) | [what this repo contains] |
| [additional repo, if the system spans more than one] | [description] |

---

## What It Is

[2-3 short paragraphs, plain language: what problem this system solves, what makes its shape necessary rather than incidental. No jargon that isn't defined by the time it's used.]

---

## Quick Start

```bash
[clone/install/run commands — copy-pasteable, no placeholders inside the block itself]
```

```
[expected output on first successful run]
```

**Tested:** [real environment this was actually run on — OS, runtime version, hardware if relevant]

---

## File Structure

<!-- The literal, real directory tree — not an idealized one. If a
     directory exists but is empty or unused, say so rather than
     omitting it; an omitted real directory reads as "doesn't exist,"
     which is a false claim. -->

```
[system]/
  .architecture/
    nodes/            [one file per declared component/hook/wire/bundle]
    lattice.json      [compiled, never hand-edited]
    ledger/           [append-only, per node type]
  [module-1]/          [one line: what lives here]
  [module-2]/
  data/                [this system's own runtime data — no other system writes here]
```

| Path | Node kind it holds | Contains |
|---|---|---|
| `[path]` | `[component \| hook \| wire \| bundle \| none]` | [one line — what's actually in here, not what's aspirationally planned for it] |

---

## Architecture

<!-- System-wide facts that don't belong to any one module. Every
     subsection is addressed the same way modules are — name the real
     unit it's about, not a paraphrase of it. Write "None" or "Not
     applicable" rather than deleting a subsection. -->

### Spine

<!-- Intent: names whether this system has ONE dispatch path everything
     routes through, or several. This matters because a single spine
     means one place to observe, throttle, or halt anything; several
     independent mechanisms means no such single point exists and that
     has to be stated, not discovered later by someone debugging a race
     between two of them.
     Edge cases: a system can genuinely have no spine — don't force one.
     A system claiming a spine but with even one module that bypasses it
     (a direct call instead of routing through the spine) doesn't have a
     real spine, it has a spine with an exception; record the exception
     here rather than letting the claim stand unqualified. -->

[The one universal mechanism every signal routes through, if this system has one — name the primitives and the one-way import rule. Write "No single spine — N independent mechanisms: [list]" if that's the honest answer instead.]

### Governing axioms

<!-- Intent: an axiom is a rule enforced somewhere, not a value
     statement — every row should be checkable against real behavior.
     Edge cases: an axiom inherited from a shared convention (not
     invented by this system) should still be listed here if this
     system is actually bound by it — omitting an inherited axiom
     because "it's not ours" hides a real constraint from a reader who
     only has this atlas open. -->

| Name | Statement | Rationale |
|---|---|---|
| `[AXIOM_NAME]` | [what it requires] | [why, not just what] |

### Boundaries (documentation clarity)

<!-- Intent: this table exists because some pair of terms in this
     system's own vocabulary is easy to conflate, and conflating them
     has caused (or would cause) a real mistake — not because every
     system needs a glossary. Edge cases: if nothing in this system's
     vocabulary is actually confusable, this table is legitimately
     empty — don't invent a pair to fill the row. -->

Pairs of easily-conflated concepts a reader of this atlas needs kept separate.

| Term | Definition | Distinguished from |
|---|---|---|
| `[term]` | [definition] | `[other term]` — [why they differ] |

### Seams (cut points)

<!-- Intent: a seam is any declared cut-point in this system — between
     modules, between blocks in a spec file, between nodes, anywhere
     something can be chunked. Think "cut here" — a dotted scissors
     line. `isolation` (nothing shared across the cut) is the strongest
     KIND of seam, not the definition — most seams just mark a valid
     split point.
     Edge cases: a boundary-type seam with no isolation claim is a
     perfectly real seam; don't force it into claiming isolation it
     doesn't have. A row that also carries a port/direction/method isn't
     a seam anymore, it's a route — move it under the relevant module's
     HTTP routes instead. -->

| ID | Location | Between | Cut type | Isolation (if applicable) |
|---|---|---|---|---|
| `[seam id]` | `[file/block/node path]` | `[A]` ↔ `[B]` | `[isolation \| boundary]` | `[what's not shared, or "—"]` |

### Sovereignty (cross-system contract)

<!-- Intent: states, per other system, exactly what crosses the
     boundary — not as policy prose but as a checkable read/write split.
     Edge cases: "may read" and "may never write" are not opposites of
     each other — a system can be forbidden from both reading AND
     writing something (state that as "may never write: everything;
     may read: nothing" rather than leaving the row implying read access
     by omission). "Enforced by" must name a real mechanism (a process
     boundary, a filesystem permission, a network policy) — a rule
     enforced only by convention belongs here with that stated plainly,
     since "enforced by convention" is a materially weaker guarantee
     than "enforced by process isolation" and a reader needs to know
     which one they're trusting. -->

| Other system | May read | May never write | Enforced by |
|---|---|---|---|
| `[system id, or "any"]` | [what's readable] | [what's never writable] | [what actually makes this true — not just stated policy] |

### Pulse (liveness)

<!-- Intent: answers "is this system alive and reachable right now,"
     which is a different question from self-diagnostics below ("is
     this system structurally strained"). A system can be perfectly
     alive and highly strained, or dead and structurally pristine — the
     two numbers are independent. Edge cases: a system with no peers to
     announce itself to genuinely has no pulse — write "not applicable"
     rather than inventing an internal heartbeat with nothing listening
     to it. -->

**Heartbeat interval:** [value, or "not applicable"]
**Announces on connect:** [identity + capabilities list, or "not applicable"]
**Health score computed from:** [real in-system sources] — **formula:** [stated plainly]

### Self-diagnostics (structural strain)

<!-- Intent: a live, computed measure of how much of this system's own
     declared structure currently doesn't hold — dangling hooks, open
     gaps, anything the system can check about itself without asking
     another system. Distinct from Pulse above (liveness) and distinct
     from a generic health/status page (which often mixes in things
     this system can't itself verify).
     Edge cases: a metric borrowed from elsewhere (e.g. "friction") may
     mean something different in another real convention — state the
     formula explicitly rather than relying on the metric's name to
     carry its meaning, since the same word has genuinely meant two
     unrelated things across real systems before. -->

| Metric | Computed from | Formula | Exposed at |
|---|---|---|---|
| `[metric]` | [real sources — dangling hooks, open gaps, etc.] | [stated plainly enough to re-derive] | `[route, file, or "not yet exposed"]` |

### Config layers

<!-- Intent: exists specifically to support "dynamic over hardline" —
     if changeable values live in nodes rather than code, this table is
     where a reader learns which layer actually wins when two layers
     disagree. Edge cases: "overrides" must resolve to a single winner
     for every real conflict — two layers each claiming to override the
     other, with no tiebreak stated, is not a resolved config model, it's
     an unresolved one wearing a table. -->

| Layer | Scope | Overrides |
|---|---|---|
| `[layer]` | [system-wide \| per-component \| per-instance] | [which layer(s) this takes precedence over, and when] |

### Phases

<!-- Intent: the system's own build lifecycle, stated as gates rather
     than labels — the point of "exit gate" is that it has to be a real
     proof condition someone could fail to meet, not a box that gets
     checked because the calendar says so. Edge cases: a system with no
     formal phase structure yet should say so rather than backfilling
     invented phases to look more rigorous than it currently is. -->

**Source:** `[hand-maintained, or the real decomposition tool/phasemap doc this table was produced from]`

| Phase | Intent | Entry condition | Exit gate | Produces |
|---|---|---|---|---|
| `[phase]` | [what it's for] | [what must already be true] | [the actual proof, not a checkbox] | [artifacts/decisions] |

### Component status

<!-- Intent: the state machine an individual component instance moves
     through — independent of which phase the system as a whole is in.
     Edge cases: don't conflate this with a node kind's REAL/OPEN/
     DEFERRED grounding status (that's whether the KIND is proven to
     exist at all); this table is about one instance's progress through
     its own lifecycle, and a kind can be REAL while individual
     instances of it sit at any status here. -->

| Status | Meaning | Entry condition | Exit condition |
|---|---|---|---|
| `[status]` | [meaning] | [what makes a component enter it] | [what's required to leave, and what it becomes] |

---

## The Modules

<!-- One section per BUILT module — status: wired or verified, not stub.
     A module still at status: stub belongs in "Modules Not Yet Built"
     below, not here, even if it has a name and a short description
     already. -->

---

### [module-name]

**id:** `[system].[module-name]`
**node file:** `.architecture/nodes/component/[id].json`

**What it does**

[1-2 paragraphs: the module's single responsibility, why it exists, and the one invariant that matters most if it has one.]

**How it works internally**

[The real mechanism — the actual algorithm, data flow, or state machine. Specific enough that someone could reimplement it from this description. If there's a numbered list of enforced invariants, put them here.]

**Commands**

<!-- Intent: every real operation someone can invoke against this
     module, with the exact node/directory it acts on named — a command
     with no addressed target is a command whose blast radius is
     unknown. Edge cases: a command that acts on MULTIPLE nodes (e.g. a
     compile step reading every file in a directory) should say "all
     nodes in `[directory]`," not name one node arbitrarily; naming one
     when the real scope is broader understates the command's reach. -->

| Command | Operates on | What it does |
|---|---|---|
| `[id].[command]` | `[node id]` in `[directory]` | [one line] |

**How to use it**

```[language]
[a real, runnable usage example — not a signature listing]
```

**HTTP routes** <!-- omit this subsection entirely if the module has none -->

<!-- Edge case: a route that reads from multiple nodes or the whole
     compiled lattice (not one specific node) should say so explicitly
     — "node: [entire lattice]" is a valid, honest answer; don't force
     a route into naming a single node it doesn't actually correspond
     to. -->

```
[METHOD] [/path]   → node: [node id]   [one-line description]
```

**What it connects to**

<!-- Edge case: if the connection crosses a system boundary, this row
     should agree with the Sovereignty table above — a connection here
     that isn't reflected as a "may read" entry there is either an
     undocumented sovereignty exception or a mistake in one of the two
     tables; both need investigating, not just one of them silently
     trusted. -->

- `[other module id]` — via hook `[hook id]`, wire `[wire id]` — [the real reason, not just "uses it"]

**Bus events emitted** <!-- write "None" if the module is purely internal -->

<!-- Edge case: an event with no real listener anywhere in the system is
     not wrong to list, but is worth flagging — "emitted, no known
     consumer yet" is more honest than implying every emitted event is
     acted on somewhere. -->

- `[event.name]` — node: `[node_id]` hook: `[hook_id]` — `{[payload shape]}` — [when this fires]

---

<!-- repeat the module section above for every built module -->

## Modules Not Yet Built

These are specced and on the roadmap. They don't exist yet. §1.1.

| Module | Version | Depends On | Description |
|---|---|---|---|
| [name] | [target version] | [what it needs to exist first] | [one line] |

---

## Module Conflict Registry <!-- omit this whole section if the system has no mutually-exclusive modules -->

Every module declares what it conflicts with. The registry enforces it at [boot / build / compile time].

```json
{
  "name": "[module]",
  "conflicts": ["[module]"],
  "requires":  ["[module]"],
  "vital":     [true|false]
}
```

---

## Build & Run Reference

```bash
[every real command a developer needs, one per line, with a one-line comment above anything non-obvious]
```

This section grows the same way the module list does — one real command added per module, the moment that module moves out of "Modules Not Yet Built."

---

## Version History

<!-- Versionium is meant to be the automatic, live source of this
     section for EVERY system — snapshotting system state (real
     convention: .nex files, cortex's NEX-SNAP/1.0 format) on real
     events, not on request. "Hand-maintained" is NOT a neutral
     default: it means this system is not yet reporting to Versionium,
     which is itself a gap worth a row in this system's own `gaps`
     section, not just a quiet fallback here. -->

**Source:** [`GET /api/versionium/history?system=<name>`, or — flagged as a real gap, not a neutral state — "NOT YET WIRED TO VERSIONIUM: hand-maintained below, see gaps section"]

**If not yet wired:** add a gap entry in this system's own `.spec`
`gaps:` section naming this specifically — "system does not report to
Versionium" — rather than letting an unwired system look the same as
one with nothing to report.

| Commit | Branch | Message | Author | Timestamp | Caused By |
|---|---|---|---|---|---|
| [commitId] | [branch] | [message] | [author] | [ts] | [the event that triggered this commit, if it was automatic — omit column entirely if every commit here is manual] |

**Commands / routes**

```
[POST /commit]    { message, branch?, causedBy?, state? } → new commit
[GET  /history]   ?system=<name> → this table, as data
[GET  /restore]   /:commitId → full-state snapshot at that commit
[GET  /state]     /:commitId → state only, no restore
[GET  /calendar]  /:date → temporal replay for a given date
```

**Known caveat, if inherited from a shared versioning system:** branch semantics may be label-only rather than a true DAG (a real, open gap in at least one real implementation of this pattern — `parentId` pointing at the most recent commit regardless of declared branch) — don't assume branching guarantees here until the specific system's own spec confirms it's fixed.

---

## Copyright

Copyright © [year] [author]. [rights statement].
[org/site link] · [repo link]
