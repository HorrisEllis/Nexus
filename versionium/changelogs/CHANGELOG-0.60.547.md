# 0.60.547: the pipeline runs fully: three faults found on the way and fixed

James, 2026-11-15: "pipeline needs to run fully. then anything we can use the pipeline for, like tool forge, copilot automation tasks and
jobs, everything that raid does at least."

The whole chain was run end to end in the sandbox: COS, then Idearium, Copilot, ollama-bridge, Cortex and Versionium, with a stand-in
Ollama. Each stop was profiled (CPU or heap), not guessed.

## Fixed
- **RC2, the node registry** (`lib/node-registry.js`) folded its whole store on every file event: 88.6 % of Idearium's CPU. A full
  nexus-self sync (~1,400 chunk nodes per system) left Idearium unresponsive for 25+ minutes. It now folds once per burst (1 s quiet,
  at least every 10 s); every row is still kept. Measured with 1,400 files: 14.1 s → 0.5 s, and the longest stall 3,460 → 43 ms.
- **SB34, code-intel's cache** (`lib/code-intel/index.js`) kept every repo's index for the life of the process. After one sync, 480 MB of
  Idearium's 1 GB heap; the next sync or the build's census ran it out of memory. The cache is now bounded by size
  (`CODE_INTEL_CACHE_MB`, default 48), and a snapshot reads once (`{ cache: false }`). Live after a sync: 490 → 4 MB. Five forced syncs
  in a row held steady (282 MB). The full sync now takes ~45 s (86 s before, 25+ min at first).
- **P2, adding a phase** (`idearium/repo/roadmap.js`): in a Nexus map the new phase landed inside the one before it (HR1 as a field of
  HR0). The indent is now read from the map.

## Proof
NR-12 (fails on the old code), CI-701, RP-001b (fails on the old code). test-node-registry-system 12/12, test-code-intel 39/39,
test-nexus-self-and-cos-run 31/31, test-mco3-repo-snapshot 39/39, test-mco3-versionium-tab 32/32, test-pipeline-root-causes 19/19.
NR-10's premise had drifted: every registered system now has its own process, Emerge included (:4900).

## Not done yet (said)
- His request ran through intent and the phase to the build. The build stopped at "landed": the stand-in model writes no real code. A
  run with a real model on his machine is the next proof.
