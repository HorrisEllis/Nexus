# 0.39.350 — 2026-10-05

James: "make sure ollama is all wired into idearium."

CT4 done, and with it the whole code-tab-and-one-router map (CT1–CT4). The new view is in Settings → Models (`idearium/ui/js/ollama-check.js` over `lib/ollama-check.js`; `GET /api/ollama/check`, `POST /api/ollama/check/ask`).

- **Reach.** Whether the Ollama bridge and copilot's door were reached, and if not, why.
- **Installed models.** "ask every model" asks each one "Reply with the single word: ready". It goes through copilot's `/api/prompt` with backend ollama and the model named, which is the path every caller uses. Models are asked one at a time, because Ollama loads one model at a time. Each answer shows with its time, or its failure with the reason.
- **Every caller.** Each one shows the route copilot's door gives it: who answers first, its Ollama hops, a model that is not installed, Ollama missing from the route, or no route at all. The callers are:
  - the void, the workshop, the architect and deliver;
  - the repo agent in the copilot position, and on Ollama with no model picked;
  - the spec build (a section) and the build of a code file.
- **A probe is not a job.** These answers do not teach the door.
- **Found on the way.** The bridge's `GET /api/models` answered ok with `[defaultModel]` when Ollama's list could not be parsed. That claimed a model was installed when Ollama never said so. It now answers ok:false with the reason, and Idearium passes the reason on. Addendum in `ollama/spec/ollama.spec`. Note: `docs/ollama.spec` and `ollama/spec/ollama.spec` are two different copies of that spec. They are left as they are, not merged.
- **Tests.** `test-ollama-check` 8/8:
  - OC-01 and OC-02: the library.
  - OC-03 to OC-05: idearium's real router, a stand-in bridge on :3749 and a stand-in copilot, including the bridge down and copilot down.
  - OC-10 to OC-12: driven in Clear Glass. Models and callers listed, every model asked one at a time, a bridge not reached said.

  `test-repo-settings-ui` RS-02 now expects the Models category. Unchanged and passing: model-door, code-tab, repo-agent-provider 67/67, pipeline-routing, the contract tests.
- **Loom.** `lib/ollama-check.js` and `ollama-check.js` are mapped with their wires. Still unresolved: 112.
- **On his machine** his real models are the proof: Settings → Models → ask every model.
