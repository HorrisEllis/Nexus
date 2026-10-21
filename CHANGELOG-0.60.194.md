# 0.60.194 — 2026-10-21 — SP5's title.js: four reasons it kept failing, and what was fixed

James, 2026-10-21: "its having so much issue with the title.js. nothing has fixed it. sp_5." · "why all of a sudden? with the clearglass?"

From your log and three screenshots. It was four separate things at once.

## 1. ChatGPT changed its chat URLs (the "all of a sudden") — fixed
- **What changed.** Your log shows ChatGPT opening the chat at `chatgpt.com/uc/6ad8ebba-…`. Until now its chats lived at `/c/<id>`.
- **What depended on the old URL.** Every part of Nexus that reads a ChatGPT chat looked for `/c/`:
  - the ChatGPT userscript's chat id;
  - the download manager's live chat ledger, which skips a chat it reads as "home";
  - Guardian's transcript reader;
  - Clear Glass's chat ports.
- **The effect.** Since the change, every ChatGPT chat was read as "home" and dropped. That's why ChatGPT's reply "could not be found on
  the page" and the job went to "needs you". It also meant no fallback could recover the reply, because nothing had recorded it.
- **Fixed.** Every reader now accepts `/c/` and `/uc/`. The ChatGPT userscript is now 10.12.5, so Clear Glass loads the new one.

## 2. A junk test file from before the fix was blocking Apply — fixed
- **The file.** One of the two tests that failed your proposal was `looking-glass-bundle-v0_4/Gemini said tests/sp5-title.test.js`. It was
  written before RC5 stopped "Gemini said" getting into file names.
- **Why it survived.** The repair that moves such names out of the tree (RC4b) only ran inside the test-first step. SP5 resumes its saved
  plan, which skips that step, so the repair never ran for it.
- **Fixed.** Every phase build now repairs the tree right after its snapshot. Such names are archived under `.nexus/archive` and kept in
  the snapshot, never deleted.

## 3. The proposed title.js really is wrong — the gate was right
- **The bug.** ChatGPT's version lowercases, splits on spaces and capitalises each word, but never trims. So `' looking glass '` comes
  back as `' Looking Glass '`, and both tests expect `'Looking Glass'`.
- **The gate did its job.** It refused the change because the tests pass on the current file and fail on the proposal.
- **What to do.** Reject it with the reason (for example "trim the input first"). The agent is told and retries with what it learned
  (RL2).

## 4. Claude was signed out by claude.ai itself — not by Clear Glass
- **What the log shows.** `claude.ai/logout?involuntary=1`. claude.ai ended the session.
- **Why it wasn't Clear Glass.** Clear Glass's account switcher logs every account switch and sign-out, and none appears for Claude in your
  log.
- **The fix.** Sign in once in the Claude tab. Its queued job is waiting for that.

## Also in your log
- **Memory.** Free memory sat at 16–18%, so the local Ollama models were skipped ("won't fit memory") and the ladder used the browser
  agents only.

## Measured
- `test-pipeline-root-causes` 13/13:
  - **RC-12:** the repair runs after the snapshot and outside the test-first step, and a "Gemini said tests" folder is archived while the
    real test stays.
  - **RC-13:** `/uc/` chats read correctly in the userscript, the transcript reader and Clear Glass's chat ports.
- **The neighbouring tests are unchanged.** `test-guardian-job-correlation` (2) and `test-test-first` (1) failed the same way before.

## To check on your machine
Restart so Clear Glass loads userscript 10.12.5, sign in to Claude, reject the current title.js proposal with the reason, and build SP5
again. The run should show a "repaired" row (the junk test moved out), and ChatGPT's reply should be found.
