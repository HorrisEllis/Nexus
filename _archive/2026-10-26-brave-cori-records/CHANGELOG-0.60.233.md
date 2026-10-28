# 0.60.233 — 2026-10-24

James: "move erosmancer to either clearglass or guardian"

## Which: Clear Glass, by the evidence

- Clear Glass starts ErosmancerOS (`clear-glass/src/eros/supervisor.js`).
- It wires it (`clear-glass/wire/nexus-wire.js`, `_proxyEros`), drives its input (the `erosmancer` input path) and runs its workbench.
- No Guardian file uses it.

## Moved

Moved with `git mv`, so the history follows:
- `erosmancer/erosmancer-os/` → `clear-glass/erosmancer-os/`. It is still the npm workspace, now listed as `clear-glass/erosmancer-os`.
- `erosmancer/spec/erosmancer.spec` → `clear-glass/erosmancer-os/spec/erosmancer.spec`, with a dated addendum on the move.

The `erosmancer/` folder is gone, and its data stays in `data/erosmancer`.

**Every live path was updated:**
- the supervisor, the wire, and the macro tool (`lib/agent-tools/tools/clear-glass/macro.js`);
- five tests;
- two loom maps;
- the workspace and the lock;
- the README, the atlases, and the spec registry.

History (CHANGELOGs, version lines, older maps) is left as written.

**Also:**
- `lib/system-boundary.js` no longer needs a FOLDED entry for it: by its place, it is Clear Glass's.
- Clear Glass's electron-builder config now excludes it from the Clear Glass app: `files: ["**/*", "!erosmancer-os/**"]`, which is the
  default plus that exclusion.
- On his machine, the next `npm install` re-links the workspace (`node_modules/erosmancer-os`). Here it was re-linked locally, and
  `npm ls` resolves it to `./clear-glass/erosmancer-os`.

## Proof

**The eros tests, run from the new place:**
- test-cg-eros-supervisor 13 passed. 1 is skipped, as it was before the move, because tsx's esbuild has no binary in this container.
- test-eros-workbench 6/6, test-eros-telemetry-bounded 4/4, test-cg-field 13/13, test-macro 22/22, test-phase-actually-builds 6/6.
- clear-glass/test/google-signin 56/56.

**The rest:**
- **TypeScript check:** `tsc --noEmit` on ErosmancerOS gives the same 6 TS6059 errors at the old location, on the committed tree in a
  worktree, as at the new one. They come from its tsconfig (`rootDir` is `src` while `tests/` is included); nothing new. Its own tsx suite
  cannot run here, for the same esbuild reason.
- test-registry-draft 6/6: ErosmancerOS lives in Clear Glass and is not a folded folder.
- Also green: test-loom-map 19/19, test-drawbridge-registry 8/8, test-system-registry 9/9.
