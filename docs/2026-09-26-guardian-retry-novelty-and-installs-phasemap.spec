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
      files: [erosmancer/erosmancer-os/src/api/server.ts, clear-glass/src/main/index.js, erosmancer-os /api/human-type (proxied by the wire)]
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
