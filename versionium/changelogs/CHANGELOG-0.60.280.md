# 0.60.280 — gated dropdowns in the node, keys in macros and automation, the bundled node upgraded, the floating CLI pinned

James, 2026-10-29: "the drop downs, still aren't working. make the gates for them gated and have them check for the correct value. remember
this is the nodes in the settings, not hardcoded, so add capabilities to the actual backend. like the gates, add the keyboard shortcuts per
site to the macros and automation. that way we can bind arrow keys, or numbers to each drop down menu value. / the clearglass floating menu
button, can you make that an option to pin it?"

Mapped first: `docs/2026-10-28-gated-flows-phasemap.spec`, KB4–KB7, as real phases that `lib/phase-dag.js` checks. KB1–KB3 were entered
the same way.

## What was wrong
The macro engine ran each step and moved on: nothing checked the page after a step. FG3's gate evaluator (`gate-eval.js`) was on disk and
never wired. So a dropdown pick that did not take could only fail inside `choose` itself, and a node could not say "check it, and try
again".

## KB4 — gates on macro steps (backend, in the node)
- A step may carry a `gate`, checked after the step runs:
  - FG3's `url`, `selector`, `text`, `value` and `gone`;
  - new: `choice: { column | row | selector, is }`, meaning the dropdown there now shows this value. It is read by the driver's new
    `readChoice`, with the same match `choose` reads back with.
- **When the gate stays closed:** it is polled up to `timeoutMs`, then the step runs again, up to `retries` (default 2). After that the run
  stops and says what the gate saw.
- A `choose` that fails with a gate on it is retried the same way.
- Gates are validated when the macro is made, not found broken mid-run.
- New browser actions: `read_choice`, and `press_key` with `times`.

## KB5 — keys in macros and automation
- A `choose` step takes:
  - `pick`: auto, pointer, keys or number (the order of the ways to pick);
  - `keys`: an explicit sequence;
  - `keysFor`: keys bound to each value, e.g. `{ "3": "Down Down Down Enter", "14": "1 4 Enter" }`.
- `press_key` takes `times`, and so does a workflow's "Press a key" (the step editor has a Times field).
- A macro bound to a key per site (0.60.275, Settings › Keyboard shortcuts › Keys on sites) is the per-site keyboard shortcut.
- **Caught by the test before it shipped:** the option was first named `by`. Every person's run already passes `by: 'person'` (who acted),
  so it would have refused every real run. It is `pick`.

## KB6 — the bundled node, upgraded without losing his edits
- **The rule.** A bundled node lists the fingerprints of the versions it supersedes:
  - a copy whose fingerprint is one of them was never edited, so it is upgraded, in the library file (`seedBundled`) and in the macro
    store (`upgradeMacro`, used by the gig fill), and the upgrade is said;
  - an edited copy stays his, and the new one lands beside it as `<file>.new`, said once;
  - a node he deleted stays deleted.
- **"Fiverr gig - choose delivery" v2:** `choose` (pick auto), then the gate `{ choice: { column: '{{tier}}', is: '{{delivery}}' } }`, with
  2 retries and 4 s. It supersedes `c4e22f7fde7d67ff` (v1). Edit it in Settings › Automation to bind keys per value (`keysFor`) or change
  `pick`.

## KB7 — pin the floating CLI button
- **Pin the floating CLI button** in Settings › General, or 📌 in the panel.
- Pinned, the ›_ button is on every browser window from the start, and ✕ collapses it to the button instead of hiding it.
- The option is `floatCli.pinned`, and every window hears the change.

## Proof
- `tests/modules/test-gated-dropdowns.test.js` 6/6:
  - GD-01: gates validated.
  - GD-02: a gated step retried until the right value; never → stopped with what it saw; a failing choose retried.
  - GD-03, in Clear Glass: `readChoice`, keys bound per value (a wrong binding is caught by the read-back), `pick: 'keys'`, and
    `press_key ×4`. It runs with `by: 'person'` present, as a real run does.
  - GD-04: unedited copies upgraded, an edited one kept with `.new`, a deleted one stays deleted.
  - GD-05: the pin saved and every window told, ✕ collapses, and the Settings toggle, in Clear Glass.
  - GD-06: a workflow presses N times.
- Unchanged: macro 22/22, automation engine 16/16, automation v2 18/18, automation nodes 8/8, automation settings UI 8/8, about-and-nodes
  4/4 (AN-02 follows the node to v2), fiverr-works 11/11, fiverr-pace 2/2, dropdown-keys 2/2, site-keys 5/5, cg-shortcuts 8/8,
  live-recording 8/8, browser-shell 28/28. browser-shell failed one test once and passed 28/28 on the rerun.

## Not proven here
Fiverr blocks this sandbox. On his machine, the gig fill's result now carries `gates`: what each gate saw, and how many attempts it took.
