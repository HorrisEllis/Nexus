spec:
  meta:
    name:        self-heal
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-self-heal-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      5-level escalation ladder wired to the healer organ and escalation engine. Subscribes to HEAL_REQUESTED. Runs level 0 (known fix) → level 1 (safe fix) → level 2 (snapshot+forge) → level 3 (deep scan) → level 4 (failure mode). Friction tracked per fault class.

