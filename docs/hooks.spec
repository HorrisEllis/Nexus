spec:
  meta:
    name:     hooks
    version:  1.0.0
    uuid:     nexus-hooks-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      The NEXUS hook system. Seams where behavior can be injected
      without modifying core modules. Every hook has a name,
      typed contract, and behavioral guarantee.
      Registered via Architect. Enforced via BootSequence.

  model: >
    A hook is a named extension point in a module.
    The module defines the hook: "at this point, call any registered handler."
    External code registers a handler without touching the module.
    This is how NEXUS stays modular — new behavior is hooks, not patches.

  hook_shape:
    fields:
      - name:        "string — globally unique"
      - on:          "enum — before | after | instead | error"
      - target:      "module.function being hooked"
      - signature:   "function signature the handler must match"
      - contract:    "behavioral guarantee — what the handler must preserve"
      - registeredBy: "which system registered this hook"

  examples:
    - name: "seam.before_dispatch"
      on: before
      target: "guardian.dispatch"
      description: "Called before every SEAM chunk is dispatched to Ollama"
      use_case: "Inject context, transform prompt, add metadata"

    - name: "heal.before_apply"
      on: before
      target: "cortex.self-heal.apply"
      description: "Called before any autonomous code change is applied"
      use_case: "Additional validation, snapshot trigger, human notification"

    - name: "memory.on_write"
      on: after
      target: "cortex.jaa.insert"
      description: "Called after every JAA write to embeddable tables"
      use_case: "Vector embedding trigger (already implemented as onJaaInsert)"

  files:
    - path: "hooks/"
      description: "Hook registry and default hook implementations"
