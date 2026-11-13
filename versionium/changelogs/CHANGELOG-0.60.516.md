# 0.60.516: the orchestrator's page no longer opens at boot

James, 2026-11-13: "no need to open 127.0.0.1:9000 on boot"

## Changed
- `orchestrator/orchestrator.config.json`: `openUIOnBoot` true → **false**. The switch already existed: the orchestrator's boot
  phase `nexus.ui.open` returns when it is false, so neither Clear Glass (:7704/open, agent `nexus-home`) nor the system browser
  is asked to open http://127.0.0.1:9000. The page still answers at :9000 when opened by hand. COS's cockpit is the screen.
- Part of SW5g (the orchestrator's pages; docs/2026-11-13-sovereign-and-wired-phasemap.spec).

## Proof
Read from the code: orchestrator.js `if (cfg.openUIOnBoot === false) return;` before any open. No test referenced the key.
Takes effect at the orchestrator's next start on his PC.
