# NEXUS 0.39.253 — Idearium's agent backend is a three-way switch; Ollama's models are a dropdown

**Date:** 2026-09-25 · idearium 4.5.0 → 4.6.0 · copilot 3.5.1 → 3.5.2 · Versionium `vtm-8b55aba2` (parent `vtm-7a5e6093`, 0.39.252)

James: *"i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv ui. that way it doesn't use check box. also have ollamas models to choose from in a drop down menu for the agent tab."*

## Mapped
- **The TV shell's switch.** `#cp-backend-toggle` has three buttons (ollama · copilot · guardian), and shows a dropdown only when guardian needs an agent picked.
- **Idearium's checkbox could express only two of three states.** The compartment setting already had three: `ollama`, `auto`, and a guardian agent. The guardian on/off checkbox and its agent dropdown, in Settings → Agents, could not show `auto` — which is exactly what the TV's copilot button sends.
- **The model was dropped on the way to Ollama.** Copilot's Ollama call already accepted a model, but `/api/prompt`'s Ollama branch dropped `body.model`, so no caller could choose one.

## Changed
- **The switch.** The Agent tab's CLI and Settings → Agents render one control: ollama · copilot · guardian. The dropdown shows only where there is a choice:
  - **guardian:** its agents.
  - **ollama:** Ollama's installed models, plus "default (<bridge default>)". A stored model that is no longer installed is labelled so, and an unreachable bridge is stated rather than guessed.
  - Settings that fail to load show "backend unknown", never a guessed position.
- **`lib/repo-agent.js`:**
  - `backendOf` and `settingsView.backend` give the switch position; copilot = `auto`.
  - The per-compartment `ollamaModel` is refused if the model is not installed, or if the installed list cannot be read.
  - It is sent as `model` on Ollama dispatches only. When unset, nothing is sent, as before.
- **idearium API:**
  - `GET /api/ollama/models` goes through nexus-client to the bridge's `/api/models`. When Ollama is unreachable it answers 502 with the reason.
  - `POST /agent/settings` accepts `ollamaModel`.
  - Both are in the registry and contract.
- **CLI:** `/model [name|default]`. On its own it lists the installed models and marks this compartment's.
- **Copilot 3.5.2:** `/api/prompt` passes `body.model` to Ollama and returns `model_used`.

## Tests
- `test-repo-agent-provider` 60/60, 18 cases new or rewritten:
  - the switch positions;
  - model validation;
  - the real dispatch sending the chosen model, no model on default, and never one on a guardian job;
  - the model list against a stub bridge on :3749, and with no bridge;
  - the checkbox is gone;
  - copilot passes the model.
- `version-sync` 30, `record-discipline` 9.
- The tree was diffed against 0.39.252 after the tests; no test wrote any data.

## Not done
- **A Chromium click-through of the switch** was not run. The page finds its API through `API_CANDIDATES` + `/health`, so a probe must serve the idearium UI and fake those routes.
- **`copilot/spec/copilot.spec` is still not valid YAML.** This is pre-existing (line 89).
