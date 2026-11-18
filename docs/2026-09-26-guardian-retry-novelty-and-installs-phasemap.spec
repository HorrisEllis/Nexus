spec:
  meta:
    name:     guardian-retry-novelty-and-installs
    roadmap: 'later — guardian retries are ME9; installs later (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-09-26
    release:  0.39.265
    owner:    guardian.job-retry · lib.semantic-variant · copilot · erosmancer-os · cos.testenv.installer
    status:   mapped before build (docs/CLAUDE.md rule 1)
    origin: >
      James: "Can you have the run button menu prompt to install when it's not detected in the path? This is so
      close to being able to manage nexus from inside, with the compartments. Guardian needs better retry logic.
      It got stuck earlier when I ran two jobs. Can reuse the same .jobs. The .jobs file in guardian can link to
      the response. That way if it runs again can check for the response first. Maybe using the vector storage?
      Chat logs? Can we have copilot create .jobs to chat gpt. With a semantic randomizer to change what the job
      says each time. and force novelty each time. That way it can explain it like a person, like a human a not
      a wall of text. So queue for guardian and retry logic. Maybe even have copilot create alternative semantic
      sentences with the same meaning? Maybe hook that in that in to ErosmancerOS"
    decisions:   # asked, answered
      rewording:  local model (Ollama through copilot's lifeline), with a built-in JS rewriter as the fallback
      eros:       fallback typist — the userscript stays primary; Eros types when the tab could not take the job
      installs: >-
        everything a run option needs (QEMU, Python, Ruby, PHP, Go, Git): winget on Windows, brew on
        macOS, apt with sudo -n on Linux or the exact command when a password is needed

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - guardian/lib/jobs.js — every job is a .job file (source of truth), recovered at boot
    - guardian/lib/dispatch-pool.js — cap 1 per browser provider; slot released on guardian.job.complete/error
    - guardian/lib/dispatcher.js — _requeueOrFail: bounded retry ONLY for completion-timeout and disconnect
    - guardian/lib/ncp-handler.js GUARDIAN_ERROR — every tab error is TERMINAL (status 'error')
    - guardian/lib/response-sink.js — writes <jobId>.response nodes; readNode(jobId)
    - guardian/lib/chat-transcripts.js — matchJobs(): a job's prompt found as a user turn + the next assistant turn
    - lib/repo-prompt-blocks.js — every block the agent is sent is editable (0.39.258 rule: nothing uneditable)
    - copilot/lifeline.js — _tryOllama (ollama-bridge jobs API), _tryGuardian
    - erosmancer-os — /api/execute type = keyDown/keyUp per char, no timing, '\n' would press Enter (send)
    - clear-glass wire /bridge/driver — resolves an Eros tab by exact URL, else tabs[0] (any tab)
    - lib/cos-run.js — options(): an unavailable option says why, never offers a fix
  missing:
    - M1 a tab error (input not found, still answering, submit failed) ends the job — the "stuck with two jobs" case
    - M2 a retried job is re-sent without checking whether its answer already exists
    - M3 two identical jobs in flight both run (double send)
    - M4 no rewording: the same words go to the provider every time
    - M5 nothing asks the agent to talk like a person; no editable block for it
    - M6 Eros cannot type a multi-line prompt into a chat composer, or type with human timing
    - M7 the Run menu never offers to install what is missing

  invariants:
    I1: a retry never re-sends a job whose answer is already on disk (.response) or in its chat transcript
    I2: retries are bounded (4 attempts) and every attempt's reason is kept on the .job
    I3: rewording keeps every protected token verbatim — code, paths, identifiers, numbers, quotes, URLs;
        a variant that drops one is rejected
    I4: novelty is checked against what was actually sent before (per agent), not assumed
    I5: the voice text and the rewording switch are editable blocks (0.39.258 rule)
    I6: Eros types only into the provider's own tab (host match), never "the first tab"
    I7: an install runs only on an explicit click; Linux never prompts for a password in the background

  phases:
    - id: R1
      name: guardian/lib/job-retry.js — classify tab errors (retryable vs final), backoff 3s/10s/30s, release the
            slot, check the answer first (.response, then the chat transcript), then re-dispatch; attempt ≥2 with
            an input/submit failure goes through the Eros typist; join an identical in-flight job
      files: [guardian/lib/job-retry.js, guardian/lib/ncp-handler.js, guardian/lib/chat-transcripts.js, guardian/server.js, guardian/lib/jobs.js]
      closes: [M1, M2, M3]
    - id: N1
      # roadmap edit 2026-11-18: (no status) -> DONE 2026-11-18. by evidence — n1.test.js (linked)
      status: "DONE 2026-11-18. by evidence — n1.test.js (linked)"
      name: lib/semantic-variant.js — protected-token extraction, JS rewriter, novelty store (per agent, 4-gram
            similarity against the last 50 sent), validation
      files: [lib/semantic-variant.js]
      closes: [M4]
    - id: N2
      name: copilot — POST /api/reword (Ollama first, JS fallback, validated, novel); repo-agent rewords the
            question when the repo's 'reword' block is on; 'voice' block ("explain it like a person")
      files: [copilot/server.js, copilot/lib/reword.js, lib/repo-prompt-blocks.js, lib/repo-agent.js]
      depends_on: [N1]
      closes: [M4, M5]
    - id: E1
      name: ErosmancerOS humanType — profile-timed keystrokes, Shift+Enter for newlines, long text in paced
            bursts; Clear Glass wire POST /eros/provider-type (host-matched tab, selector list, type, send)
      files: [clear-glass/erosmancer/erosmancer-os/src/api/server.ts, clear-glass/src/main/index.js, erosmancer-os /api/human-type (proxied by the wire)]
      closes: [M6]
    - id: I1
      name: cos/testenv/installer.js + POST /api/cos/install + Run menu prompt ("not installed — install it?")
      files: [cos/testenv/installer.js, lib/cos-run.js, idearium/api/index.js, idearium/ui/js/app.js]
      closes: [M7]
    - id: T1
      name: tests — retry (real ncp-handler + pool + jobs in a sandbox), semantic-variant, reword route, Eros
            humanType against a real Chromium page shaped like a chat composer, installer (fake runners)
      depends_on: [R1, N2, E1, I1]
    - id: X1
      name: records — loom map wires, spec addenda, lib/version.js, CHANGELOG-0.39.265.md, commit
      depends_on: [T1]

## ADDENDUM 2026-10-21 (0.60.191) — R1/I1: the stream is the last place answerFirst looks

James, 2026-10-21: "im saying to use those as fallback routes. node anchor, dom mutator."
- **I1 now reads:** a retry never re-sends a job whose answer is already on disk (.response, complete), in its chat transcript, or in its
  ended stream.
- **The ended stream.** guardian/lib/response-sink.js streamNode keeps the DOM mutator's chunks (GUARDIAN_CHUNK's full text, with the reply's
  node anchor) in the job's .response node as 'partial'. It never writes over a complete node, and it writes at most once per 1.5 s or 400
  new characters. endStream marks the node ended when the page's 'dom' pulse says generating:false and no chunk has come for 3 s.
