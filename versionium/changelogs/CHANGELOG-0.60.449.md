# 0.60.449 — AE6 slice a: COS runs the automation engine

James, 2026-11-08: "Automation needs done, orchastrator as the engine, which need to be cos now." · 2026-11-06: "Have cos be the orchastrator
complelelt."

- **COS owns the engine.** `orchestrator/automation/index.js` moved (git mv) to `cos/manager/automation-door.js`.
  - COS's manager serves its door at `/api/cos/automation/*`: workflows, log, scripts, catalogue, templates, active runs, pipelines, webhooks.
  - It streams the engine's run events on `/api/cos/events`.
  - Agent steps still go RAID → Guardian, and browser steps to Clear Glass's driver, each by route.
- **The orchestrator stops running an engine.** Its `/automation/*` forwards to COS by route, so no saved page or caller breaks. When COS is
  down, it says so with a 503.
- **The hub:** a new `engine` slot, COS's own, answered in process. The route is in COS's contract.
- **Nothing lost:** the engine's store keeps its namespace, so every workflow written before the move is still there.
- **His two answers, recorded on AE6:**
  - "Named slots first."
  - RAID "should probably move to cos". The coder agrees by the axioms: RAID's engine and ledgers move to COS in their own phase, and Cortex keeps
    memory.
- **Fixed:** the distilled root CLAUDE.md had lost the exact law sentence that the registry ratchet (RS-01) checks for. It is restored.
- **Proof:**
  - test-cos-hub HB-05 (new): 5/5;
  - test-orchestrator-automation: 7/7;
  - test-automation-driver-port: 3/3;
  - system-boundary 10/10, sovereign-systems 10/10, boundary-code-only 5/5.
- **Still failing, not caused by this release:** RS-01, because two Loom maps grew on main.
- **Next, slice b:** the engine starts with COS; Clear Glass stops running its own copy; `lib/automation/` moves into `cos/automation/`.
