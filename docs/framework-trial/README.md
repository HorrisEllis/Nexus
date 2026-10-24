# Framework trial — does James Brooks's method improve answers across AI systems?

James, 2026-10-24: "This is agnostic. The framework" · "Couldn't you also try it?" · "I could use you, Gemini and ChatGPT"

His method (docs/innovation-toolkit.framework) is shown to be *used*, continuously, from February to October; whether it *improves
results* has no before/after yet. This trial is one: the same problems, asked of three AI systems, with and without the method, judged
blind. It tests the method as a way of directing AI reasoning. It does not test it on people; that needs a person (his mentor, a client).

## Design (fixed before any run)
- **Problems:** six, in `problems.json`, across domains: three with a known answer from Nexus's own record (P1 a failing test, P2 a
  wrong-path bug, P3 a false requirement), a plan (P4), an invention (P5) and a people decision (P6). Each has a rubric (levels 0–3:
  none, minimal, optimal, exceptional, his N5 tiers) and five or six yes/no checks. P1–P3 also have the true answer (`key`).
- **Arms:** `arms.json`. A, baseline ("think carefully, check your work…"); B, his method in eight steps. Matched in length (14% apart)
  so a longer prompt is not what is tested.
- **Models:** Claude, ChatGPT, Gemini. **Every run is a fresh chat** with no memory: a fresh chat doesn't know the method, so arm A is
  a clean baseline.
- **Runs:** each problem × arm × model, twice (answers vary between runs) — 72 answers. One run each (36) is enough for a first look.
- **Judging:** blind. Answers are renamed to random codes and shuffled; the judge sees only the answer and the rubric. Where an answer's
  wording gives its arm away ("end-state", "wall or obstacle"), it is listed in `blind/LEAKS.md`. Ideally James and one other judge
  (another model, or a person) score independently.

## Steps
```
node docs/framework-trial/trial.js prompts     # prompts/P1-A.txt … P6-B.txt
#   paste each into a FRESH chat; save the reply as answers/<P>/<model>-<A|B>-<run>.md   (model: claude | chatgpt | gemini)
node docs/framework-trial/trial.js blind       # blind/<P>/<code>.md + key.json (don't open the key)
node docs/framework-trial/trial.js sheet       # scores.csv: fill level (0-3) and c1..c6 (1/0) per row, from problems.json
node docs/framework-trial/trial.js score       # results.md: B vs A, overall, per model, per problem
```
Through Nexus: sending the prompts through Guardian's agents (ChatGPT and Gemini tabs) puts every prompt and reply in the chat ledger,
dated — checkable provenance for the result.

## What it can and cannot show
- **Can:** whether his method raises the rubric level and the checks met, and whether that holds across three models and six problems.
  Per his own criterion (N7): "Continuity is proof of concept not a one off" — a difference counts only if it repeats.
- **Cannot:** that it works for people; that the rubric is neutral (it was written by the coder, who knows the method — a second judge
  and the known-answer problems P1–P3 limit that); significance for small effects (72 answers show a clear effect, not a subtle one).
- **Claude's arm in this repository** is run by Claude Code subagents, which load this repo's CLAUDE.md (his rules: map first,
  evidence, failure modes). That leaks part of his method into Claude's baseline and would *shrink* any difference. A fresh chat at
  claude.ai is the clean Claude run; the subagent runs are named `claudecode` (answers/<P>/claudecode-<arm>-<run>.md) to keep them apart.
