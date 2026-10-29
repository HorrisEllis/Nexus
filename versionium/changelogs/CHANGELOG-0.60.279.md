# 0.60.279 — Clear Glass and the COS app go to Versionium too; categories and cos.exe as the compartment manager, mapped

James, 2026-10-29: "yes, clear glass macros and settings too."
James, 2026-10-29: "catagories using either the architypes or the templates, with a full manager and editor, with the schemas, then
catagories which can be managed, including systems which would then list each system compartment. also really need cos.exe to be a fully
compartment manager with controls for the rewind engine, diagnostic tools, versions, data browser and tools. cli access. index.html/ui for
the thumbnail. look at all of the cos phases, and add all of this to them."

## Built (§17.12)
- **Clear Glass settings and site settings.** One record per burst of saves (2 s), carrying the keys that changed, before and after. Every
  secret (password, token, key, cookie …) is redacted, even nested (`lib/versionium-record.js` `objectChange`, `settingsRecorder`).
- **Macros.** One made or deleted carries the whole macro before and after (`lib/agent-tools/tools/clear-glass/macro.js`). A run is not a
  change.
- **Node files.** One saved into the library carries its text (`lib/automation-nodes.js`).
- **The COS app (COSA14, open since 2026-10-15).** Every install (an inbox drop too), remove, switch and rollback is recorded, with from,
  to, the outcome and the reason. `cos/app/versionium.js` is the exe's own small recorder, because the exe ships without lib. It uses the
  same contract and keeps its own outbox in COS's store, replayed at start and every minute. It is in the exe's file list.
- **Fixed.** A test process never writes into a real Versionium: the sandbox remaps data folders, not ports, and 0.60.278 lacked this
  guard. Both recorders skip a test process and say so, unless the test opts in and points at its own stand-in.

## Mapped (not built): `docs/2026-10-24-cos-manager-phasemap.spec`
- **MG10 categories.** A category comes from an archetype or a template, carries its schema, and has members. It is made, edited
  against its schema, renamed and removed (archived). There is a built-in "systems" category listing each system compartment. Every change
  goes to Versionium.
- **MG11** the category manager and editor UI.
- **MG12** cos.exe as the full compartment manager: a category tree, and per compartment Rewind (VM1 checkpoints, CS1 versions, Clear
  Glass session rewind to confirm), Diagnostics, Versions, Data (through its own routes only, §5.15) and Tools. CS8 is gathered into it.
- **MG13** CLI in the exe: a console pane, and `COS.exe <command>` headless.
- **MG14** live thumbnails of each compartment's own index.html.

They are real YAML, so `lib/phase-dag.js` checks them: every dependency resolves, with no cycles. Readings marked "to confirm": what a
category is, what "rewind engine" means, and what "the thumbnail" means. The eight other COS maps each have a dated addendum saying how
they connect: app, spine, console, machines, services, guardian-into-cos, loom-into-cos and testenv. COSA14 is marked BUILT in the
cos-app map.

## Proof
- `tests/modules/test-versionium-everywhere.test.js` 7/7:
  - VE-05: a settings burst is one record with secrets redacted, and no secret leaves the machine.
  - VE-06: the COS app's install and switch are recorded; while Versionium is down they go to the outbox, replayed in order.
  - VE-07: a test process is skipped and said.
- Unchanged: the cos-app suites (store 15/15, switch 10/10, runtime 9/9, shell 12/12, update 14/14, self-update 5/5, build 8/8, ui 21/21);
  Clear Glass global-settings 5/5, site-readers 7/7, site-settings-ui 3/3, cg-shortcuts 8/8, site-keys 5/5; macro 22/22,
  about-and-nodes 4/4, live-recording 8/8. test-options keeps its base failure (OP-05, Guardian's jobs.no_tab_ms).
