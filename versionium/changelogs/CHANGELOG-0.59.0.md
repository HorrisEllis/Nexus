# 0.59.0 — 2026-10-10

James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"

Mapped first as FN1–FN3 in `docs/2026-10-10-shape-of-nexus-phasemap.spec`.

## The interaction field as commands (FN1)

The field (`clear-glass/src/page/field.js`) used to be reachable only by agents, through the Clear Glass browser tool. It is now a set of commands, for you at the CLI and for every agent through `nexus.command`:

| Command | What it does |
|---|---|
| `idearium field [--overlay] [--all] [--on <window>]` | Numbers every clickable thing in a Clear Glass window, with x, y and z (0 = on top). `--overlay` draws the numbers on the page. |
| `idearium field off` | Takes the numbers and any spotlight off the page. |
| `idearium field at <x> <y>` | Shows what is under a point, top first: what a click there would hit. |
| `idearium field show <n\|selector> [label]` | Spotlights a target. `--off` removes the spotlight. |
| `idearium field point <n> [click\|double\|right\|move\|scroll\|type] [--text t] [--via eros]` | Acts on a numbered target the way a pointer would. A covered target is reported, never clicked through. |
| `idearium field windows` | Shows what the field is doing in each window. |
| `idearium nerve` | Prints Nexus Nerve's snapshot: the regime, which systems are present, and each window's attention. |

Two fixes made this possible:
- Route commands could reach other Nexus systems but silently dropped a POST's body.
- Clear Glass was not one of the systems they could reach. It is reached on its IPC port, the same one the agent tools use.

## Nerve sees the field (FN2)

- **Bug found:** Nerve's per-window attention had never seen a window. It read Clear Glass's `/bus/log` as an array, but the log answers `{ level, count, entries }`, and at Clear Glass's log level an entry carries no data, so no window id.
- **New record:** Clear Glass now keeps, per window, page changes plus the field's last map, spotlight and pointer (`src/page/attention.js`), served at `GET /cli/attention`. The driver now reports every pointer act on the bus (`field.pointer`).
- **Nerve reads it:** each window in Nerve's snapshot carries its `focus`. The old `/bus/log` path stays as a fallback and now reads `entries`.
- **Nerve still only shows.** Nothing here acts.

## The two meet on the nerve canvas (FN3)

- The browser node rings while an agent is using the field in a window. The HUD shows the last act, e.g. `◎ default · click #3 Apply now`.
- The field couldn't see the nerve before, because a canvas has nothing it can number. Each node now has a transparent, labelled button over it. The field numbers the nodes by name, `field show` rings one, and `field point` presses one, which shows that node's state.
- **Fixed in passing:** the HUD's node and wire counts never showed, because `nerve.html` and `nerve.js` disagreed on the element ids.

## Proof

- `tests/modules/test-field-nerve.test.js` (5/5):
  - each command's request;
  - `field` run end to end against a stub Clear Glass, with its body arriving and the map printed;
  - the attention record, built from the real event names;
  - Nerve carrying each window's focus, and the fixed fallback;
  - the driver reporting `field.pointer`.
- Clear Glass probe `tests/probe/nerve-field-glass.js` (6/6), on the real nerve fragment and script with the real field script:
  - the nodes are numbered by name, on top;
  - the HUD shows a window's last act;
  - pressing a node shows its state.

## Not yet

CG1, the field injecting once per page (the google.com flood), is still open.
