# 0.59.11 — 2026-10-10

James: "okay. now. make it useful like; hooked into copilot so you can talk to nexus" … "map first, maybe use lifeline or something, or look at the atlas' and .spec. agent tools".

Map first: `docs/2026-10-10-copilot-talk-to-nexus-phasemap.spec` (TN1–TN4, TN5 deferred). It records what the map found:
- A plain question in the co-pilot pane ("what's unbuilt?") went through `bridge.send`, then `/api/prompt`'s regex intercepts, then lifeline, and reached Ollama 3B with no Nexus data. The model answered "Could you please provide more details".
- The 36 Nexus commands (`idearium/cli/route-commands.js`) each have a printer that writes a readable answer. Outside the terminal, though, callers got raw JSON.

## Talk to Nexus in plain words (TN2, TN3)

Type a question in the co-pilot pane. If its words mean a Nexus command, Nexus runs that command and answers with its text. The answer ends with the exact command, so it can be learned. No model is involved, and it works with Ollama down.

| You type | Runs |
|---|---|
| what's unbuilt? · which specs are partial · show contradicted phases · what's left · how many phases are open? | `census` with the matching filter |
| which models are loaded? | `models` |
| how's memory? · cpu usage | `perf` |
| what's been happening · what failed | `activity` (only failures, for "what failed") |
| which systems are up · is everything running? | `nerve` |
| how big is the store · what did I pick · who am i · what did ollama say · what is each window doing | `store` · `picks` · `access` · `ollama tape` · `field windows` |
| idea: <text> | `dump`: the text goes into the Void |

- The words live on each command's row (`ASK` in `route-commands.js`, attached as `row.ask`), so the table stays the one place a command is described.
- `copilot/lib/nexus-ask.js` matches a message against those words and runs the command through `nexus.command`. The person's rows are still refused there.
- It is wired in two places:
  - the pane (`clear-glass/src/copilot/bridge.js`), before any model is asked; `copilotNexusAsk: false` turns it off
  - `/api/prompt` (`copilot/server.js`), after nexus-awareness, for every other channel
- Ordinary talk still goes to the model as before. The test checks "hello", "help me with jobs", "tell me about this page", "write me a cover letter", "what is my model of james" and "visit bing.com". A message longer than 240 characters also goes to the model, except an `idea:` line.

## A command's answer as plain text (TN1)

- `renderText(row, d, a)` in `route-commands.js` runs the row's own printer with colour turned off and its output captured, so it returns what the terminal shows.
- `nexus.command` now returns that as `text`, beside the JSON `result`. The pane, a watched chat and every agent read "memory 3.1GB free of 15.8GB" instead of `{"report":{"current":…}}`. That is fewer tokens and makes more sense.
- The answer a watched chat types back (`lib/listener-commands.js` `summary()`) uses this text first.

## Fixes

- `/nexus <command>` in the pane said "unknown command /nexus", because the pane's CLI catches every `/…` line. It now passes the line on to the bridge (a 0.59.9 bug).
- The pane's `/help` names `nexus>`, `/nexus` and the plain-words questions.

## Registry, docs

- **Loom** (`loom/maps/build-surface-map.js`):
  - `copilot/lib/nexus-ask.js` is wired to `route-commands.js` and to `nexus.command`.
  - The bridge and the copilot server are recorded as its consumers.
  - `nexus.command` is recorded as a consumer of `renderText`.
- `docs/atlases/copilot-atlas.md` §2 lists the questions, and `docs/copilot.spec` has an ADDENDUM.

## Tests

- `test-nexus-ask` passes 6/6 and is new (registered in `run-all.js`):
  - the printer gives plain text and the console is restored
  - a watched chat uses that text
  - 17 phrasings reach the right command
  - 13 ordinary messages reach none
  - `answer()` sends the right request to the command tool
  - the pane answers without asking the model, and the setting turns it off
- These still pass:

| Suite | Result |
|---|---|
| `test-cg-copilot-verbs` | 9/9 |
| `test-nexus-chat` | 8/8 |
| `test-listener-commands` | 5/5 |
| `test-event-contracts` | 8/8 |
| `test-cli-route-commands` | 8/8 |
| `test-cm3-commands` | 4/4 |
| `test-nexus-command-tool` | 7/7 |
| `test-idea-dump` | 3/3 |
| `test-field-nerve` | 5/5 |
| `test-p4-awareness` | 5/5 |
| `copilot-adversarial-wire` | 6/6 |
| `copilot-handshake-dispatch` | 12/12 |
| `copilot-provider-toggle` | 20/20 |
| `test-build-surface` | 13/13 |
| `test-build-surface-2` | 3/3 |

## Deferred (TN5)

A question that names Nexus but matches no command could give the model `context-atlas` search hits as grounding. That search walks about 70 tables on every message in Clear Glass's main process, so it needs measuring first.