- **The order.** job-retry answerFirst reads job → complete node → transcript → ended stream. The transcript comes first because it is the
  finished record; the stream may trail the page by a chunk.
- **What does not change.** A stream still open never stops a re-send.
- **The dead tab.** guardian/lib/dispatcher.js: a typed job that idled out with no completion and no transcript asks answerFirst before
  failing, so a dead tab's ended stream completes it. Proof: test-guardian-stack-sim GS-04b.
- **Proof:** tests/modules/test-stream-fallback SF-01..04, including the real NCP handler. The neighbouring Guardian tests are unchanged
  (test-guardian-job-correlation 2, test-options 1 and test-system-record-discipline 1 fail the same on the tree before).

## ADDENDUM 2026-10-21 (0.60.192) — the stream is read from his download manager; 0.60.191's copy removed

James, 2026-10-21: "look in clearglass download manager"
- **What he saw.** His 0.39.278 idea already keeps the stream: clear-glass/src/downloads/chat-ledger.js, one append-only ledger per chat,
  written live by the page's DOM mutator (guardian/userscript-chat-stream.js), with `generating` on every line. His words then: "use the
  download manager in clearglass for the chat ledgers … live streams the dom mutation live to the download manager, that way we don't lose
  progress". 0.60.191 built a second copy of that stream in guardian's .response nodes instead of reading his. That broke §8.6 (reuse
  before build).
- **Removed** as a true duplicate (§0.3: the only removable thing is a true duplicate, and the drop is reported). response-sink
  streamNode/endStream and their calls in ncp-handler are gone; both files are byte-identical to before 0.60.191. answerFirst's stream
  step is gone.
- **Built in its place:**
  - guardian/lib/chat-transcripts.js `ledgerReplyFor(job)` replays the job's chats from his ledger through Clear Glass's own route
    (lib/chat-ledger-client.js, the drawbridge rule), matches the job's prompt to its turn as replyFor does, and takes the reply only once
    the page stopped generating (RC5);
  - the dispatcher asks it after answerFirst finds nothing: before a re-send, and before failing a typed job whose tab died. It is wired
    at guardian/server.js beside answerFirst.
- **Found on the way.** lib/work-journal.js (0.60.146) read the same ledger at :7701, which is Clear Glass's SSE port, so every read
  outside the tests failed and contract ledgers said "chat-ledger (not read)". Both readers now use the one client on the IPC port, 7702.
