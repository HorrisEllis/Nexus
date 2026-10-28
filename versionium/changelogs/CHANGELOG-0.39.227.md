# NEXUS 0.39.227 — Clear Glass takes in guardian's claimed jobs; Settings split one file (JS + CSS) per area

**Date:** 2026-09-23 · **Author:** James Brooks · clear-glass 3.10.0 → 3.11.0 · guardian 3.7.0 → 3.8.0

James: *"Do it. 1 then 2."* — (1) Clear Glass adds guardian's `.job` jobs to its job-queue intake; (2) UI aspects in separate files, including a CSS file per UI file.

## 1. Job intake — decided: push-with-claim (not a directory watch)
- **guardian owns the decision, on disk.** The dispatch ladder calls `claim(job)` before any mesh send; `server.js` writes `transport: mesh, claimedBy: clear-glass, status: dispatched` to the `.job` as a **required** write (`updateJob(id, patch, { required })` — opt-in used only here; status updates stay non-fatal). Failed claim → nothing sent → NCP with `mesh_claim_failed`. NCP fallback clears `claimedBy`.
- **Clear Glass's intake** (`clear-glass/src/jobs/intake.js`) accepts a job only after reading it back through guardian's `GET /jobs?id=` and finding the claim. Refusals (unclaimed, unknown, finished, provider mismatch, guardian unreachable) return `intake_refused`, `sent: false`.
- Writes its own `<jobId>.intake` **before** queueing; idempotent by jobId; after a Clear Glass restart unfinished jobs report `clear_glass_restarted`, `sent: null` (never resent — the ladder's existing rule).
- `/agent-mesh/send` + `/agent-mesh/job` now go through it; new `GET /agent-mesh/intake`.
- **Why not a watch:** only guardian reads its `.job` files (node-ownership rule), and the folder also holds NCP-owned jobs — a watcher would deliver those twice.

## 2. Settings: one JS + one CSS file per area
- 7 combined section files → 14 (`accounts, providers, fingerprint, mesh, automation, macros, eros, suite, general, autofill, privacy, connections, copilot, diagnostics`), each registering exactly one area.
- 14 area stylesheets, every rule scoped to `body[data-area="<area>"]`; `core.js` sets the attribute and loads the area's CSS once, when first shown. `settings.css` keeps tokens, frame and shared components only.

## Records
- Registry 94 → 97 (`mesh.jobSend`, `mesh.jobStatus` — real since 2026-09-19, never registered — and `mesh.jobIntake`); contract regenerated; both specs, both atlases, loom map (HTTP edges), handoff updated.

## Tests
- NEW `test-cg-job-intake` 12/12 — real guardian job store, real ladder, real mesh-client, real HTTP on both sides (fake DOM tab only). Mutations: claim check removed → 2 fail; ladder never claims → 3; recover no-op → 1.
- NEW `test-cg-settings-ui-files` 6/6 — an unscoped rule added to an area file is caught.
- Regression: job-persistence 15/15 (one source check re-pointed at the new `updateJob` signature, intent unchanged), dispatch-ladder 18, job-correlation 102, record-discipline 9, version-sync 30, accounts-portal-settings 38, mesh-guardian-coverage 7. Headless render of Settings with split CSS checked.

## Not verified / open
- Live: guardian → Clear Glass → provider tab with both apps running.
- UI file rule for the main chrome (`renderer/browser.js` monolith) — not started.
