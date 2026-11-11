# 0.60.491 — Idearium's heap back to 1,024 MB; the build step passes (PC8 expanded)

James, 2026-11-11, told Idearium ran out of its 512 MB heap in the build step: "Yeah what is up with that. It wasn’t like that before. It
was in idearium. Can’t you raise it"

## What was up
0.60.482 (2026-11-10) gave each core system 512 MB where it had 1,024, from what each used idle (80 to 150 MB). A build was not
measured. A build in core peaks at 538 MB. The coder's miss.

## Done
- `idearium/compartment.json`: `maxOldSpaceMB` 1024.
- COS had read the declaration when it started, so it was also set in COS's setting for Idearium
  (`PATCH /api/cos/systems/idearium/config`, recorded as his, read back 1,024). Idearium restarted through COS.

## Run 5 of the build pipeline (`855786f3`, IN0_baseline)
- ready, covered, map, dag, graph, **build** met. Idearium stayed up: heap 196, 210, 538, 398 MB of 1,216.
- Lowest free memory during the run: 7.6%.

## Walls after it, not fixed
1. **evidence** timed out at 30 s. Idearium's evidence route does not take the phase the step sends; it runs the tests of up to 10 open phases.
2. The build step is met when the build has only **started**. Nothing waits for it to end before evidence.
3. The build itself (`phrun-mwbva4td-qyv7`) ended **contract-incomplete** after 44 s: two gates of `tree-census.js` failed. Ollama's bridge
   was asleep (on demand) and Clear Glass read as degraded. Why each gate failed is not traced.

## Not done, said
- COS's manager is still not restarted (0.60.489's phase chooser is not live on his screen).
- Not yet in Versionium (§17.12): recorded at the next boot sync.
