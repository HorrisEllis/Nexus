# 0.60.98 (built on the branch as 0.60.74; renumbered at the merge with main) - 2026-10-16

James: "what about generating the tests first, wouldn't that be easier and then it would help shape the expectation of the output?"

## Why this came first
An agent's proposal for lib/hat-seed.js (-281 +20) reached the Apply button. It did not parse (the outer seedHats() was never closed), kept a stub, and re-declared constants. The code.write step gate would have blocked it, but that gate ran only inside land(). lib/code-edit.js and two idearium API routes call RI.propose() / RI.edit() directly.

## What changed (lib/repo-inject.js)
- `_screen()`: code.write gate (not empty, parses for json/yaml/js), collapse guard, and a new **shrink rule for agents** (a 100+ line file cut to under a quarter is refused with both line counts).
- Runs in `propose()` for every caller, and in `edit()` for an agent's proposal. A person's editor save is untouched.
- The refusal text is returned to the caller, so the agent is told why.
- tests/modules/test-inject-screen.test.js IS-01..09; the real proposal is kept as a fixture.

## Not built (the larger idea, mapped)
Tests generated from the contract's `conditions` before the build, written by a different hat (the officiator), required to fail first, run in a COS compartment via safe_apply, results shown beside the diff. .contract v2 already has executable `{test: file}` conditions, and lib/safe-apply.js already verifies in a COS branch; neither is on the Code-tab proposal path yet.

## Open
`copilot gave no route: signal is aborted without reason`, and the chatgpt `tab_busy` refusal.
