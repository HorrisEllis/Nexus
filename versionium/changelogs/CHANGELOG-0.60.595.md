# 0.60.595 — the build profile's pauses carry their proof to RAID

James, 2026-11-19: "Keep getting the pipeline built." · 2026-11-18: "The gates and steps. Are more intelligent. Compartments. Raid gates."

## What changed
the build profile's pauses carry their proof to RAID: found in NM1's run at 07:56–08:06 that the profile (cos/pipeline/profile.eg) decided right (pause intelligence and versionium, about 638 MB, at 8% free against a 20% line) and RAID refused every pause, "proof required, none supplied for 'pause'": COS's pause route never passed a proof on. Now a rule's pause carries its evidence (kind measured, decided by profile.eg, free %, the line, what the build calls, why) and the route hands it to RAID, which decides; checked against RAID itself: with the proof, approved; without, refused. Meanwhile, measured: DeepSeek reached the coders, and at 0.4–0.8 GB free a 10-minute call hit its limit and a reload failed at Ollama's 5-minute load limit (HTTP 500); COS froze (31.7 s, 9.5 s, 6.5 s, no slow call) and the service killed it at 08:05; the run resumed itself. test-cos-service 11/11.

## Files
- cos/manager/server.js: the pause/resume route passes body.proof to RAID
- cos/pipeline/index.js: the profile sends its evidence as the proof
