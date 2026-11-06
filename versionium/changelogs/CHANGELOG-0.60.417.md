# CHANGELOG 0.60.417 — CE2b: updates restart COS, asked, once the writing is done

James, 2026-11-06: "updates need to restart cos."

Asked what should restart, and what happens to Clear Glass (restarting COS's manager stops every system it runs, and his CE2 rule is that
Clear Glass is never restarted under him). His answers: "the applicable system or module. as long as its done writting." · on Clear Glass:
"Ask me first".

**Readings, to confirm (his):**
- "done writing" is read as the update's own writes: its process has ended (git and npm install done) and git's `index.lock` is gone.
- "system or module" is read as the system whose folder changed, as CE2 already does, and COS itself when `cos/` or `lib/` changed.
- Restarting one module inside a running system (a hot reload) is not built.

## Before
An update that changed COS's code only said "the next start of COS loads it". Clear Glass only "waits for you".

## Mapped first
- CE2b, expanded from CE2 in `docs/2026-11-02-cos-enterprise-phasemap.spec`. Its files are named, its graph has 0 crossings, and the DAG is
  clean.
- It depends on CA4, the service actually built in 0.60.389. CE5, an older open copy of that work, is left for the phase cleaning he
  scheduled himself.

## Built
- **After the writing** (`cos/manager/updates.js`): after an update or a roll back, `settled()` checks the writing is done before anything
  restarts. Each changed system then restarts by itself. If git is still writing, nothing restarts, the reason is said, and each system asks
  instead.
- **Asked, never done under him:** COS itself, and Clear Glass.
  - Asking for COS names what closes with it (Clear Glass, when this COS runs it).
  - Each ask is kept as `pending`, which `GET /api/cos/update` returns, until he answers or a later update replaces it.
  - The asks show on the Updates page and the update card, and in the bell as one notice.
- **His yes:** `POST /api/cos/update/restart { by: person, what: cos | <system> }`.
  - Refused while an update still writes (409); an agent is refused (403).
  - `cos restart cos` on the command line (person-only).
  - The Updates page and the update card each have Restart now and Later. The card asks twice for COS.
- **COS restarting itself:**
  - Its systems are stopped first.
  - Started by autopilot (the Windows service and the COS app both run `lib/nexus/autopilot.js`): it exits with 75, and autopilot starts it
    again and boots its systems, under the same pid NSSM and the COS app already track.
  - Started by hand: `cos/manager/relaunch.js` waits for it to end and its port to free, then starts the same command with `--boot`.

## Found on the way
- The exit-75 timer was `unref`'d. Once the servers closed, Node ended the process with 0 before the timer fired, so autopilot saw a normal
  stop and never restarted the manager. Fixed. CU-11 fails with the bug put back.

## Proof
- `tests/modules/test-cos-updates.test.js`, **12/12**:
  - CU-08: after an update, the changed systems restart, and COS and Clear Glass are asked, never restarted;
  - CU-09: `index.lock` holds the restarts, and a restart while an update runs is refused;
  - CU-10: his yes, the route, the contract and the command;
  - CU-11: the real manager on a fixture tree restarts both ways and comes back on its port (by hand through relaunch with `--boot`; under
    autopilot through exit 75, autopilot's own pid unchanged);
  - CU-12: the Updates page driven in Clear Glass;
  - CU-03 and CU-07 extended for the asks.
- The neighbouring suites (autopilot, COS app, contract, notices, commands) were run against a clean worktree of main: no new failure.
- **Not run:** on his Windows machine, under NSSM and the COS exe.
