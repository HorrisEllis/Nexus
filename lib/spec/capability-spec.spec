# lib/spec/capability-spec.spec — the first capability spec: CS1 specs itself (0.60.49).
spec:
  meta:
    name: capability-spec
    version: 1.0.0
    kind: capability
    files: [lib/capability-spec.js, lib/checks/ck-254-surface.js]
  purpose: "A spec per capability whose surface is the gate: what a module lets others touch (exports, events, routes) is stated here and checked against the code, so it widens only when someone decides it should."
  origin: "James (2026-10-15): \"should we have each module or capability specced. … like specs can reduce surface area, then the phases also. like i want the specs to be like new features or capabilities to the project.\""
  surface:
    exports: [ID, KINDS, MODULE_ID, VERSION, check, draft, find, measure, parse, run, stripComments]   # stripComments: added 0.60.49, caught by CK-254 itself
    events: []
    routes: []
  invariants:
    - "read-only: measuring and checking change no file"
    - "deterministic: no model, no network"
    - "nothing invented: a drafted spec's surface is exactly the measured one"
  checks: [CK-254]
