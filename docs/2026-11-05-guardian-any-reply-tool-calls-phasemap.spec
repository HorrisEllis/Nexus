# docs/2026-11-05-guardian-any-reply-tool-calls-phasemap.spec — Guardian picks up agent tool calls from any reply, not only its own jobs.
# Owner: guardian. The ask is James's; the readings, the gate and the order are the coder's, decided by his axioms (cited). MAPPED, nothing built.

origin: >-
  James, 2026-11-05, with this Claude Code session open in Clear Glass: "like you open right now in clearglass. i would love if guardian
  would automatically pick up agent tool commands regardless of request."

found_before_mapping: >-
  (§0.1, read 2026-11-05) Guardian already reads tool calls from a reply, but only from a reply to a job it sent. guardian/lib/ncp-handler.js
  calls extractToolCallsFromDOM(finalText) inside `if (job)`: the fenced ```tool_call {"name", "arguments"} convention (guardian/server.js
  _extractToolCallsFromDOM), then emits guardian.tool.called, which lib/agent-tools/tool-call-listener.js records (with findRecentResult
  for reuse). Only guardian/tool-runtime.js's loop runs them, for its own job. A reply in a chat he opened himself (claude.ai, ChatGPT, a
  Claude Code session like this one) carries no job, so nothing is extracted and nothing runs.

readings_to_confirm:
  - "\"regardless of request\": any reply Guardian can see in Clear Glass (a chat he started himself, not only one Guardian sent), on the
     AI sites Guardian already watches."
  - "\"agent tool commands\": the ```tool_call blocks Nexus's agents already write, \"hey nexus,\" wake lines (the agent hint's
     convention, guardian/userscript-nexus-wake.js), and nexus.command lines (the one command table, idearium/cli/route-commands.js)."

risk_named: >-
  (TRUTH_OVER_COHERENCE, §1.2) Running whatever a reply says, from any page, means anything that can make a model write a tool_call block
  (a web page it read, a pasted document, a shared chat) can act on his machine: prompt injection. The axioms already say how it is held:
  RAID is the only write authority (§5.2, §9.1), USER_AUTONOMY (his calls are his), REVERSIBILITY. So pickup is automatic; running is gated.

decisions:
  AT_D0_what_runs_by_itself:
    status: "OPEN — his"
    question: >-
      Picked up from a reply he did not ask Guardian to send, which calls run without asking him?
      (a) the coder's recommendation: reads run by themselves (status, search, read, list: the tool catalog's read class); anything that
          changes something is shown to him with Run / Skip; anything irreversible (delete, push, pay, send) is refused unless he runs it
          by hand. RAID's constitution gate decides the class.
      (b) everything runs by itself, logged.
      (c) (a), plus a list of sites or chats where everything runs.
  AT_D1_where_the_result_goes:
    status: "OPEN — his"
    question: "(a) a Clear Glass toast and Guardian's panel only · (b) also typed back into the chat as the next message (the model sees it and continues)"

phases:
  AT1_pickup_from_any_reply:
    status: OPEN
    depends_on: [AT_D0_what_runs_by_itself]
    files: [guardian/lib/ncp-handler.js, guardian/server.js, guardian/event-taxonomy.js, tests/modules/test-guardian-any-reply-tools.test.js]
    does: >-
      A completed reply with no job (a transcript completion, which already carries its chatUrl) goes through the same extractor; each call
      found is emitted as guardian.tool.called with { source: 'reply', site, chatUrl, provider, calls } and recorded by the existing listener.
      A call already answered recently (findRecentResult) is not run twice.
    proof: "a reply with no job and one tool_call block emits the event with its chat; the same block seen twice runs once"
  AT2_the_gate:
    status: OPEN
    depends_on: [AT1_pickup_from_any_reply]
    files: [guardian/lib/any-reply-tools.js, guardian/tool-runtime.js, tests/modules/test-guardian-any-reply-tools.test.js]
    does: >-
      Each picked-up call is classed through RAID's constitution gate (reached by its route, never its files) and routed by AT_D0: run, ask,
      or refuse with why. Every outcome is a ledger line with the reply it came from. Nothing runs that was not classed.
    proof: "a read runs; a write waits for Run; an irreversible one is refused with the rule named; a call with no class is refused"
  AT3_result_and_screen:
    status: OPEN
    depends_on: [AT2_the_gate, AT_D1_where_the_result_goes]
    files: [guardian/server.js, clear-glass/src/main/index.js, clear-glass/src/renderer/toasts.js, guardian/ui/tool-calls.html]
    does: >-
      The result goes where AT_D1 says; Guardian's panel lists every picked-up call (from which chat, its class, ran / waiting / refused) with
      Run and Skip for the waiting ones. Tested in Clear Glass (AXIOMS §4.1).
    proof: "a waiting call shows in the panel with its chat; Run runs it once and the toast shows the result"

  AT4_claude_code_page:
    status: OPEN
    origin: "James, 2026-11-05, with this Claude Code session open in Clear Glass: \"i need a way for you to assist me in clearglass.\""
    depends_on: [AT1_pickup_from_any_reply, AT_D1_where_the_result_goes]
    files: [guardian/nexus-hey-claude.user.js, guardian/userscript-claude.js, guardian/lib/wake-loop.js, tests/modules/test-guardian-any-reply-tools.test.js]
    does: >-
      The Claude userscript matches claude.ai/* already, but reads claude.ai's chat page; Claude Code's page (claude.ai/code/session_…) has its
      own message list and composer. Teach it that page: a completed assistant turn is read, its wake lines and tool_call blocks go through
      AT1–AT2, and the answer is typed into its composer and sent, so the coder in the cloud receives Nexus's live answer as the next turn.
    proof: "a recorded Claude Code page with one completed turn containing \"hey nexus, open gaps\" is answered into its composer once"

order: "AT1 → AT2 → AT3, after his AT_D0 (and AT_D1 for AT3); AT4 after AT1 and AT_D1."

# ── ADDENDUM 2026-11-05 — Hey Nexus is the same mechanism; one pickup for both ──────────────────────────────────────────────────────────────
# James, 2026-11-05: "also look at hey nexus, it was meant to be a way for you to conversate with nexus." Read the same day: Hey Nexus is
# built (guardian/userscript-nexus-wake.js, guardian/lib/wake-loop.js, 0.39.252). The agent hint tells a model it can write a line starting
# "hey nexus," and guardian's wake-loop answers it from the COMPLETED reply, asking co-pilot (:3750/api/prompt/tools, the full tool loop),
# and types the answer back into the same chat as a wake-reply job — his 2026-09-25 "it is for the agents to talk to nexus. not me." Its gap
# is this map's gap: the wake-loop answers completions of guardian jobs; a chat with no job (one he opened himself, this Claude Code session)
# is never answered. So AT1 reads both from any completed reply — tool_call blocks and wake lines — and AT2's gate holds both (co-pilot's tool
# loop can change things, so a wake from a reply he did not ask Guardian to send is gated the same way). AT4 teaches the Claude userscript
# Claude Code's page.

