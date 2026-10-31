# 0.60.333 — automation finished on the backend: the browser port (AE2), the registry on the orchestrator (AE4)

James, 2026-10-31:
> "merge and finish automation and cos backend"

## Built

- **AE2, the browser port:** `clear-glass/src/automation/driver-port.js` serves `POST /automation/driver` and `/automation/macro-run` on
  Clear Glass's wire server (:7704), using what Clear Glass already had: its browser step (`_automationBrowser`) and its macro tool.
  - The orchestrator's engine (`browserFn`, `runMacroFn`) now reaches them. Before this, it called two routes nothing served.
  - With Clear Glass down, only the browser steps are named; nothing throws.
- **AE4, the registry:** `lib/automation-registry.js` sends every engine call to the orchestrator (:9000 `/automation/*`).
  - Clear Glass is now the browser driver behind it, not "the engine".
  - `describe()` names the engine.
  - The public calls and source ids are unchanged.
- **CG1:** found already built (`lib/agent-confidence-gate.js`, on main since 0.60.247, 13/13). The map is updated from that evidence.

## Proof

- `test-automation-driver-port` **3/3**, with a real page driven through `glass.js` over HTTP.
- `test-automation-registry` 11/11.
- automation-engine 16/16, automation-v2 18/18, automation-nodes 8/8, automation-settings-ui 8/8, orchestrator-automation 7/7.

## State

- **COS backend:** the supervisor, the door, the handover and the declared boot list are all done (MG15–MG17b).
- **Automation backend:** done (AE1–AE4, CG1–CG3, AU1–AU2).
- **Left, screens only:** AE5 and CG4, plus the COS UI phases.
