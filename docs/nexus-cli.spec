spec:
  meta:
    name:        nexus-cli
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-cli-runtime-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Dynamic CLI runtime. No hardcoded commands.
      All commands from component registry grammar tree.
      Tab completion from trie. Live rebuild on SSE.
      When grammar fails: Qwen 0.5b reasoning layer.
      Registers as UI session on start.

  boot_sequence:
    1: "fetch /api/components/grammar → build trie"
    2: "POST /api/ui/register → get sessionId"
    3: "GET /events SSE → live grammar rebuild"
    4: "open REPL with tab completion"

  resolution_chain:
    1: "grammar engine trie — deterministic, O(k)"
    2: "alias map — single and multi-word shortcuts"
    3: "Qwen 0.5b — rephrase natural language"
    4: "Qwen 0.5b — propose missing component"
    5: "agent check — validate before registering"
    6: "human confirm — for any component modification"

  commands:
    builtin: [help, status, exit, quit]
    dynamic:  "all from component registry — updates live"

  run:
    interactive:      "node cli/nexus-cli.js"
    non_interactive:  "node cli/nexus-cli.js gaps list --status open"
