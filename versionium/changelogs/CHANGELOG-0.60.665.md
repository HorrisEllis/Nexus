# 0.60.665: Nexus builds itself, bottom up, on a schedule; runs grow, recover and resume; WARP 2 in Emerge; RAID on every drawbridge; COS restarts itself

James, 2026-11-25/26: "Anything starts as the first step. Then everything branches from that one, one by one from the gates." · "Have it expand itself, fix itself" · "Warp should be replaced by warp 2.0. Replace siso" · "raid needs to connect to each drawbridge" · "you need to add the ability to restart cos when needed" · "What ever gets the pipeline building all of this the quickest. Once that happens, nexus can build in my sleep" · "Yes"

- **The pipeline grows** (PC26): a step's outcome adds branches to its own run, each naming its parent and why; a failed step's branches are its recovery; a resumed run regrows what its done steps grew. The request's node files (cos/pipeline/runs.eg) take every grown step, its DAG and conditions; a failed step is met through its recovery.
- **One piece, one step**: the build plans a step per piece (emerge-rung `only`), a helper its own step, the piece again after it; held, it files its failure with Cortex and climbs 3b → 7b → DeepSeek.
- **The queue**: the pipeline "Nexus builds itself (bottom up)" takes Idearium's ready phases from the phase graph (bottom layer first, by what each unlocks) and builds them piece by piece; the workflow "Nexus builds itself, every 4 hours" runs it (his yes), stepping aside while a run is going.
- **WARP 2** (his, EM2/CF1, in Emerge): emerge/emerge/field/causal.eg (typed causes, no cycle or diamond, chain, sigma, delta) and warp.eg (the link: nothing without its cause; expectations declared first, broken ones gaps; adapt). SISO (his mentor's) stays attributed and is replaced file by file next.
- **RAID everywhere**: COS's supervisor split by harm (PG5); every drawbridge call; an agent's or a rule's pipeline run; the build's wake of the bridge with measured proof.
- **COS restarts itself** when the code it runs changes, with RAID's yes; interrupted runs resume.
- **Copilot** reads and starts runs (cos pipeline-runs, -run-show as a tree, -start with a reason) and looks in Nexus's records before answering (a named phase's builds, ledger, runs).
- **The canvas** draws each piece as its own node, wired to the one it builds on; the build's tree inside the view.
- **Maps**: PC26-PC29, PG5, the break-anything-down map UD1-UD22 written by Idearium through its own route; T17 judged, T18 registered and revised.
- Fixes found on real runs: the gate's readers by number, self-defeating bodies refused by the compiler side, a step that did not build its phase fails, the Automation tab restored.

Checked: pipelines 9/11 (PL-03b, PL-06 pre-existing), supervisor 12/12, cos-service 11/11, emerge-rung 14/14, copilot-orchestrates 3/3, causal 4/4, warp 4/4, gaps 20/20, nexus-command-tool 8/8.
Not proven: a phase completed end to end by the schedule (the first run is going); Idearium's mapper's one-map option needs Idearium's restart.
