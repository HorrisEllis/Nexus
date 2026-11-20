# 0.60.616 — a phase is planned when the Emerge ladder is set

James, 2026-11-20: "do it. prove it"

## What changed
The first real build through the ladder (EMB3, run phrun-mwoybi65-ospo) crashed in 54 s, unplanned. `planMode` (lib/pipeline-routing.js) counted only the escalation ladder's Ollama rungs, or `backend: ollama`, as "Ollama codes"; with the provider pinned to DeepSeek (to keep the run on his PC) the planner did not run, the plan named no exports, and the Emerge rung had no skeleton to fill. DeepSeek's two coding calls through the project agent also answered 0 characters (classed transient). `routing.emerge_ladder` now counts as Ollama coding: with it set, the phase is planned, so its files name their exports and signatures.

test-pipeline-routing 9/10 before and after (a Windows file URL), test-emerge-rung 10/10.

## Files
- lib/pipeline-routing.js: planMode
