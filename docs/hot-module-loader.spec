spec:
  meta:
    name:        hot-module-loader
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-hot-module-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Drop a module in. It integrates automatically. No restart.
      Build anything. Same architecture every time.
      Inject: module schema + interaction contract + component map.
      System slots it in. CLI updates. Everything connects.

  required_module_shape:
    MODULE_ID:   "string — globally unique"
    VERSION:     "string — semver"
    components:  "Component[] — registers with CLI grammar"
    events:
      emits:     "string[]"
      handles:   "string[]"
    routes:      "{ method, path, description }[]"
    contract:    "path to GET /contract endpoint"
    init:        "function(cfg) → { ok }"

  integration_pipeline:
    1: "fs.watch on modules/ directory detects new file"
    2: "schema validator checks required fields"
    3: "PASS → component registry registers components[]"
    4: "event bus wires handles[]"
    5: "orchestrator proxies routes"
    6: "contract stored, health monitoring started"
    7: "CLI grammar rebuilds live"
    8: "SSE broadcast: module.loaded"
    9: "FAIL → error gap opened, module ignored, clear error"

  build_anything_model:
    description: >
      Any capability can be added to NEXUS by following the module shape.
      The system doesn't care what the module does.
      It cares that it follows the contract.
      Same architecture every time. Infinite extensibility.

  phase: 14
