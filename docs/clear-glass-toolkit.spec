# clear-glass-toolkit.spec

```
spec_id:      clear-glass.spec.toolkit
uuid:         cg-spec-toolkit-v1-0000-2026-0818-001
version:      0.1.0
status:       Specified            # §17.2
owner:        clear-glass          # §17.1
authority:    docs/MAP-2026-08-18-pressure-and-toolkit.md
governs:      clear-glass/src/driver/index.js, clear-glass/src/copilot/tools.js,
              clear-glass/src/dom/*, clear-glass/src/providers/*
created:      2026-08-18
```

## §0 Why this exists, and what it refuses to build

The ask was "a full extended kit of tools for clear-glass — screenshot to
upload or inject into agent, eyes, test UI, element picker."

**Most of that kit is already built and served.** Verified by direct read, not
memory (§0.1): `copilot/tools.js` declares 71 tools; `driver/index.js` serves
26 by dispatch case, including `screenshot` (line 203, real `wc.capturePage`),
`picker.enable` / `picker.disable`, `inject`, `eval`, `record.start` /
`record.stop`, and `dom.pick` / `dom.highlight` / `dom.mutate`.

So this spec does **not** build a kit. §1.1 (it exists), §16.5 (delete before
add), §10.3 (a second kit is a competing truth layer). What is missing is
smaller and more important: **a captured image has nowhere to go.**
`_screenshot()` emits `driver.screenshot` on SSE and the only file in the entire
tree that mentions that event is the file that emits it. The eyes are built.
The optic nerve is not.

## §1 Phases (§3.1, §3.4)

---

### P0 — Audit: 71 declared vs 26 served  *(closes CG-GAP-3)*

Handing an agent a tool that leads nowhere is the failure
`capability-tools.js` already names for its 16 declared-and-unserved
capabilities. Adding a 72nd tool before knowing which of the 71 work would
repeat it at a larger scale.

- **Do:** for every entry in `tools.js`, resolve to the code that serves it, or
  record it as unserved. Output is a table: tool → server file:line → served /
  unserved / partial.
- **§1.1:** "served" means a dispatch path was found and read. Not inferred
  from the name matching.
- **Gate:** the table exists, and every unserved tool is either removed
  (§16.5), or has a gap row explaining why it stays declared.
- **This gate blocks every phase below it.** No tool is added while the
  existing surface is unmeasured.

---

### P1 — A screenshot gets a destination  *(closes CG-GAP-1)*

One wire, not a feature. The capture already happens.

Three candidate destinations. **They are not equivalent and one must be chosen
before code** (Q3 in the map, open):

1. **Into a provider composer as an attached image.** Gives me and co-pilot
   actual eyes on a running UI. Highest value, hardest: it means synthesising a
   real file drop into a page the provider controls, and it is the most likely
   to break when they change their composer.
2. **Into the intake pipeline** (`lib/intake.js`, this session) as a staged
   artifact with provenance. Cheapest and already built — a screenshot is an
   arriving artifact with an author, which is exactly what intake models. Gives
   history and provenance; gives no eyes.
3. **Both**, with 2 as the durable record and 1 as the live path.

- **§17.5:** whichever is chosen, the image carries provenance — which agent,
  which URL, which viewport, when, at whose request. An image of unknown origin
  is corruption.
- **§5.10:** the destination is reached through a declared contract, never by
  reaching into a provider window's internals.
- **Gate:** a screenshot taken by the driver arrives at the chosen destination
  and is *viewable*, end to end, on your machine. Not a base64 string in a log.

---

### P2 — The picker returns something usable  *(closes CG-GAP-2)*

`picker.enable` shows an overlay and `dom.pick` registers a hook. What you
click never becomes context in a conversation.

- **Do:** a pick emits a structured selection — selector, resolved unique
  path, tag, text, bounding box, computed role, and the surrounding DOM slice —
  through the same destination P1 established.
- **§16.5:** reuse P1's contract. Two delivery paths for two payload types is
  the drift this spec exists to avoid.
- **Gate:** click an element in a live provider tab; the selection appears at
  the destination with a selector that actually re-resolves to that element.

---

### P3 — UI testing is a composition, not a new tool

`record.start` / `record.stop` already returns a replayable action sequence,
and `waitFor`, `click`, `type` and `screenshot` are served. A UI test is those
composed — §5.8, composability over configuration.

- **Do:** nothing new until P0's table proves the primitives are all genuinely
  served. Then a test is a recorded sequence plus assertions, expressed with
  existing tools.
- **§4.1:** UI is tested via Playwright. This does not replace that; it is for
  driving provider surfaces Playwright does not own.
- **Gate:** deferred until P0.

## §2 Invariants

- **CG-INV-1** No tool is added while declared-vs-served is unmeasured. (§1.1)
- **CG-INV-2** Every captured artifact carries provenance. (§17.5)
- **CG-INV-3** One destination contract, shared by every payload. (§16.5, §10.3)
- **CG-INV-4** Destinations are reached through declared contracts, never by
  reaching into another system's internals. (§5.9, §5.10)
- **CG-INV-5** A capture that fails to arrive says so, loudly and specifically.
  A screenshot silently not delivered is indistinguishable from one nobody
  looked at. (§1.2)

## §3 Tests (§12.1)

- `CG-001` the declared-vs-served table covers all 71 tools with no "unknown"
- `CG-002` a screenshot arrives at the destination and is a decodable PNG of
  the expected dimensions
- `CG-003` provenance is present and correct — agent, URL, viewport, timestamp
- `CG-004` a delivery failure produces a loud, specific error naming the
  destination and the reason, never a silent drop
- `CG-005` a picked selector re-resolves to exactly one element on the page it
  was picked from
- `CG-006` an oversized capture is refused with a stated limit rather than
  truncated into a corrupt image

## §4 Drift (§12.5)

| date | checked | finding |
|---|---|---|
| 2026-08-18 | written | 71 declared / 26 served confirmed by direct read. `driver.screenshot` has zero consumers tree-wide. P0–P3 unimplemented. Q3 (destination) open — blocks P1. |

## §5 Rejected alternatives (§17.3)

- **Building a new tool kit.** Rejected: it exists. §1.1, §16.5, §10.3.
- **Adding tools before the audit.** Rejected: §16.1 — the nearest gap is that
  a built capability has no destination, not that there are too few
  capabilities.
- **Piping screenshots straight to a file on disk and stopping there.**
  Rejected: that is what `capturePage` already effectively gives you. It
  produces an image nobody sees, which is CG-INV-5's failure with extra steps.
