# 0.60.230 — 2026-10-24 — JA3: the element picker on a field the autofill missed

James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per
site settings, and as a macro or automation and updates the autofill." · 2026-10-24: "ja3".

## What was missing
JA1 (0.60.225) made `matchFields` consult a per-site learned map; JA2 (0.60.226) saved a field key into it. But the only way to
teach a field was to type its key by hand (`autofill.learn`). Nothing let him **point at the box**, and a fill never said what it
could not place, so a miss went unreported (§1.2).

## Reuse before build (§8.6)
- **The picker** is `renderer/guardian-picker.js` in its field mode (`pickField`): click near the box, walk the page with the
  arrows, USE or Enter, Esc cancels. `src/providers/attention.js` already drives this mode for provider chats, so this is the
  same script run the same way in the application's tab.
- **What was picked** is resolved to the dom mesh's own field record (`src/dom/archaeology.js` `__cgDomMesh.queryOne`), the
  same record `matchFields` reads. The key it is learned by is therefore exactly what the matcher looks for next time.
- **Stability** uses `renderer/selector-check.js` `looksGenerated` (uuids, digit runs, React ids), loaded the way its own Node
  test loads it.
- **The save** stays the JA2 key format (`matcher.js learnKey`) in the existing site-settings store. It is now **one function**
  (`saveLearned`), and JA2's `/cli/autofill/learn` route calls it too, so the two doors cannot drift.
- New file `clear-glass/src/autofill/learn-pick.js` stands on all four. Nothing existing turned a pick into an autofill field key.

