spec:
  meta:
    name:     activity-recall
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.267
    uuid:     nexus-copilot-activity-recall-v1-0000-2026-0927-jamesbrooks-001
    file:     copilot/lib/activity-recall.js
    status:   built — proven by tests/modules/test-agent-hat-agnostic.test.js (H-011) and a live-log seeded run
    phasemap: docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec (H1)
  purpose: >-
    Copilot answers "what have you been up to?" from what it records, not from a model.
  contract:
    matches: >-
      (prompt) -> true for activity questions ("what have you been up to", "what's ollama been doing", "/activity",
      "who is using ollama", ...); false for ordinary ones ("what have you done to my file", "what is ollama").
    windowFrom: "(prompt) -> { sinceMs, label }: 'last N minutes|hours|days', 'last hour', today, 24h, week; default 6 h"
    recall: >-
      ({ sinceMs, stream }) -> { ollama, selfTest, scheduled, triggers, chats, repoAgent, stream }, each section
      either data or { _error }. Sources: lib/ollama-activity.js tail, copilot/adversarial.js lastResults,
      lib/scheduler.js list, lib/triggers.js list, cortex chat_log and repo_agent_log (jaa-db), the live stream.
    format: "(recall, { focus, label }) -> text; focus 'ollama' answers only the Ollama part"
    answer: "(prompt, stream) -> { text, modelUsed: 'data-only', intent: 'activity', source } | null"
  surfaces:
    - copilot/intuition.js — checked before the greeting fast path
    - GET :3750/api/activity?hours=N[&text=1] (copilot/server.js)
  invariants:
    I1: every line names a record; an unreadable source is named as unreadable, never omitted.