- **Proof:** tests/modules/test-stream-fallback SF-01..04, against Clear Glass's real chat-ledger.js on the bridge's route paths. The
  neighbouring tests are unchanged, and the boundary ratchet shows no new crossing.

## ADDENDUM 2026-11-15 — R1 expanded: a job's reply comes from its chat's settled .response, always; the ledger settles on DOM quiet

James, 2026-11-15: "use clearglasses download manager for .response nodes. the ledger also have it wait until the dom mutation stops."
Asked to choose between (a) every job ends only from its chat's settled .response, the three-reads check retired as the deciding source,
and (b) the .response only when the page cannot be read: **"Always (Recommended)"** (the coder's recommendation, chosen by him).
- **What exists (read first, §8.6).** Each provider userscript pushes GUARDIAN_TRANSCRIPT after 5 s with no change in <main>
  (_TX_SETTLE_MS = 5000, _TX_MAX_WAIT_MS = 60000); guardian/lib/chat-transcripts.js record() files it as a .response version
  (clear-glass/src/downloads/artifact-chat-index.js recordChat) and _completeFromTranscript completes a matched job only when settled
  and not generating. But the userscript's own watch (three equal reads, ~1 s) sends GUARDIAN_COMPLETE first, so the .response almost
  never decided a job. And the live ledger (userscript-chat-stream.js → chat-ledger.js) called a turn settled when the stop button went
  (settled: generating === false), not when the DOM went quiet.
- **Built (in place):**
  - guardian/userscript-chat-stream.js: settled = no DOM mutation for 5 s (the transcript's own 5 s) AND not generating; a quiet timer,
    re-armed on every mutation, sends a state-only line when it fires.
  - guardian/lib/ncp-handler.js: a GUARDIAN_COMPLETE that is not from the settled transcript does not complete the job; the job waits
    "for its .response" with the page's text kept. The settled transcript (record → _completeFromTranscript) completes it from the
    .response's reply, source 'response'. The coder's bound, said as a reading: if no settled .response comes within 90 s, the job
    completes with the page's text and says so on the job (§1.2: nothing hangs silently).
- By the axioms: §8.6 (the transcript push, the .response store and the transcript completer existed), §1.2 (the wait and its bound are
  said on the job), TRUTH_OVER_COHERENCE (a reply read mid-stream is not an answer: RC5).
- **Proof (tests):** test-chat-ledger-stream CS-08 (fails on the old code: "the DOM changed 200 ms ago: not settled yet"); test-chat-transcripts
  TX-32 (fails on the old code: "held, the page text kept"); TX-27/TX-30 follow the 'response' label; test-ncp-handler-sr3 and
  test-back-and-forth run with jobs.response_wait_ms = 0 (they test sequencing, not the source). Neighbours unchanged: stream-fallback 4/4,
  sr3 10/10, back-and-forth 18/18, job-correlation 117/3 and chat-transcripts 3 failures as before (TX-19, TX-29, TX-20; CS-07 = the Clear
  Glass driver host exiting). Also: answerFirst's settled sources count as .response; the stream says 'stream'; ledgerReplyFor skips an
  unsettled ledger; 'awaiting_response' is in flight in job-retry, ask.js, dispatcher.js; Guardian option jobs.response_wait_ms (90 s).
- **Live (Guardian restarted through COS 20:10 UTC, the CS12 build's jobs cut and retried):** the first job after it (claude) was HELD and
  then completed from the page after 90 s: "no settled .response carried the reply within 90s" (responseSource 'page (no settled .response
  in time)'). The hold and its bound work; the settled transcript did not match the job in time. NOT yet traced: whether Claude's tab
  (userscript reloaded? it was not: Clear Glass re-injects only on reload, so its old transcript push runs) pushed a settled transcript,
  and whether matchJobs found the job's prompt in it. Next: read Guardian's log for chat-transcripts lines after 20:10, reload the agent tabs.
- **2026-11-17 — why Claude never filed a .response:** Claude's page renamed its turns ([data-testid="user-message"] / "assistant-message");
  _nexusGetFullChat's four selectors matched none, so the chat read empty, no GUARDIAN_TRANSCRIPT was pushed, no .response was filed, and every
  Claude job waited the full 90 s (his log: 4 of 4; Gemini 4 of 4 from its .response). Fixed in guardian/userscript-claude.js (the new
  selectors first, the old kept; nested matches read once; the "Claude responded:" label dropped). Proof: on his tab the reader gives 7 turns in
  order with roles; after the reload Guardian filed claude:746b7b33 v1 · 3 messages. James, 2026-11-17: "sure" (to fixing it).
