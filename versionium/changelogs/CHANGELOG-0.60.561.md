# 0.60.561: the phase chosen carries its phasemap

James, 2026-11-17: "finish it. need nexus building itself"

## Found (his N1 run, 11ac8139, through COS's Idearium build pipeline)
- ready, covered and map met; **dag** failed: `GET …/phases/dag?phase=N1: timed out` at the step's default 30 s. Idearium had just been
  restarted (0.60.560 loaded) and its census is ~17 s cold on his machine.
- Asked again warm (2 s), the route answered **"no phase N1 in this repo's DAG"**. `N1` is a phase in two phasemaps:
  `2026-09-26-cos-testenv-vm-and-nexus-atlas` and `2026-09-26-guardian-retry-novelty-and-installs`. The run form (0.60.558) sends the
  bare id; with the map (`&map=…`) the same route answers its slice.
- Every Idearium route the pipeline calls already takes a map (dag `?map=`, graph `?map=`, build `{ map }`, evidence `{ map }`); the
  pipeline passed none.

## Fixed
- `cos/ui/automation/engine.js`: each phase in the run form's list carries its map; Run sends it as `vars.map`. The form never shows a
  box to type the map (his 2026-11-17 rule: the phase is chosen, never typed).
- `idearium/pipelines/idearium-build.pipeline`: a `map` var, passed to dag, graph, build, landed and evidence. ready, map, dag and graph
  wait 120 s (a cold Idearium; `ready` also timed out at 30 s in run 473c61df).
- `lib/flight-data.js` `latestBuild(flights, phase, map)`: landed takes the build of that phasemap when one is named.

## Proof
test-cos-console CC-12 (the form carries and sends the map; the pipeline passes it), test-flight-data FD-10 (a named map picks its build).
COS reads the pipeline from Idearium at its next sync (0.60.517); a live run of N1 is the proof that it builds.
