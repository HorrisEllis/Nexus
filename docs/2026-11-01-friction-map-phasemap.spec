# docs/2026-11-01-friction-map-phasemap.spec — the friction and tension map between functions and primitives. Spec: docs/friction-map.spec.
# The idea is James's; the cut and the order are the coder's.

origin: >-
  James, 2026-11-01: "cfr and rfr2 for friction also looms friction and tension which was supposed to be the intelligence system. to map
  compatability between primitives. the traversal. nexus is supposed to, when asked" · "the friction and tension mapping, between functions
  and primitives."

readings_to_confirm:
  - "\"nexus is supposed to, when asked\": his sentence ended there. The coder's reading: when asked to build something (or what fits a need), Nexus walks this map and offers the functions that already play the needed primitives with the least friction (FT4), before anything new is written. To confirm."
  - "\"primitives\": his eight (input, event, gate, process, delta, state, sigma, output), placed per function from what its code shows (FT1). To confirm."

decisions:
  FT_D0_the_map_is_intelligences:
    status: DECIDED 2026-11-01 (by his axioms and his word: "move that to the intelligence system" — CI6)
    chosen: "The map lives in intelligence/ (friction and tension mean one thing, there); Loom keeps components and wires, code intelligence keeps functions; every source through its route."
    by: "his, 2026-11-01; §10.3, §5.9"

phases:
  FT1_functions_placed:
    status: OPEN
    depends_on: [FT_D0_the_map_is_intelligences]   # his eight primitives: docs/emerge-primitives.spec EP_D0 (a spec, not a map: named here, not a DAG edge)
    spec: docs/friction-map.spec
    blocks: [MOD-FT-ROLES]
    files: [intelligence/friction-map/roles.js, tests/modules/test-friction-map-roles.test.js]
    interface: [cli]
    does: "every function placed against his eight primitives, from its code, each role with its lines; unplaced said"
    proof: "MOD-FT-ROLES' acceptance"
  FT2_joints_measured:
    status: OPEN
    depends_on: [FT1_functions_placed, CI6_friction_and_tension_home]
    spec: docs/friction-map.spec
    blocks: [MOD-FT-JOINTS]
    files: [intelligence/friction-map/joints.js, tests/modules/test-friction-map-joints.test.js]
    interface: [cli]
    does: "function-to-function and function-to-primitive joints, with friction from fault records, shapes and crossings"
    proof: "MOD-FT-JOINTS' acceptance"
  FT3_tension_measured:
    status: OPEN
    depends_on: [FT2_joints_measured]
    spec: docs/friction-map.spec
    blocks: [MOD-FT-TENSION]
    files: [intelligence/friction-map/tension.js, tests/modules/test-friction-map-tension.test.js]
    interface: [cli]
    does: "tension per joint from open gaps, RFR2 traces, Versionium churn and Loom fan-in, each part sourced"
    proof: "MOD-FT-TENSION's acceptance"
  FT4_what_fits:
    status: OPEN
    depends_on: [FT2_joints_measured, FT3_tension_measured, TV1_traversal_primitive]
    spec: docs/friction-map.spec
    blocks: [MOD-FT-FIT]
    files: [intelligence/friction-map/fit.js, lib/core/traverse.js, tests/modules/test-friction-map-fit.test.js]
    interface: [route]
    does: "asked a chain of primitives, the traversal offers the functions that fit, least friction first; a step nothing plays is a named gap"
    proof: "MOD-FT-FIT's acceptance"
  FT5_asked_and_seen:
    status: OPEN
    depends_on: [FT4_what_fits, TV3_the_emergence_channel]
    spec: docs/friction-map.spec
    blocks: [MOD-FT-DOOR]
    files: [intelligence/routes.js, intelligence/registry-components.js, idearium/cli/route-commands.js, lib/ui/tv-shell/channels/emergence/emergence.js, tests/modules/test-friction-map-door.test.js]
    interface: [route, cli, html]
    does: "routes, command rows, the map on the Emergence channel and COS page, and the offers handed to Idearium's build before a phase writes code"
    proof: "MOD-FT-DOOR's acceptance, in Clear Glass"

build_order: "FT1 → FT2 → FT3 → FT4 (needs TV1, the traversal, built first) → FT5. It feeds the arena: OP3's candidates start from FT4's offers, OP9's lessons are friction falling."
