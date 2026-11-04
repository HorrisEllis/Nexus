# 0.60.326 — every system declares its own process (MG15a, the orchestration's first step)

James, 2026-10-31:
> "lets do the orchastration. that needs to be done completely."

COS's supervisor (MG15b, next) reads only what each system declares about itself (MG-002). Until now the boot plan lived in one list
inside autopilot (`lib/nexus/autopilot.js` ALL_KERNELS), and three of the processes it boots had no compartment.json at all: orchestrator,
architect and intelligence's consumer.

## Built

- **`lib/system-registry.js` `kernels()`:** autopilot's boot list with every field.
- **`lib/cli/compartments.js` writes the whole process into each system's own compartment.json:**
  - the fields: `runtime.process` holds cmd, args, cwd, env, phase, critical, optional, onDemand, healthUrl, heap cap, minRestartDelay and
    haltPctOverride;
  - a second process the system runs goes in `runtime.processes`: intelligence's consumer is declared by intelligence;
  - orchestrator, architect and diagnostic now have declarations. Diagnostic's older archetype file keeps its seven fields (§0.3);
  - nothing of one machine is written. Paths are `{{root}}/…`, and Electron is found the way autopilot finds it.
- **`declarations(root)`:** reads them back, for the supervisor.

## Proof

- `tests/modules/test-compartment-declarations.test.js` **4/4**:
  - all 13 processes are declared, each by the system whose folder holds its entry;
  - each declaration equals autopilot's entry field for field;
  - no absolute path appears in a committed file;
  - a second build changes nothing.
- The tests that read compartment.json pass: system-shape, system-registry, sovereign-systems, system-template, system-tunnel and genesis.

Nothing starts differently yet. Autopilot still boots everything until MG15b and MG17.
