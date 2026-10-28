# 0.60.232 — 2026-10-24

James: "Archive." (his answer to "1. Home or archive the unhomed folders … Your erosmancer question is still open.")

## How it was read (to confirm)

Archive what is not a system and is not needed. By the axioms (REVERSIBILITY, and §1.2: nothing fails silently), a folder that live code
still uses cannot be archived without breaking it, so it needs a home instead. Each candidate was checked for:
- requires;
- paths named by name (spawned, served, read);
- npm workspaces;
- tests.

## Archived

They went to `_archive/2026-10-24-not-systems/` with `git mv`, so their history follows. A README there says why, and how to restore.

| folder | why it could go |
|---|---|
| remote-desktop/ | named only in loom's generated registry |
| security/ (top level: e2e-channel, signaling-envelope) | named only in loom's generated registry |
| emergence/ | nothing in Nexus requires it. Its own suites went with it; `test-emergence-and-warp-suites` keeps WARP's (43/43) |

## Not archived

**His to decide:**
- **erosmancer/**: Clear Glass starts ErosmancerOS from `erosmancer/erosmancer-os` (`clear-glass/src/eros/supervisor.js`, his words in it:
  "erosmanceros to start with clearglass"), and it is an npm workspace. Archiving it stops that.
- **sentinel/**: `cli/sentinel.js` reads its contract, and test-sentinel-cli and test-adversarial-sim run that CLI.

**Kept, because they are live:**
- **service/**: the Idearium UI tells him to start `node service/idearium-service.js`.
- **tablet/**: two tests read its pages.
- **seams/**: `tests/brutal.test.js` requires it.
- **ui/**: it is served.
- **The used unhomed folders** (warp, nexus, meta, emerge, cli, cockpit, hooks, contracts, architecture-spec) each need a home rather than
  the archive.

## A regression of 0.60.230, found and fixed

`test-cos-compartment-template` CT-03 and CT-04 used sentinel as the example of a sovereign system. 0.60.230 made sentinel not a system,
and that test was not run then; it passed at 0.60.229, checked in a worktree. The example is now **components**, the one of his 15 that
requires nothing in another system.

## Proof

- test-registry-draft 6/6: the archived three left the tree, are kept in the archive, and are never counted.
- test-cos-compartment-template 7/8. CT-07 fails as it did at 0.60.229: the ratchet's three crossings.
- test-emergence-and-warp-suites 43/43.
- Also green: test-autopilot-intelligence 4/4, test-nexus-self-and-cos-run 30/30, test-eros-workbench 6/6, test-sentinel-cli 11/11,
  test-adversarial-sim 20/20, test-drawbridge-registry 8/8, test-system-registry 9/9, test-loom-map 19/19.
- **Already red on main, not this change:**
  - test-cg-accounts-portal-settings UI-05/UI-08;
  - test-system-boundary SB-06/SB-08.
