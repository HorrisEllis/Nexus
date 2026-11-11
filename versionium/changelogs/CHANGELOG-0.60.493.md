# 0.60.493 — the first build lands through the pipeline; it waits for the build and judges its own phase (PC8 expanded)

James, 2026-11-11: "Just get it working" · "continue. get  it working"

## What happened
- **A build landed.** IN0_baseline, run `phrun-mwbvx7hu-fbnr`: 17 minutes, 3 agent calls. Gemini: provider down. ChatGPT: its reply was
  not found on the page after 180 s. Claude wrote `scripts/tree-census.js` (276 lines; `node --check` passes; it only reads).
- **Why the two runs before it asked no agent:** the phase's contract file, kept from the first failed run, marked the agents as having
  failed it, when the failure was Copilot being asleep. It was archived beside itself
  (`idearium/data/phase-contracts/nexus-id-repo-89bcfaa8/_archive/`), not deleted. The next run reached the agents.

## Built
- Idearium: `GET /api/repos/:uuid/phases/landed?phase=&waitMs=` waits for a phase's newest build to end; ok only when it landed.
  Command row: `repo landed <repo> <phase>`.
- Idearium: `POST …/phases/evidence { phase }` judges that phase alone, and says no (409, with the reason) when it does not close.
- `idearium/pipelines/idearium-build.pipeline`: nine tasks: ready, covered, map, dag, graph, build, **landed**, evidence, ledger.
- `lib/nexus-client.js`: a woken system is waited for 30 s (COS holds a start 15 s under its memory floor).

## Proof, on his running system
Run `5047dbb3` of the nine-step pipeline: seven steps met in 54 s. Evidence refused, rightly:
"IN0_baseline is not closed on evidence: 1 of its files do not exist: scripts/tree-census.js".
The file is a proposal in nexus/core (inject `35cf0043`): a Nexus system's change waits for his approval.

## Not done, said
- The approval is his. Nothing was applied to the live tree.
- The stale-contract cause is not fixed in code (an attempt where nothing was sent still counts against the agent).
- COS holds the pipeline twice until COS is restarted: the nine-step one is "Idearium build pipeline (imported)".
- No test was added or re-run for this release.
- Not yet in Versionium (§17.12).