## Built (backend → API route → command/agent, his order 2026-10-07)
- **`clear-glass/src/autofill/learn-pick.js`**:
  - `needsPick(domFields, profile, matches)` → `{ unplaced, unmatched }`. `unplaced` is the profile's field types that hold a
    value but that no field took. `unmatched` is the page's fillable boxes nothing matched.
  - `chooseKey(field, domFields)` picks one of `fieldKeysOf(field)` that **no other field on the page shares** (exactly one
    match, selector-assign's evidence rule), stable first. It falls back to a generated key only when nothing stable is unique,
    and says so (`stable:false`, with a warning). If every key is shared, the pick is refused, with why.
  - `saveLearned(siteSettings, url, fieldKey, fieldType)` is the one save path.
  - `pickAndLearn(...)`: an unknown type is refused before the picker opens. Then the picker opens, the pick is resolved and
    checked (a box that takes text), the key is chosen, the pick is saved, and the page is filled again with the new map. A
    cancel or a refused pick saves nothing and says why.
- **`clear-glass/src/autofill/matcher.js`** — `fillFields` returns `needsPick`; `valueFor` exported (the fill's own value lookup).
- **`clear-glass/src/ipc/bridge.js`** — the IPC `autofill:detect` / `autofill:fill` (the panel's door) now load the learned map too; JA2 had wired only the HTTP routes. `POST /cli/autofill/pick` `{ fieldType, agentId?, profileId?, label? }` and IPC
  `autofill:pick`, both through `_autofillPick`. It emits `autofill.learned` with `by: 'picker'`.
- **`idearium/cli/route-commands.js`** — `autofill pick <fieldType>` (waits up to 5 min for him) and `autofill learn <fieldKey>
  <fieldType>`. JA2 had no command row, so that gap is closed here.
- **`clear-glass/src/copilot/tools.js` + `copilot/bridge.js`** — the `autofill.pick` tool. `_ipcPost` takes a wait, and a pick
  gets 5 minutes because a person is picking.
- **Loom** — `learn-pick` in `copilot-capability-map.js` (its requires), plus the non-require edges in `economy-map.js`: the
  co-pilot → bridge, the command rows → bridge, bridge → learn-pick, learn-pick → guardian-picker (source), and matcher →
  learn-pick (lazy).

## Proof
`tests/modules/test-autofill-learn-pick.test.js` — JA3 **5/5**:
- JA3-01: `needsPick` lists github as unplaced and the oddly-named box as unmatched. A button is not a box.
- JA3-02: `chooseKey` takes the label over the generated name `q_8f3a2c91`. A shared label falls back to the unique name, said
  as unstable. A key shared everywhere is refused.
- JA3-03: on a fake tab, the pick is saved for `https://micro1.ai` only, the refill types github into the picked box, and
  nothing is left unplaced.
- JA3-04: a cancel saves nothing; a button pick and a non-field pick are refused; a typo'd fieldType is refused before the
  picker opens.
- JA3-05: the picker script built from the real `guardian-picker.js` parses, and `fillFields` reports `needsPick`.

JA1 4/4 and JA2 3/3 still pass.

**Not proven here:** the page scripts did not run in a live Clear Glass tab. This container has no Electron display, and his
rule bars Playwright. The real pick is his machine's.

## Readings, to confirm
- His 2026-10-19 words also say "as a macro or automation". GA0b decided that third home for the gig picker. JA3 saves to
  per-site settings and the autofill's learned map (one entry is both), but **not yet as a macro**. That home stays open.
- The phasemap said to "reuse selector-check.js + selector-assign". The learned identity is a field key, not a CSS selector,
  so the live check here is selector-assign's *rule* (the key names exactly one field) applied to the dom mesh's records, with
  selector-check's `looksGenerated` for stability. This is the coder's reading.

## Open next
- **JA4** — the panel: after a fill, a "pick it" per unplaced type (IPC `autofill:pick`, built), and the learned fields per site
  with a Forget (§0.3). The UI is deferred to JA4; said, not hidden.
- The macro home (above), and **a real Clear Glass fill** on one live listing (his login, his machine).

---

> **0.60.230 was used twice.** The entry above is main's (JA3, Clear Glass autofill). The entry below is from `claude/sleepy-gates-9lc085` (SL10), built in parallel under the same number and merged in 0.60.233. Neither was renumbered (§0.3).

---

# 0.60.230 — 2026-10-24

James: "in the idearium pipeline, building phases, extending, building from scratch. run deep and recursive simulations, of every
possible failure mode, loop until we get a solid pipeline."

SL10 of the self-building-loop map: the last of the four phases mapped for this request (SL7, SL8, SL9, SL10). SL3 was mapped before.

## Built

`tests/modules/test-pipeline-sim.test.js` runs **25 scenarios** on the real phase-build route, the real repo layer, the real inject
path, the real contract scheduler and the real proof run. Only the model is scripted.

| Area | Scenarios |
| --- | --- |
| From scratch (a new system) | A01–A13: a good agent; no reply; timeouts; prose with no code; a refusal; a spec instead of code (your RF2 run); the right code under the wrong path; a path outside the repo; a syntax error; a partial file; an unclosed fence; the other file's code; an agent that falls over once |
| Extending existing code | E01: a change keeps the export its consumer uses. E02: the change drops it |
| The gates | G01–G09: a finding, a decision, an open dependency, a cycle (with and without `anyway`), a dangling reference, no graph (the agent can map it / can't), a complete phase (with and without `rebuild`), a phase that doesn't exist |
| The UI | U01: the run shows why a brick didn't pass |

Each scenario names what the pipeline must do, and the suite checks it on the run's rows, the proposals and the disk.

## What the loop found, each fixed at its root, the whole matrix re-run after each

1. **My first matrix design was wrong.** After A01, every scenario resumed its checkpoints and passed without asking the agent. That's
   correct resume behaviour, so each scenario now builds a fresh phase.
2. **`anyway` past a cycle recorded nothing.** DG3's rule says it is "said on the run". Every row now carries `dagOverride`.
3. **Every failed brick said only "FAILED".** A syntax error, a refusal and an empty reply ended identical in the record (§1.2). The
   contract audit now gives each brick that didn't pass its reason, and the Plan panel shows it.
4. **repo-inject's refusals were dropped.** "Does not parse as js: SyntaxError", "unsafe path", "unclosed fence" were all reported as
   "the reply did not bring back the file". The reason is carried now.
5. **A wrong-path reply left junk in your review queue.** It left 3 identical proposals of a file nobody asked for, from one failed
   brick; in auto mode the file was written to disk. Now it is rejected (or reverted, when applied), with its reason. It is kept in the
   record, never deleted, and you can still apply it by hand.
6. **`idearium repo plan --dry --file <spec>` printed its usage** (test-plan-lands PL-31, red on main). The route table shadowed the
   hand-written command. The other collision, `log`, is left as it is: its row replaced the old Vortex log with Nexus's logs on
   purpose, it seems.

## Confirmed already solid (no change needed)

- A refusal is blocked at the reply gate.
- Dropping an export another file requires is refused ("it removes export"), so the brick fails and says so.
- A flaky agent recovers on retry, and a transient failure doesn't burn retries.
- Every failing run ends within its attempts; none hang.

## Said, not hidden

One traced run before the last fix showed a single failure whose name I didn't capture. It didn't reproduce in the eight runs after.

## Proof

| Suite | Result |
| --- | --- |
| test-pipeline-sim | 25/25, eight runs in a row |
| test-plan-lands | 18/18 (was 17/18 on main) |
| contract-phase-build | 14/14 |
| chunked-phase-build | 16/16 |
| contract-adapters | 19/19 |
| contract-gates | 20/20 |
| phase-close | 6/6 |
| evidence-close | 5/5 |
| plan-code-run-attention | 40/40 |
| verify-first | 10/10 |
| build-queue | 6/6 |
| phase-graph | 4/4 |
| phase-deps-gate | 3/3 |
| agent-maps-phase | 4/4 |
| phase-groom | 6/6 |
| phase-nodes-all | 5/5 |
| phase-dag | 8/8 |
| phase-specs | 4/4 |
| substrate-spec | 3/3 |

Phase nodes: 1939, 0 drift.
