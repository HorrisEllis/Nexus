# NEXUS — Integration Changelog
Applied to baseline: nexus-system__6_ (v0.4.0-pre)

## Already present in this baseline (preserved, NOT touched)
- cortex/boot.js — organ boot loop (Phase 5.4 organs.init): gap-finder, healer,
  self-heal, orion/sensor, orion/policy, raid, heartbeat
- cortex/boot.js — ALK load-on-boot (§7.6 decision-graph hydration)
- guardian/server.js — dispatch-pool (§P11 per-provider semaphore)
- cortex/boot.js — CFR tension-signal routing fix (SIGNAL_TYPES)
- admin-server.js — self-heal tension scoring

## Added this session (RAID consultation seam — was missing)
- cortex/foundation/admin-server.js
    + registerRaid(raid) method
    + GET /api/raid/decide route — serves RAID routing decisions over HTTP
- cortex/boot.js
    + registers the running raid module with adminServer in the organ loop
- guardian/server.js
    + chooseProvider() — consults RAID before dispatch, falls back if unreachable
    + wired into JSON-prompt dispatch path
    + FIX: createJob() called positionally (bug) → corrected to object form

## Added this session (the missing artifact)
- cortex/foundation/admin-server.js
    + GET /api/events — FIX: now honors ?limit= (was silently ignored, hard-capped 50)
    + GET /api/events — adds ?type= filter (was silently dropped)
    + returns {ok, rows, count, capped} — observable truncation
    (Found by adversarial harness; §1.2/§2.3 — observability endpoint must not lie.)

## Added this session (test harness — lives in-system per spec)
- cortex/test/harness.js — self-adversarial harness:
    L1 unit → L2 integration → L3 adversarial → L4 cross-domain → L5 perf
    absorbs found failures into fault_taxonomy (JAA truth), re-runs as regression

## Verified
- All edited files: node --check pass
- RAID seam, events fix, organ boot, ALK hydrate: proven live earlier in session
- Merge preserves all newer baseline work (confirmed by diff before applying)

## Added: First-Start Wizard (tutorial/)
- tutorial/wizard.js — CLI wizard for a brand-new, non-technical user.
    Walks each system in boot order. Each step: EXPLAINS in plain words →
    VERIFIES with a live probe → REPAIRS itself if red (re-probes, waits out
    boot races, gives plain next-steps if it can't auto-fix).
    Steps: welcome → orchestrator → bridge → cortex → organs(working?) →
    raid-seam(ask it to decide) → guardian → full-loop(end-to-end) → done.
    Walking it end-to-end IS the missing integration test (boot→decide→hands).
    Run:  node tutorial/wizard.js
- tutorial/server.js — same steps as a friendly clickable web page.
    Run:  node tutorial/server.js  → http://127.0.0.1:7900
- Verified: probe layer + step logic green against cortex; the organs/raid/
    events checks use the FIXED /api/events type filter.
