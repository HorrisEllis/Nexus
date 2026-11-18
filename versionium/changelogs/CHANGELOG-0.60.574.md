# 0.60.574: RAID decides each local model's fit, aloud (OL4a)

James, 2026-11-18: "supposed to be more events for this exact purpose" · "96% sure. i feel like everything needs to go through raid."

Found in NM1's run records: "won't fit memory: ollama:deepseek-coder-v2:16b". Idearium dropped both local models by its own copy of the fit rule
(1.2x the model must be free: 10.7 GB for DeepSeek; ~7-8 GB free with Nexus up), said only in a data row, so the build went to Gemini and Claude
alone. The same day DeepSeek had been measured running at ~20 tokens/s on this machine with Nexus up.

- `lib/resource-monitor.js` fitsModel: a `rule`. `strict` (unchanged, the default) or `resident`: the model fits in RAM at all (<= 75% of it); it
  loads, slower while others page out. 16 GB: DeepSeek 8.9 GB admitted, the 30B's 18.6 GB refused.
- `cortex/boot.js`: `POST /api/raid/route/fit` — RAID decides by `routing.fit_rule`, prints each decision in its console
  (`[raid] route: <model> admitted|skipped (fit_rule …) — <numbers>`) and emits `raid.route.fit`.
- `idearium/api/index.js`: the ladder asks RAID; when RAID does not answer, the strict rule decides and the run says so.

Mapped first: docs/2026-11-18-ollama-local-agent-phasemap.spec OL4a_raid_decides_fit_and_says_it.
Proof: test-plan-code-run-attention 48/48 (OL4a-1, OL4a-2). Not proved: NM1 reaching DeepSeek on his machine.
