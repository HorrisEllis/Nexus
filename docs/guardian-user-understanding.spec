spec:
  meta:
    name:        guardian-user-understanding
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-guardian-user-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Guardian understanding the user better over time.
      Uses intelligence pattern crystallisation, BDA signal tracking,
      and liminal gap detection to build a persistent model of
      how the user works, thinks, and communicates.
      Not surveillance — sovereignty. The system serves the user better
      by knowing them better. Everything stays local. Nothing leaves NEXUS.

  what_it_tracks:
    work_patterns:
      - "Which clusters the user dispatches to most (RAID history)"
      - "Time-of-day patterns — when flow states occur"
      - "Session velocity — how fast decisions are being made"
      - "Which providers produce the best outcomes for this user"
      - "Which fault classes keep recurring (friction ledger)"

    communication_patterns:
      - "BDA 5-signal baseline across sessions (valence, certainty, openness, tension, selfref)"
      - "Regime shifts — when user moves from STABLE to DYSREGULATED"
      - "Liminal gap patterns — which gap types appear in user's messages"
      - "Language when in flow vs language when pushing through difficulty"
      - "Questions that precede breakthroughs vs questions that precede blocks"

    decision_patterns:
      - "Which specs produce the most gaps (architecture weaknesses)"
      - "Which healing strategies work for this user's system"
      - "When the user overrides RAID decisions and what they choose instead"
      - "Contradiction patterns — decisions that conflict with past decisions"

  how_it_works:
    data_sources:
      - "chat-logger — every exchange, BDA-scored, embedded"
      - "intelligence layer — crystallised patterns from event stream"
      - "cortex/core/raid — routing decisions and outcome weights"
      - "cortex/self-heal/escalation — friction per fault class"
      - "lib/meta/liminal — gap scores on AI responses"
      - "lib/meta/bda — signal extraction on user messages"
      - "interstitial spaces (Phase 7) — unresolved tensions over time"

    persistence:
      table: "user_model (JAA long-tier — permanent)"
      shape: >
        {
          uuid, sessionId, ts,
          bdaBaseline: { valence, certainty, openness, tension, selfref },
          flowSignature: { timeOfDay, sessionLength, velocityRange },
          preferredClusters: { code, spec, vision, ... },
          frictionProfile: { faultClass: frictionScore },
          liminalProfile: { gapType: frequency },
          contradictionCount: number,
          lastRegime: string,
          crystallisedPatterns: string[],
        }

    update_triggers:
      - "Every session end — BDA signals averaged, baseline updated"
      - "Pattern crystallisation — new pattern added to user model"
      - "Regime shift — flagged and stored with context"
      - "RAID override — user chose different provider than RAID, stored"
      - "Friction resolution — user fixed something system couldn't"

  what_guardian_does_with_it:
    provider_selection: >
      RAID uses user's provider outcome history, not just cluster defaults.
      If this user gets better results from Claude on spec tasks despite
      the cluster defaulting to Ollama — weight shifts over time.

    context_injection: >
      Before any dispatch, chat-logger pulls semantically relevant past
      exchanges. With user model, it also pulls exchanges from similar
      regime states. If user is in DYSREGULATED regime now, surface
      exchanges from past DYSREGULATED sessions that resolved well.

    gap_anticipation: >
      If user's liminal profile shows high frequency of assumption gaps,
      guardian pre-runs the assumption gap detector on prompts before
      dispatch. Surfaces likely gaps before the AI response comes back.

    velocity_awareness: >
      If session velocity is elevated (many decisions, fast),
      guardian adds a soft flag to healer: check homeostasis before
      applying any autonomous fix. High velocity = integration risk.
      Same as what the velocity field in the interstitial spaces tracks.

    contradiction_surfacing: >
      If user's current request contradicts a crystallised decision from
      a past session, guardian surfaces it before dispatching.
      Not blocking — informing. "Three sessions ago you decided X.
      This seems to pull against that. Proceed?"

  privacy:
    all_local: "Everything stays in JAA on user's machine. Never transmitted."
    user_controlled: "User can view, edit, or clear user_model at any time."
    no_inference_leak: "User model never sent to AI providers as context."
    sovereignty: "This is the user's model of themselves, not a profile built for anyone else."

  organ_integration:
    note: "Not a new organ — wires into existing organs via event bus"
    chat_logger: "on session end → update user_model BDA baseline"
    intelligence: "on pattern.crystallised → add to user_model.crystallisedPatterns"
    raid: "on job.complete → update preferredClusters outcome weights"
    liminal: "on space.updated → update liminalProfile frequencies"
    healer: "read velocityRange before prescribing autonomous fixes"
