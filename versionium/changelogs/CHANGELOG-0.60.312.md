# 0.60.312 — Diagnostic takes care of what a system needs

James, 2026-10-30, after the coder told him to run `ollama pull nomic-embed-text` himself:
> "diagnostic system should be taking care of things like this."

He's right, and the coder's advice was the wrong pattern: handing a machine's job to a person.

## Census
Three places knew the embedding model was missing, and none owned the fix:
- `lib/vector-memory.js` logs the missing model.
- An opt-in automation (`ollama-models`) only sends a notification.
- The Ollama bridge refuses to use an unpulled model, but has no route to pull one.

Diagnostic's remediation loop knows only one kind of problem: "a system is offline".

## Spec and map
`diagnostic/spec/requirements.spec` and `docs/2026-10-30-diagnostic-requirements-phasemap.spec`.

**Decisions:**
- **DR_D0, his:** Diagnostic takes care of it.
- **DR_D1, by the axioms:** Diagnostic detects, and the owner fixes it through RAID (§5.15, §5.2, §12.6).
- **DR_D2, by the axioms:** each system declares its needs in its own `compartment.json` (§5.15 rule 2, §0.1). Reading those declarations is observation, which is unrestricted; every fix goes through the owner.
- **DR_D3, by the axioms:** downloads and installs ask first, under an off/ask/auto policy per kind that he can change (USER_AUTONOMY, §4.3, §5.6).

**Phases:**
- **DR1:** systems declare `requires[]`.
- **DR2:** Diagnostic checks them, at boot and on a cadence.
- **DR3:** the Ollama bridge can pull a model by route.
- **DR4:** fixes run under the policy, and are rechecked before the gap closes. Semantic memory leaves its fallback without a restart.
- **DR5:** rows for agents, and a Fix button in the cockpit.

## Proof
- `test-substrate-spec` 3/3.
- The DAG has no dangling references and no cycles.
- No new crossings: all of them already exist and are known.

Spec and map only. Nothing is built.
