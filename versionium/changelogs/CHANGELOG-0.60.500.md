# 0.60.500 — Guardian reaches the agent mesh where it listens (P7)

James, 2026-11-12: "this is meant to be an autonomous system at somepoint. using copilot as the interface." Then, offered mesh-first
(Guardian's ladder finds the reply selector itself instead of asking him to pick it): "Yes, mesh-first"

## Done
- Guardian's option `routing.transport` set from `ncp-only` to `mesh-first` (stored in `guardian/data/options.json`, not committed).
  The default in `guardian/options.js` stays `ncp-only`. Map decision D1 recorded as his.

## Found by the first live smoke
Job `fe91f820` (2026-11-13 01:46 UTC, a short prompt to ChatGPT) still went through the page script and ended "pick the reply".
- Guardian's mesh client called Clear Glass on 7702 (the IPC bridge). 7702 answers 404 to every `/agent-mesh/*` route; they are served
  by Clear Glass's wire server on 7704. So the ladder always fell back.
- Clear Glass compared `/agent-mesh/job` with the whole URL, so `GET /agent-mesh/job?jobId=…` never matched. Guardian's wait would have
  polled a 404 until its deadline (an hour or more).

## Built
- `guardian/lib/mesh-client.js`: defaults to 7704; `CLEARGL_MESH_PORT` overrides.
- `clear-glass/src/main/index.js`: the job route is matched on its path.

## Proof
`tests/modules/test-guardian-mesh-client.js` P7-01, P7-02. The file is 15 of 16: DSP-003 failed before this release too (it looks for a
timeout that moved into `guardian/options.js`).

## Not done, said
- **Not live.** Guardian was restarted on the fix. Clear Glass was not (his rule: ask first), so a mesh job's result cannot be read yet.
- The ladder's fallback reason is overwritten on the second dispatch (`loop_guard`, empty trail), so the first reason was lost. Not fixed.
- Memory was at 7% free at boot; COS held Clear Glass back and proposed stopping Idearium.
- In Versionium (§17.12): vtm-5ee9f019.
