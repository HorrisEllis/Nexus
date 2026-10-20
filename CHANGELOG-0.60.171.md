# 0.60.171 — 2026-10-19 — verify first: a file that already works is not rebuilt; Gemini first, briefed the way it asked

James, 2026-10-19: "need verify first, and everything else to solidify the pipeline. prioritize gemini, since clearglass doesn't break terms. need to specify the axioms, from the docs axioms 3.1. like i want gemini to code at his best." · "i want this phase issue fixed."

## What his log showed
SP5_title (one trim function) reached attempt 14. lib/title.js existed and passed; each attempt still asked for the test again (steps 2–4) and the file again, behind a 15 s gap per job, climbing gemini → chatgpt → claude → deepseek. The Phases panel lists "Gemini said tests/sp5-title.test.js" as a dependent of lib/title.js.

## Built
- **VF1 `lib/verify-first.js`** — before any agent sees a file that exists: parse, planned exports, the phase's test in COS's process sandbox. Pass → no agent (row `verified`). Fail → the agent gets exactly what failed (e.g. `not ok 1 - trims | expected: 'A' | actual: ' A '`). No test → `shallow`, never "done". Wired into the contract bricks (the default path) and the sequential path.
- **Existing test reused** only when it already proves every code file of the phase; a stub or failing test is not.
- **CB1 `lib/coder-brief.js`** — Gemini's five parts: stack and environment (read from the repo), constraints (AXIOMS v3.1 §1.2 §1.3 §0.5 §8.6 §5.3 §5.7 §12.2 §0.3 in coder terms), contract and context (planned exports, the frozen test, the file as it is, what failed), output format (one fenced block + CLAIMS), self-critique inside the same reply (no second job).
- **CB2** — gemini first among browser coders, after the learned order (`routing.prefer_coder`, `routing.prefer_over: browser|all`; local models stay first by default — his "ollama first" spine).
- **SM1 `lib/agent-self-model.js`** — each agent's intent, needs, constraints and learned counts; gemini seeded with its own answer. `interrogationPrompt()` asks an agent about a pipeline issue for root cause, its part, a fix and what it needs; answers are kept as proposals for James (§7.2), never applied by themselves.
- **RC4b** — files already written under a chat label or a cut-short name are moved to `.nexus/archive/path-guard/<stamp>/` at the start of a phase build (archived, §0.3).

## Proof
`test-verify-first` 10/10. Neighbours green: contract-phase-build 15/15, chunked-phase-build 17/17, pipeline-routing 19/19, pipeline-root-causes 6/6, repo-inject 100/100; test-first as before (TF-04 failed before this release too).

## Not proven
Not run on Windows; no real Gemini call; SP5 itself not rebuilt here — his next run is the proof (expect a `verified` row for lib/title.js and no agent job for it). RC4b runs only when test-first runs (a planner is set). The interrogation is a prompt and a store: no route or UI sends it yet (SM2).
