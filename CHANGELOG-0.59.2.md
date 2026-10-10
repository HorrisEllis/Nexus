# 0.59.2 — 2026-10-10

James: "can you make it so i can use guardian element picker for claude code. also the popup when picking an element needs buttons that wre usefull. not add to index. also cant close it. the popup." · "no md files. need the specs to be relevant to the system they are for, if applicable, also the spec workshop uses them" · "i need to dump ideas somewhere, they are endless."

## The Guardian picker's popup closes now, and its buttons are useful

- **Cause:** every time the picker was toggled on, `clear-glass/renderer/guardian-picker.js` ran again. `destroy()` closed the popup but left its elements in the page, so the next run added a second popup with the same element ids. The buttons got wired to the first, hidden popup, which is why the ✕ on the visible one did nothing.
- **Proven:** the new probe fails on the old code with exactly this (two popups, ✕ does nothing).
- **Fixed:** a new run first removes anything left by an earlier one, and `destroy()` now removes what it made, including its global ESC listener. ESC also closes the popup.
- **New buttons:**
  - **→ CLAUDE CODE** sends the element (selector, text, a slice of its HTML, the page) to Clear Glass. Claude Code and the agents read it with `idearium picks`.
  - **⧉ COPY** copies the selector.
  - "Add to index" is kept as **SAVE CALLTO**, next to **CLOSE**.
- **Proof:** `tests/probe/guardian-picker-glass.js` 9/9 in Clear Glass.

## The workshop starts from Nexus's own specs

The workshop's START FROM has a new **NEXUS** source: every system's specs, grouped by system and marked with how built each one is (from the census). Opening one starts a new workshop with its sections, choices included. Saving it makes a new repo, and the original spec is never written. `tests/modules/test-workshop-nexus-specs.test.js` 3/3.

## No .md files

Today's Markdown files are now specs or gone:
- The QA catalog is `cos/spec/qa-catalog.spec`; the phase index is `docs/2026-10-10-open-phases-index.spec`. Both are in the workshop's own form with the content unchanged (checked on conversion).
- The inbox is gone; its ideas now live in the Void spec as ideas waiting to import.
- The census report is gone; `idearium census --report` regenerates it.

## Specced

- `idearium/spec/void.spec`: the Void as the place ideas land:
  - capture from everywhere;
  - landings proposed against the census, clusters and end-states;
  - start / flow / close rituals and honest momentum;
  - today's unplaced ideas, waiting to import.
- `cos/spec/lab.spec`: the end-state lab. A goal comes with a check that must fail first; agents attempt it in parallel in branched compartments; the torture chamber judges; the best attempt is offered as a proposal.

## The census, re-run

1,232 phases (253 verified, 234 claimed, 9 contradicted, 116 open). 228 specs (99 built, 42 partial, 27 unbuilt, 60 documents only). 180 of the 228 sit in `docs/` and so count as core, even when they're about another system. That move is the consolidation step still to decide.
