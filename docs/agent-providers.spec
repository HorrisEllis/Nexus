spec:
  meta:
    name:     agent-providers
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.267
    uuid:     nexus-lib-agent-providers-v1-0000-2026-0927-jamesbrooks-001
    file:     lib/agent-providers.js
    status:   built — proven by tests/modules/test-agent-hat-agnostic.test.js (H-001..H-007, H-009)
    phasemap: docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (H2, H3)
  purpose: >-
    Who can wear a hat — one list, one resolver. Replaces four disagreeing lists (agent-suite, the Idearium UI,
    WARP's cascade, repo-agent).
  contract:
    all: "() -> ['copilot', 'ollama', ...guardianProviders()]"
    guardianProviders: >-
      () -> every guardian/userscript-<name>.js on disk except memory and nexus-wake, sorted.
    normalize: "(name) -> lower-cased; mistral -> ollama, auto / co-pilot -> copilot"
    isKnown / isGuardian / backendOf: "(name) -> boolean / boolean / 'copilot' | 'ollama' | 'guardian' | null"
    resolveCopilot: >-
      () -> GET COPILOT_URL/api/prompt/resolve -> { ok, provider, backend } | { ok:false, error }.
    resolve: "(name) -> a concrete provider ('ollama' or a guardian agent); copilot is asked, never guessed"
  invariants:
    I1: an unreachable copilot resolves to an error — nothing is sent (never a silent default).
    I2: an unknown name is refused by name, never redirected.
  env:
    COPILOT_URL: copilot base (default http://127.0.0.1:3750)
