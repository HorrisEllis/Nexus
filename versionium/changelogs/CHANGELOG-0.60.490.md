# 0.60.490 — the build pipeline run whole, four times; a build says its heap at each stage (PC8 expanded)

James, 2026-11-10: "your supposed to be getting the pipeline working" · 2026-11-11, asked whether to run the whole build pipeline on
IN0_baseline: "Yes, run it"

## The runs (through COS, `POST /api/cos/automation/pipelines/<id>/run`, phase IN0_baseline)
| Run | ready · covered · map · dag · graph | build |
|---|---|---|
| 1 `c1162190` | met, 10 s | refused, 409: "nexus/core has no repo yet — sync the nexus repo first" |
| 2 `259f2faa` | met | connection dropped after 22.7 s: Idearium out of heap |
| 3 `29c5bf85` | met | the same, 23.4 s, on a fresh Idearium |
| 4 `7f4d4ea9` | met | the same, 28.4 s, with the heap said at each stage |

## Wall 1: no system repo existed
The background sync of Nexus's own repos has waited since boot. `lib/prevention.js` holds heavy work until 30% of memory is free after a
critical reading; his machine (7.7 GB) sat at 10 to 12%. Core was synced alone by Idearium's route: 156 s, 5,365 files, `/health`
slowest 6.6 s, lowest free memory 10.5%. The other 16 systems are still unsynced.

## Wall 2: the build does not fit in Idearium's heap
Idearium ended with exit 134, "Reached heap limit", at the 512 MB set in 0.60.482, three times.
New: `_heapNote` (idearium/api/index.js) says the heap at each stage of a build. Run 4:
- asked: 195 MB
- before the snapshot: 210 MB
- after the snapshot and the repair: 402 MB
- before the agent starts: 407 MB
- out of heap 4 s later

## Not done, said
- Wall 2 is not fixed. Two ways, his to choose: a larger heap for Idearium, or the build made to fit.
- The evidence and ledger steps were never reached.
- The pipeline has no step that syncs the owning system's repo before the build.
- Idearium was ended by the heap limit three times in this session and restarted by COS each time.
- COS's manager is still not restarted, so 0.60.489's fix for the phase chooser is not live on his screen.
- Not yet in Versionium (§17.12): recorded at the next boot sync.
