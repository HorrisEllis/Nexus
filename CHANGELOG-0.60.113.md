# 0.60.113 — 2026-10-16

James: "expand it."

He said it about the flight recorder he had just had branched out of Nexus into its own Idearium repo (0.60.112). The
coder's reading (to confirm): make it real, not just copied. First, how far it is from standing alone; then the product's
own phases, mapped.

## CV2a: how each link loads, and the tangle

Every link the carve follows now says how it loads:
- **load:** at the top of a file. The file cannot load without it.
- **lazy:** inside a function. It loads only when that function runs.
- **optional:** inside a `try`. The code already runs without it.
- **asset:** data read beside the file (`path.join(__dirname, ...)`). It is never cut. State under `data/` is never
  carried.

**The tangle** ranks each link from the product to the rest of Nexus by how many files come in only through it.

**`cut: ['optional']`** leaves the optional links out and lists them. This is the preset's default. `'lazy'` can be cut
too, but that is said as a risk: a function that uses the link would then throw.

## CV2b: does it load alone?

`verify` writes the carve to an empty folder, with Nexus's `node_modules` linked in and nothing else of Nexus reachable.
One child process then loads every named file there and reports which threw and why. Servers and CLIs are skipped by name.

Creating a repo always runs this check and records the result in `CARVED.json`, the README and the decision note. Loading
is not running: it proves every require is there, not that the code works.

## Measured on the flight recorder

| links kept | files | lines | systems | loads alone |
|---|---|---|---|---|
| every link | 326 | 51,266 | 15 | 57/57 |
| optional left out (default) | 168 | 27,044 | 8 | 57/57 |
| optional and lazy left out | 135 | 20,438 | 5 | 57/57 |

`versionium/server.js` is skipped in every run, because it starts a server when loaded.

Before the cut, two links had carried 81 of the 154 pulled-in files:
- `lib/repo-inject.js` → `guardian/lib/code-artifact.js`: 54 files (lazy);
- `lib/diagnostic-causal.js` → `lib/gap-field.js`: 27 files (optional).

## Found while building

- A require written as `function _ca() { return require(...) }` on one line was read as load. It is lazy.
- The first carve did not load alone. `domain-nodes` reads `lib/node-schemas/` from disk, which no require carries. Assets
  fixed it.
- A relative root made the check's `node_modules` link point at itself.

## Mapped (the product, the coder's reading)

- **FR1:** one record per agent change, joined from what is already written (versions, run and gates, events, causal
  edges).
- **FR2:** tested in a COS test environment before it lands.
- **FR3:** undo any change.
- **FR4:** stands alone (`npm install`, start, record, undo).
- **FR5:** the demo, RF2 on MASTERMIND recorded end to end.

## Also

- The route takes `cut` and `verify`.
- The command is `repo carve --cut optional|optional,lazy|none --verify`.
- Branch from Nexus has a choice of what to leave out. Its Preview shows "loads alone", what was left out, and the biggest
  links.

## Proof

`tests/modules/test-repo-carve.test.js`: 12/12.
- CV-09: the kinds and the tangle.
- CV-10: the cut.
- CV-11: verify, both passing and failing.
- CV-12: the preset through the route.
- CV-08: the UI in Clear Glass.
