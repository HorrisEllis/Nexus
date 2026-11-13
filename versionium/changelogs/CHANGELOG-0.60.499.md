# 0.60.499 — the picked reply is used by every page script (HP11 expanded)

James, 2026-11-12, shown that Claude's page script never asks for the reply he picks: "Yes, fix the reply"

## Before
COS's build pipeline ran on 0.60.496 (run `34c10bca`, phase `CS12_the_mover_is_proven`). Six steps were met. The build then counted 12 agent
calls as empty, while ChatGPT and Claude had both answered on the page (his screenshots). Guardian said: "the prompt was sent but … reply
cannot be found on the page — pick the reply". The pipeline's `landed` step gave up after 6 attempts.

## Found
Only ChatGPT's script reads a picked reply. Claude's, Gemini's, DeepSeek's and Perplexity's `findResponseEl()` used their built-in
selectors alone, so a pick there was saved and never used.

## Built
`guardian/userscript-claude.js`, `-gemini.js`, `-deepseek.js`, `-perplexity.js`: `findResponseEl()` asks the field map's verified `resp`
first (`guardian/userscript-field-map.js` `NexusFields.find`, as `type()` and `press()` already do) and falls back to its own lookup.
A seed value is still never used.

## Proof
test-accounts-picker-cos FM-08 (a verified picked reply is what each of the four returns) and FM-09 (no pick, or no field map: the
script's own lookup, as before).

## Not done, said
- **Not live.** No job has been read through a pick.
- **His pick on ChatGPT was not saved.** Guardian's map for chatgpt and claude is all seed, nothing verified. Why is not known: Guardian
  crashed at 18:49 UTC, the disk was full that hour, and Claude's panel read "input: not picked".
- test-accounts-picker-cos is 38 of 42. AT-02, AT-03, AT-04 and WR-01 fail: their fake window predates the Guardian picker (0.60.71).
- Claude's built-in selector (`.font-claude-message`) is likely stale. It is left as the fallback, not replaced from memory.
- The hold (0.60.496) has still not held live: no run has reached `evidence`.
- COS's manager reads a request body only on POST and PATCH, so `PUT /api/cos/automation/pipelines/:id` changes nothing and answers ok.
- COS's pipeline sync found 0 files from Idearium, which lists one.
- In Versionium (§17.12): vtm-932ef919.
