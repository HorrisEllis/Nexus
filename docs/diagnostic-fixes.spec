spec:
  meta:
    name:        diagnostic-fixes
    version:     1.0.0
    uuid:        nexus-diagnostic-fixes-v1-0000-2026-0617
    purpose: >
      Documents all boot-time and diagnostic bugs fixed in this session.
      Each fix is a named phase with root cause, file, and verification method.

  phases:
    1:
      name:    spec-drift _bus undefined
      file:    orchestrator.js
      status:  fixed
      root_cause: >
        drift.check() called with bus: _bus but the orchestrator's bus
        is named nexusBus. _bus was undefined, causing a non-fatal throw
        that logged on every boot.
      fix:     bus: _bus → bus: nexusBus

    2:
      name:    idearium contract path wrong
      file:    idearium/index.js
      status:  fixed
      root_cause: >
        contract() method used join(__dir, '../schemas/interaction-contract.json')
        where __dir = idearium/. This resolves to nexus-071/../schemas which
        doesn't exist. Boot phase 3 HARD check always failed with id=undefined.
      fix:     '../schemas/...' → 'schemas/...'

    3:
      name:    self-heal forge_failed spam
      file:    cortex/self-heal/index.js
      status:  fixed
      root_cause: >
        NEXUS_FORGE_APPLY defaults to false (audit mode). Every gap triggered
        self-heal, which immediately returned apply_disabled but logged as
        forge_failed. Gap loop saw forge_failed as a failure event, opened
        new gaps, triggering more self-heal attempts — a feedback loop
        generating 400+ forge_failed events per session.
      fix: >
        When APPLY_PATCH=false: status = 'apply_disabled' (not 'forge_failed'),
        event type = 'self-heal.apply_disabled', no escalation emitted.
        Gap loop no longer treats apply_disabled as a failure event.

    4:
      name:    architect contract.unreachable HTTP 404
      file:    architect/service.js
      status:  fixed
      root_cause: >
        Orchestrator polls /api/contract on all registered systems.
        Architect had no /api/contract route — returned 404.
        Orchestrator logged contract.unreachable on every boot.
      fix:     Added GET /api/contract route returning architect-v1 contract.

    5:
      name:    diagnostic service never started
      file:    cli/boot-systems.js
      status:  fixed
      root_cause: >
        service/nexus-diagnostic.js exists and serves :7825 but was never
        added to the boot-systems sequence. The diagnostic channel in the
        home UI always showed as SYSTEM (offline). All gap detection and
        friction scoring was silently not running.
      fix:     Added diagnostic as the last system in the boot sequence.

    6:
      name:    diagnostic service passive only
      file:    service/nexus-diagnostic.js
      status:  fixed
      root_cause: >
        The service detected problems but took no action. Gap loop spam
        accumulated without remediation. Offline systems were noted but
        not escalated. No cortex logging of remediation actions.
      fix: >
        Added remediationScan() loop (every 30s):
        - Systems offline >30s: emit HEAL_REQUESTED on nexus-bus, open gap,
          write to cortex and data/diagnostic/remediation.jsonl
        - High friction (>0.7): log with fix suggestion
        - Critical file syntax check every 5 minutes
        - Cortex gap sync: pull open gaps and broadcast untracked ones

  cortex_events:
    diagnostic.remediation:
      payload: { action, system, port, fix, offlineMs }
      written_to: data/diagnostic/remediation.jsonl + cortex :3748/api/event

  axioms:
    - §1.2 nothing silently fails — all diagnostic events logged
    - §3.1 bottom-up — diagnostic boots last (all systems must be up first)
    - forge_failed must mean forge actually failed, not apply_disabled
    - contract routes must exist on all registered systems
