# 0.60.336 — Emerge as a system: genesis's skeleton, its language through its door, a system of systems (EAS)

James, 2026-10-31:
> "look at genesis. emerge needs either to be a module for idearium, or a system with a server.js, etc. look at the genesis and architecture spec in idearium. needs to be one"

and, on the answer:
> "okay. do it as long as it gets up closer to building large projects, like i want to be buyilding an operating systems"

## Decided

- **EAS_D0, a system, not an Idearium module.** His axioms settled it:
  - §5.15 rule 3: Guardian, Copilot and Cortex use Emerge, so with Emerge inside Idearium, Idearium going down would break them.
  - §5.15 rule 2: placement is ownership, and Emerge has its own repo, spec and version line.
  - §3.1: he said "emerge will be replacing nexus" (MG_D8), so it sits under Idearium, not in it.

  Idearium still uses Emerge as a module, through its door (§5.9: "embedding is not annexation"). He took it: "okay. do it".
- **EAS_D1, TO CONFIRM.** Nexus holds the one locked snapshot of Emerge at the top level, `emerge/`, not under `cos/vendor`. His
  2026-10-30 words, "copy every file you need to a cos/dependancies folder" (MG28), are read as being about COS's own copies. If he meant
  Emerge itself, EAS3 changes its folder only.
- **EAS_D2, two contracts, two names.** Where the skeleton and Emerge share a path for different things, both are kept, under two names.
- **EAS_D3, the language handlers run the `eg` command line in a child process with a timeout.**

## Built

- **Spec and map:** `docs/emerge-system.spec` (six modules; compiles at specDepth 1.0, no BLACK, invariants valid) and
  `docs/2026-10-31-emerge-as-a-system-phasemap.spec`, with every phase specced again (`.phase` and `.graph` files; no new crossing).
- **EAS1 (Emerge repo):** genesis's skeleton laid out from the archetype (`fromCosTemplate`), never hand-copied: 58 new files, including
  `server.js` on :4900, `cli.js` and the boot core. The 13 shared paths were merged as follows:
  - the IDE's registry and contract became `ide-registry.js` and `ide-contract.json`;
  - the compiler's events became `events-compiler.js`, declared by the skeleton's taxonomy;
  - Loom's record schemas moved to `schemas/records/`;
  - `config.js` and `package.json` were merged;
  - `spec/emerge.spec` 1.1.0 was archived.

  A stale node export from 2026-09 was archived with a pointer.
- **EAS1a (here):** `cos/archetype/nexus-system/lib/boundary.js` `codeOnly()`. The sovereignty check had read template-string text as
  requires, and flagged the generator line `require('../siso')` as Emerge leaving its folder. It now blanks template text and comments,
  keeps every offset, and scans the raw source when anything is unterminated.
- **EAS2 (Emerge 1.13.0):** component `emerge.lang`, `POST /lang/check|run|test|build|say|synth`, and `node cli.js lang-<verb>`. Any
  system, agent or UI codes in Emerge by calling it.
- **EAS5 (Emerge repo):** an OS-shaped tree, three levels deep: emerge → os → kernel → scheduler, with shell beside the kernel.
  - The scheduler's logic is written in Emerge, built through Emerge's door, and served by the scheduler's own door.
  - A tick goes shell → kernel → scheduler by verified handoffs, and the answer comes from the Emerge-built code.

## Proof

- **Emerge** (branch `claude/emerge-as-a-system`), all exit 0, the same as before the change:
  - `npm run test:system`: the skeleton test ("all checks passed"), `lang-door.test.js` 8/8 and `nesting.test.js` 5/5 (run twice);
  - `npm test`, `npm run test:lang`, `node verify.js`, `node docs/learn/verify.js`, `node bench/chunks.js derive`.
- **Here:** `tests/modules/test-boundary-code-only.test.js` 5/5.
  - `codeOnly()` was checked over all 2,854 tracked .js files. Every require it stops counting is in a comment (92) or in text a file
    writes out (17), and none is code.
  - SS-01 and SS-02's checks run on the new spec and map: full depth, every module built by a phase.

## Not done, said

- **EAS3** (`emerge/` at Nexus's top level, locked) and **EAS4** (lib/emerge's 25 callers switched to the door, lib/emerge archived) are
  open.
- On this Windows checkout, two tests fail before reaching anything this release changed:
  - `tests/modules/test-system-skeleton.test.js` crashes: `import()` of a `D:\` path, ERR_UNSUPPORTED_ESM_URL_SCHEME.
  - SS-02 fails on `docs/substrate.spec`: its patterns expect LF, and git's autocrlf gives CRLF. The same failure is on `main`.
- Versionium: this sandbox cannot reach his Versionium. The boot sync records this release on his machine (§17.12).
