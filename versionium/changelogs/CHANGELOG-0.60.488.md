# 0.60.488 — a system COS put to sleep is not a missed pulse (PR3 expanded)

James, 2026-11-10: "idearium is choking" · asked whether to fix the pulse monitor counting sleeping on-demand systems as missing: "Yes, fix it"

## What his log showed
`[orchestrator][pulse] 'versionium' missed 112 consecutive pulses` and `cfr.collapse: CFR coherence collapsed to 0.00`, from 22:43 to 23:10.
Nothing was wrong: since 0.60.482 COS stops an on-demand system when it is idle and starts it again when it is asked for.

## Built
- `orchestrator/orchestrator.js`: before the pulse watch declares a miss, it asks COS once, by COS's route
  (`GET /api/cos/systems/<id>`, through `lib/nexus-client.js`, never waking the system), whether COS stopped that system idle.
- Asleep by COS's rule: one log line (`'<id>' is asleep — COS stopped it idle and starts it when asked; not a missed pulse`), the event
  `pulse.asleep` on the bus, in that system's ledger and on the stream, `asleep: true` on its registry entry. The watch rests until the
  system's next real beat, which clears `asleep`.
- Everything else stays a miss: COS unreachable, a name COS does not run, a system COS reads as up, down or crashed, a core system.
- A beat that arrives while COS is being asked owns the watch from then on.

## Proof
The function, run from the file against stand-in answers and the live COS, 9/9:
on-demand idle → asleep · on-demand idling → asleep · on-demand up (hung) → miss · on-demand down (crashed) → miss · core system idle → miss ·
COS down → miss · COS does not run it (404) → miss · live COS, Versionium up → miss · live COS, nexus-wire → miss.
`node --check orchestrator/orchestrator.js` passes.

## Not done, said
- Not yet seen on a real idle stop. It needs the Orchestrator restarted, then Versionium left idle for 10 minutes: the log should carry one
  "is asleep" line and no "missed N consecutive pulses" lines for it.
- No test file was added (orchestrator.js is a server with no exports; no new JavaScript, his rule). The check above is the record.
- The diagnostic's own watch ("missed its heartbeat") and the watchdog's OFFLINE line still fire for a sleeping system.
- A system a person stopped in COS still reads as missing. Whether that is a fault is his to say.
- This release is not yet in Versionium: it is recorded at the next boot sync on his machine (§17.12).
