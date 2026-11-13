# 0.60.521: the framework trial runs in COS on Ollama, with a benchmark

James, 2026-11-13: "we have ollama now. lets leverage that. test, benchmark, run the trial in the docs folder. clearglass pipelines, raid
pipelines, idearium, all of them in cos."

## Built
- **`cos/pipeline/pipelines/framework-trial.pipeline`**, in COS's own shipped folder, so the sync imports it into the Automation tab. Its
  11 steps:
  1. the trial's screen answers;
  2. P1 to P6, one problem per step, each asked both ways through Ollama;
  3. the answers blinded;
  4. **holds for his blind scores** (on the trial's screen), then goes on with Continue;
  5. arm B scored against arm A;
  6. the benchmark per model.

  Every step is an api call to a route `docs/framework-trial/server.js` already serves: no new code. `vars.model` is an installed Ollama
  model (`ollama:<name>`); `vars.run` is the run number.
- **The benchmark** (`trial.js`): each real answer writes a line to `bench.jsonl` with its wall time, Ollama's tokens and time, and
  tokens per second. `trial.js bench` sums them per model, and the screen's state carries them. `--mock` and test transports never write
  one.
- **`--problem P1,P3`**: deploy runs those problems only, so a request stays under the ~5 min one can wait.

## Found and fixed (in place)
- An Ollama model's name was the answer's file name (`ollama:qwen2.5-coder:7b-A-1.md`). Windows refuses a colon in a file name, so every
  Ollama answer would have failed to save on his PC. The name is now letters, digits and underscores.
- `blind` kept only file names of letters and digits, so an Ollama answer, even saved, would have been left out of judging without a
  word. It now reads the name from the end (`…-<arm>-<run>.md`).

## Proof
- The whole pipeline run in COS on a real manager, against a stand-in Ollama: 12 answers, blinded, held at "judged" with the reason,
  scored after Continue, results.md written, the benchmark per model. Every file it made was removed after.
- test-framework-trial-deploy 5/5. A6 added: the real Ollama transport over HTTP; one problem; a Windows-safe name; the benchmark line;
  blind keeps the answer.
- Clear Glass's pipeline routes (`GET /automation/pipelines`, `…/:id/node`) answer in the shape COS's sync reads.

## Not run
A real model: the sandbox cannot reach ollama.com. On his machine: `node docs/framework-trial/server.js`, then run "Framework trial
(Ollama)" in COS's Automation tab with his model.
