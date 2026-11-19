# 0.60.586 — NM1 unstuck: RAID decides the coder's fit; a paused repo is said; the index wait is bounded

James, 2026-11-18: "This needs to work." · "Seriously? I'm so sick of this not working. Look at the phases for optimized ollama. Also the planner for the pipeline" · "make it happen. everything that can help improve ollama and the pipeline"

## What changed
NM1 unstuck, three causes found and fixed in Idearium: (1) the coding step decides a local model's fit by RAID's rule (OL4a): DeepSeek wrote and passed NM1's test (planning asked RAID: resident), then every coding step skipped it by its own strict check ("needs ~10.0GB; 7.7GB available", the GPU's 2 GB counted as RAM) and the ladder ran out. (2) A paused repo is said, never a silent stall: nexus/core was paused from the Code tab at 13:48 and every build until 17:06 sat in test-first with 0 calls, closed by the watchdog as stalled four times; now the watchdog writes "waits for ▶, paused by … at …" instead of closing it, and the landed route answers the same. (3) The agent's wait for a repo index is bounded (2 min, as a sync's already was) and never starts a second import. test-plan-code-run-attention 48/48.

## Files
- idearium/api/index.js: the coding step's fitsModel takes RAID's rule; _watchRuns says a paused repo; repo.phases.landed says it; _ensureIndexed bounded

## Not done
Idearium loads it at its next restart (not restarted while NM1 builds).
