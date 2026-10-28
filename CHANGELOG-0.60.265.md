# 0.60.265 — a change to Nexus as one zip you drop in the Versionium tab; main's merge damage repaired

James, 2026-10-28, asked for the changes: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import"

Owned by: docs/2026-10-28-gated-flows-phasemap.spec and docs/2026-10-28-tab-compartments-phasemap.spec (dated addenda).

## Built: change packs (`lib/nexus-self/change-pack.js`)
Nexus's own repos are immutable ("edit on a COS branch … and apply through the gate"). So a zip of changed files dropped in the Versionium tab
could be imported as a version, but never put back. A change pack is that zip with its base written into it:
- `nexus-change.json` lists every changed file with the hash it had before the change and the hash after. Never anything under `data/`.
- **Drop it** on a Nexus repo's Versionium tab. It is recognised before the history import and checked against the files on this machine,
  system by system. Each file is "to write" (it is the file the change was made against), "already here", or a conflict (it changed here).
  With any conflict, nothing is written anywhere.
- **Apply.** On his press it goes through `lib/nexus-self/apply.js`:
  - scoped per system;
  - recorded before writing;
  - atomic per file;
  - ledgered;
  - each apply has a **roll back** button.
- **Making one:** `node lib/nexus-self/change-pack.js <from> [to] [out.zip]`.

## Found and repaired: what PR #181's merge had undone on main
Main was at 0.60.260. The conflict resolution in `561f9866` ("Merge branch 'main' into claude/laughing-fermi-4f7sj5") kept this branch's side
of every file both had changed. That lost:
- `lib/version.js`: the version lines for 0.60.223 to 0.60.260, his quotes among them. `VERSION` and `package.json` went back to 0.60.222.
- main's own `CHANGELOG-0.60.221.md` and `CHANGELOG-0.60.222.md`, overwritten by this branch's files of the same names;
- the autofill export, import and undo (`preload/index.js`, §AT2 0.60.256);
- the Glass-frame popups (`compartment-window.js`, §GF1 0.60.258);
- the human-check gate before a gig is typed (`bridge.js` `_gigFill`, §HC3);
- 7 rows of `docs/SPEC-REGISTRY.spec` and 3 compiled specs in `test-substrate-spec`.

All of it is back, checked line by line against main before the merge: 0 lines still missing, apart from the version numbers, which move on.
This branch's 0.60.221–0.60.224 are renumbered **0.60.261–0.60.264**: the same releases with the next free numbers, each changelog saying so.

## Proof
- `tests/modules/test-change-pack.test.js` 6/6. A pack is built from this repo's own 0.60.224 commit, then:
  - applied to a copy of the before-files, one gate apply per system;
  - seen as already here;
  - rolled back;
  - refused whole on a single conflict;
  - refused when a file was edited after the pack was made.
- `test-fiverr-works` 11/11 (with the restored HC3 gate), `test-substrate-spec`, `test-compartment-window` and `test-browser-shell` after the
  merge: see the commit.
