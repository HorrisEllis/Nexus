# NEXUS 0.39.228 — the home UI in one JS + one CSS file per area; stored-mode boot crash fixed

**Date:** 2026-09-25 · **Author:** James Brooks · home-ui.spec 1.3.0 → 1.4.0

James: *"The ui is the index.html file."* — the 0.39.223 handoff aimed the UI-file rule at Clear Glass's `renderer/browser.js`; the UI meant is `ui/home/index.html`. Then: *"Can you start on that?"* · *"Continue"*.

## Mapped first
- CSS was already external (`home.css`, 941 lines, shared). The monolith was the JS: 1,950 + 188 inline lines.
- `ui/home/nexus-home.html` (July's decomposed shell) registers 11 channel documents; **only 4 exist** (causal, conversations, idearium, log). The other 7 are not in git history (which starts 2026-09-17). `index.html` is the only working home — Clear Glass's menu opens it — so it was split **in place**, not cut over. Recorded in `DECOMP.md`.

## The split
- `index.html` 2,943 → 835 lines, markup only.
- `ui/home/areas/` — 20 areas, each `<area>.js` + `<area>.css`: void, rail, shell, inspect, console, overview, log, guardian, cortex, idearium, bridge, diagnose, assistant, causal, conversations, rewind, mode-selector, agent-suite, forge-tile, spec-wizard.
- `ui/home/core/` — 6 non-UI modules: logging, config, keys, sse, ui-state, boot.
- `home.css` keeps tokens, reset, layer containers, shared keyframes, and components several channels use (`.gd-box`/`.box-*`, `.btn`, form elements, `.gap-row`, `.box-input`).
- JS cut as **contiguous ranges of the original script, in original order** — nothing rewritten — so the split is provable.
- 43 lines of `home.css` deleted: identical to `ui/tv-shell/spotlight/spotlight.css`, which loads earlier, and nothing between them targets those selectors. The duplicate `.sys-tile{transition:…}` was **kept** (moved to `overview.css`): it overrides the earlier `.sys-tile` rule, so it is not dead.

## Bug found and fixed
With a mode in localStorage, `initMode` → `selectMode` → `_logToData` touched `_uiLog` in its temporal dead zone and threw. That halted the rest of the inline script: `pollHealth`, `connectSSE` and every interval never started, and every later `_logToData` threw. Anyone who had ever picked a mode got a home UI with no health and no live events. home-ui.spec had phase 2 "Silent mode restore" as complete. `core/logging.js` now loads first.

## Proof
`tests/probe/home-split-equivalence.py` — real headless Chromium, both pages served identically, non-local requests aborted, CSS animation time frozen. Reference: the pre-split monolith from git with **only** the logging fix applied. With and without a stored mode, every channel (`tune(0..n)`) and overlay state (menu, inspect, rewind, mode, wizard, console, rail-add); typeof of 126 top-level names; 45 computed properties per element → **EQUIVALENT**.

## Records
- `docs/home-ui.spec` 1.4.0: phase 8 (the split), phase 2 annotated `broken_until` with what was found, `version_history` added (1.3.0's content stated as unknown, not guessed). `SPEC-REGISTRY.spec` entry updated.
- `loom/maps/ui-map.js`: the home page had no loom entry. Its edges are `<script>`/`<link>` loads the source scanner cannot see; registered from `index.html`'s own tags so the map cannot drift — 49 components, 48 wires, 0 failures against a real `LoomDriver`.
- `lib/version.js` + `package.json` → 0.39.228.
- **Not changed, checked:** no registry-components / interaction-contract (the home UI serves no HTTP surface of its own); no atlas covers `ui/home`.

## Tests
- NEW `test-home-ui-files` 14/14 — markup-only index, JS/CSS pairs, every file linked once, logging first, ownership (home.css names no channel; no area styles another's channel); 7 mutation checks, each caught.
- `home-ui` 22/22 (was 19: its CSS checks read `index.html` after the CSS had moved to `home.css`). It and `nexus-full-audit` (87 → 90) now read the assembled page via `tests/helpers/home-page-source.js`.
- Regression: version-sync 30, record-discipline 9, loom-map 19, cg-settings-ui-files 5.

## Not done / open
- Ownership refinements that are not pure cuts (`tuneById` sits in `agent-suite.js`).
- DECOMP Phase 3 (iframe cut-over) — blocked on the 7 missing channel documents.
- Live check on James's machine with services running.
- Pre-existing, unrelated: `nexus-full-audit` "co-pilot sends uiState" fails (the string is in `ui/copilot/copilot.js`); `test-tablet-homepage` reads a missing `tablet/homepage.html`; 0.39.227's changelog says `test-cg-settings-ui-files` 6/6, the file has 5 tests.

## Correction (recorded 0.39.237)
The Proof section above says **45** computed properties per element. The probe compares **40** (counted from its own `props` list in `tests/probe/home-split-equivalence.py`). The equivalence result is unchanged; the number was wrong. The same wrong figure is in `lib/version.js`'s 0.39.228 note, left as written there and corrected here.
