spec:
  meta:
    name:        spec-drift
    version:     1.1.1
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-spec-drift-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Spec drift detector. Compares version declared in each system's
      .spec file against version declared in lib/version.js.
      On mismatch: opens a gap in Cortex (spec.version.drift).
      On missing spec: opens a gap (spec.missing).
      On sync: resolves any open drift gap.
      Run on every orchestrator boot as a SOFT phase.
      §1.2: drift is never silent — it is a standing gap.

  behavior:
    on_boot: >
      Runs as SOFT phase after component and UI registry init.
      Never blocks boot. Opens gaps, logs results, continues.
    on_drift: >
      gap.type = spec.version.drift
      gap.severity = medium
      gap.resolution = specific instruction to update the spec file
      Friction accumulates if gap stays open across sessions.
    on_missing: >
      gap.type = spec.missing
      gap.severity = low
      gap.resolution = create docs/{system}.spec from foundation template
    on_sync: >
      Any previously open drift gap for this system is resolved.
      console.log ✓ system synced at vX.X.X

  metadata_cache:
    status: specified_not_built
    bug_found: >
      _specVersion()/_specName() currently readFileSync the entire .spec
      file as utf8 just to regex the first few lines for name/version —
      paid on every boot, for every .spec file, even unchanged ones.
      Will get materially worse once seam-component-registry.spec-style
      self-contained project specs (full repo archive embedded) exist —
      reading a multi-hundred-MB base64 blob into memory just to find a
      version line is pure waste.
    fix_header_only: >
      Read only the first ~4KB of any .spec file. Header always comes
      first; the checker never reads past meta.version anyway. Strict
      win regardless of caching.
    fix_cache: >
      Cache {path, mtime, name, version} in a JAA table
      (spec_meta_cache), reusing lib/nexus-config.js's existing
      mtime-compare pattern.
    fix_event_driven: >
      Invalidation is event-driven, not poll-at-boot — reuse
      orchestrator.js's existing live UI-hotswap file watchers (already
      running every boot for cortex/ui/, idearium/ui/, etc.), applied to
      docs/*.spec. Cache stays correct continuously while the system
      runs; boot-time cost drops to a cache lookup. Cold start (first
      boot after a full process restart) still needs one full scan to
      seed the cache and stand the watcher up — same as the UI watcher
      already requires.
    tiers: |
      tier 1  watcher already confirmed unchanged   → zero cost, no read, no stat
      tier 2  mtime ticked, header bytes match       → cheap re-confirm, cache stays valid
      tier 3  header bytes changed                   → re-extract, update cache
      tier 4  file appeared/disappeared              → full rescan of that one file
    significance: >
      First concrete proof-of-concept for "SNR-as-a-generic-capability"
      (seam-component-registry.spec §10, docs/raid-snr-filter.spec
      generic_capability). If spec-metadata caching fits the same
      four-tier shape as RAID's dispatch decisions, that's real evidence
      the abstraction holds outside its original use case.

  cli: "node lib/spec-drift.js — runs check, prints report, exits 1 if any drift"

  handshake:
    components:
      - id: "orchestrator.spec.drift"
        grammar: ["spec drift", "drift"]
        route: { method: GET, path: "/api/spec/drift" }
        description: "Check spec versions vs code versions, show any drift"
