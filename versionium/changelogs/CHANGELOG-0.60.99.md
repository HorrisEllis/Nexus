# 0.60.99 (built on the branch as 0.60.75; renumbered at the merge with main) - 2026-10-16

James: "it's stopped. needs to retry, also probably should gather context on why it was rejected. even injecting it into complex reasoning agents. to compare, but also the comparison engine? like can you find all tests, qa, qc, debugging, strategy, relationships. okay, yeah like it needs to be tested before it gets there, and any tests needs to be informative for the agents."

Context: he had just rejected an agent's lib/hat-seed.js proposal (-281 +20). Nothing retried, and the agent was told only that it was rejected.

## Why it stopped (found, not guessed)
`repos.auto_retries` (2 per phase per day) counted every automatic retry together. The two before were infrastructure failures (copilot "signal is aborted without reason", chatgpt `tab_busy`), so the reject retry was held: "already had 2 automatic retries today".

## What changed
- **lib/test-map.js (PE1):** which tests exercise a file, and how (requires / path / name). Direct links only.
- **lib/proposal-evidence.js (PE2):** compares a proposal with the file (lines, declarations and exports lost, parse) and runs the linked tests twice in a shadow copy of the tree: as the file is, and as proposed. REGRESSION = passed before, fails after. The summary names the failing assertion and the removed exports.
- **lib/repo-inject.js (PE3):** evidence is attached in the background after an agent proposes; editing clears it; `apply()` refuses an agent proposal with a regression unless forced.
- **idearium/api (PE4):** a rejection tells the agent James's reason and what the evidence found, and asks which was the cause; the retry note carries the same. Retries are counted per kind.
- tests/modules/test-proposal-evidence.test.js PE-01..10; docs/2026-10-16-proposal-evidence-phasemap.spec; loom run-state-map wires.

## Not built (mapped as PE5-PE9)
The Code tab showing the evidence beside the diff; tests generated from the contract before the build, by a different hat, seen failing first; the comparison engine and graph `tested_by` edges; intelligence learning from rejections; the `signal is aborted without reason` source.

## Honest limits
The API reject/retry path has no automated test and was not run live. Only directly linked tests run (max 6, 60 s each). A test needing data/ or a service fails both times and is "already failing". Passing tests do not prove a change is right.
