# 0.60.587 — the build profile: a RAID gate per compartment, in Emerge

James, 2026-11-18: "make it happen. everything that can help improve ollama and the pipeline" · "The gates and steps. Are more intelligent. Compartments. Raid gates. Also make sure to use emerge"

## What changed
the build profile, a RAID gate per compartment, decided in Emerge: when a run whose steps build a phase starts and memory is tight (within 10 points of the machine's own line, lib/prevention.js), cos/pipeline/profile.eg names the running compartments the build does not call; COS asks to pause each as rule:build-profile, which RAID approves or refuses (CP5b, fails closed: refused, it stays running, said); when the run ends COS resumes exactly those. Kept always: what a build reaches by request, even rarely (cos, cortex, ollama, copilot, idearium, emerge, clear-glass, guardian, orchestrator), what it calls, the critical and the stopped: a paused process holds a request rather than refusing it. Measured that day: DeepSeek's load took free memory from 7.1 GB to 0.6 GB in a minute. profile.test.eg 2/2; stall 2/2, gate 10/10, runs 7/7, box 14/14; test-cos-pipeline 19/21 (CP-00, CP-01 failed before this change; CP-16 passed on a second run).

## Files
- cos/pipeline/profile.eg (new, Emerge) and cos/pipeline/test/profile.test.eg
- cos/pipeline/cli.eg: the profile command
- cos/pipeline/index.js: the hook on a run's start and end

## Not done
COS loads it at its next restart. Copilot's background 3b probe still competes with a build for the one Ollama slot (next).
