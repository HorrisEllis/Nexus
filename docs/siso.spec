spec:
  meta:
    name:     siso
    version:  1.0.0
    uuid:     nexus-siso-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      SISO — Single Input Single Output architecture.
      Created by Jonathan Bailey. The foundational coding methodology
      for all NEXUS systems. "DOM as State, Events as Transformation."
      Not a module. A pattern. The architectural spine.

  principle: >
    Every function takes one input, returns one output.
    State lives in the data structure (DOM, JAA, event log).
    Transformations are events applied to that state.
    Nothing is modified in place. Nothing has side effects outside its boundary.
    The system is deterministic: same state + same event = same next state.

  in_nexus:
    jaa_tables: >
      JAA is the SISO data structure. All state is a row in a table.
      Events are appended to event_log. State is never mutated —
      a new row is inserted or an existing row is updated via UUID.
    event_bus: >
      The nexus-bus is the SISO transformation layer.
      Events come in. Handlers produce new events or new JAA rows.
      No handler modifies shared mutable state directly.
    boot_sequence: >
      BootSequence implements SISO for the boot process.
      Each phase is a function: { state } → { state + phase_result }.
      Phases don't call each other. The sequencer does.

  files:
    - path: "siso/"
      description: "SISO pattern utilities and reference implementations"

  credit: "Jonathan Bailey — architect of SISO/Jaa architecture"
