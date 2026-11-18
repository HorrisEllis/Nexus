# 0.60.566: the code.write gate refuses GQ1-style stubs (data only); RAID as the interface recorded; handoff

James, 2026-11-18: "Gates just need to be much smarter." · "i don't want any js created." · "that needs to be .eg using cie-eg." · "we need raid
to be the interface. uses copilot to think, which copilot is a agent agnostic hat." · "can you push and commit. then only when done. give me a
handoff."

## Changed (data, no code)
- `lib/step-gates/code.write.step_gate`: the no_placeholder phrases gain "placeholder for ", "placeholder logic", "example: always true",
  "stub until". Proof: `step-gate.check('code.write', …)` on GQ1's stub (components/nexus-core.lib.quality-stream/1.0.0/quality-stream.eg)
  refuses it: "a placeholder, not the work — line 3 says // Placeholder for quality check logic".

## Recorded (docs/2026-11-15-the-factory-phasemap.spec)
- His canvas lineage (each contract's family tree, each gate a RAID compartment, each decision a branch), progress that persists by chunks,
  the pipeline checking files already made (with the liminal space reader), the intelligence system's commands per module, Copilot's autonomous
  mode in the build loop; RAID as the interface (rewind per gate, work surface, work area, reflection, Copilot to think). Map only.
- `handoff_2026_11_18`: his rules now, the live state and settings on his PC, and the next three steps.

## Tried and reverted (his "i don't want any js created")
A JS `placeholderIn()` in lib/phase-plan.js and its call in idearium/api/index.js; an Ollama-only `planMode` branch; a test-writer start line.
