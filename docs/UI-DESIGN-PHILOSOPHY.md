# NEXUS UI Design Philosophy

_R9, docs/repair-contract-and-loom-hub-phasemap.spec. Written from
conventions already real and observed across this session's work —
`ui/tv-shell/nerve/nerve.js`, `ui/tv-shell/spotlight/spotlight.js`,
`loom/ui/index.html`'s real views (Roadmap, Gaps, Map, Iterations), and
every system `.spec`'s `hotswap: true` field. Nothing here is proposed —
every rule below is followed by at least one real file already, cited
where it lives, so this document can be checked against reality the
same way a build gets checked against a spec._

---

## 1. Sovereign, not embedded

Every real UI surface in this codebase is a standalone module —
own canvas, own polling loop, own HTTP-callable API — not a component
wired into one monolithic frontend.

> "Sovereign module: own canvas, own polling loop, HTTP-callable
> (POST /api/ui/nerve/on|off|sigma), registers with co-pilot."
> — `ui/tv-shell/nerve/nerve.js`, header comment

**Rule:** a new UI surface is its own file, with its own real backend
route(s), not a section bolted into an existing one. `loom/ui/index.html`
follows this at the view level too — Roadmap, Gaps, and Map are each a
`<section class="view" id="view-X">` with its own `load*()`/`render*()`
pair, sharing only the `api()` helper, not shared render logic.

## 2. Real data or honest absence — never a fabricated number

The rewind panel James screenshotted shows `sn.totalRows ?? '?'` — a
literal question mark — when data hasn't arrived, not a zero, not a
placeholder that looks like a real number.

**Rule:** a missing value renders as an explicit "not available" state
(`?`, "unavailable", "no hand-declared hooks for this system"), never as
`0` or an empty-but-plausible-looking value. A `0` must always mean a
real, counted zero. `loom/server.js`'s `/api/component/:system` follows
this — `declared: null` when a system has no `hooks/<system>.hooks.js`,
never a fabricated empty hooks list standing in for "we don't know."

## 3. Color and motion are driven by real field state, not decoration

Nerve's pulse frequency and color come directly from the real CFR field
(sigma/coherence/friction/entropy) — not a fixed palette applied for
visual variety.

**Rule:** if a UI element changes color or animates, there is a real
number behind that change, traceable to a real API response. The rewind
panel's sigma legend (low/mid/high, real color-coded dots) and R5's map
view (dependent-status dots — green for active, muted for deprecated,
sourced from `hooks/<system>.hooks.js`'s real `status` field) both
follow this.

## 4. Hotswap is a requirement, not a feature

Every real system `.spec` in this codebase declares `hotswap: true` in
its `ui:` block — confirmed live in `cortex.spec`, `idearium.spec`,
`guardian.spec`, `orchestrator.spec`.

**Rule:** a new UI panel must be replaceable while NEXUS is running,
without a full restart. This is why sovereign modules (§1) matter
architecturally, not just organizationally — a panel with its own file,
its own poll loop, and no shared render state can be hot-swapped; a
panel woven into a shared render tree cannot.

## 5. Co-pilot can drive the surface, not just describe it

`Spotlight.execute(ui)` — co-pilot sends a real instruction block over
HTTP and the UI acts on it: highlighting elements (`Spotlight.on`),
navigating channels (`Spotlight.navigate`), running guided sequences
(`Spotlight.step`).

**Rule:** a UI surface built for a human to use manually should also be
callable by co-pilot, using the same real API a person's click would hit
— not a separate "for AI" code path. Spotlight is the existing proof this
works: one real API, two real callers (a person's mouse, co-pilot's HTTP
call).

## 6. The confirm flow is part of the surface, not an afterthought

`copilot/lib/autonomy-router.js`'s propose-then-confirm pattern — every
state-changing action returns a real question, phrased once, specific to
what's actually happening (`Schedule "cleanup" every 5 minutes?`, not a
generic "Confirm this action?" template).

**Rule:** a confirmation prompt states the specific real action being
proposed, in the fewest words that remain unambiguous. Never append a
generic "Confirm?" onto an already-specific question — found and fixed
this exact anti-pattern earlier this session ("the co-pilot feels
stiff").

---

## What this document is not

Not a component library, not a color palette, not a grid system. NEXUS
has no shared CSS framework across its UI surfaces on purpose — each
sovereign module owns its own rendering (§1), and forcing a shared visual
system would violate the hotswap requirement (§4) by creating a
cross-panel dependency. What's shared is the *discipline* above, not the
markup.

## How to check a new UI surface against this document

1. Does it have its own file and its own backend route(s)? (§1)
2. Does every displayed value trace to a real API response, with an
   honest "not available" state for anything missing? (§2)
3. Is every color/animation driven by a real number, not decoration? (§3)
4. Does its `.spec` declare `hotswap: true`, and is that actually true —
   can it be replaced without restarting NEXUS? (§4)
5. Can co-pilot drive it through the same real API a person's
   interaction would hit? (§5)
6. Does every confirmation prompt name the specific action, once,
   without a generic template suffix? (§6)

A "no" to any of these is a real finding to fix, the same way a failing
test is — not a style preference to argue about.
