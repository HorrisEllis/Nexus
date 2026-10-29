# NEXUS 0.39.268: Guardian keeps the code, builds stop timing out on the 7b, no Eravos in New Spec

**Date:** 2026-09-27 · base: 0.39.267

James (screenshots: a "music maker" spec whose files are all 0 b, ChatGPT's A/B chooser with a retry sitting unsent, and Chat Glass showing the captured reply):

> *"guardian isn't capturing the code from chatgpt."* · *"the eravos options need to be removed from this prompt."*

## Guardian read code replies without their fences (`guardian/userscript-*.js`, `lib/extract-code.js`)

- **What was wrong:**
  - Every userscript read the reply with `el.innerText`, which is what the page *shows*.
  - A rendered code block reads `JavaScript\nCopy code\n<code>`, with no fences. Chat Glass showed exactly that.
  - `extractCode` found no fenced block, so every code chunk failed: "chatgpt did not return usable code: no fenced code block found".
  - The WARP cascade then fell through to ollama and claude, which failed too. Every file stayed 0 b.
- **Fix:**
  - `_replyText(el)` in all five userscripts (chatgpt, claude, gemini, deepseek, perplexity) puts each `<pre>` back as a fenced block. The language comes from the `language-*` class, else from the block's header label.
  - It is used for the job watch and its baseline, and for the chat sync that Chat Glass / the downloads index stores.
  - `extractCode` also accepts the rendered form: when the first line is exactly a known language name, the rest (minus a "Copy code" line) is that code. So replies already captured this way are usable.
- **Checked in Chromium** against ChatGPT's code-block markup:
  - old read: `JavaScript / Copy code / …`, extracts nothing;
  - new read: a ```` ```javascript ```` block, extracts as `.js`.

## ChatGPT's A/B chooser held jobs (`guardian/userscript-chatgpt.js`)

- **What was wrong:** "Which response do you prefer?" blocks the chat until someone picks. A job injected under it sat unsent in the composer.
- **Fix:**
  - Before sending, Guardian checks for the chooser.
  - While it is open, Guardian reports `waiting-for-choice` ("pick one in the tab") and waits.
  - If nobody picks within the no-reply limit, the job fails with that reason. Guardian never picks for you.

## Retries told the agent the wrong thing (`lib/seam/queue.js`)

- **What was wrong:** a reply with no usable code was retried as "[RETRY — connection interrupted, no response was received]".
- **Fix:** it now says "your last reply arrived, but no code block could be read from it" and asks for one fenced block. Real stalls keep the old wording.

## Builds used the 7b (`idearium/agent-suite/index.js`)

- **What was wrong:** `buildChunkWithAgent` defaulted Ollama to `FALLBACK_MODEL` (`huihui_ai/qwen2.5-coder-abliterate:7b`), which timed out at 120 s on a 4 GB GPU.
- **Fix:** builds use the repo's Agent-tab model, else `DEFAULT_MODEL` (the 3b).

## No Eravos mods in New Spec (`idearium/api/index.js`, `idearium/ui/js/app.js`)

- The New Spec dialog no longer lists Eravos mods.
- `GET /api/spec-engine/templates?include=eravos` still does, and specs already built from a mod still build.

## Tests

- `test-agent-hat-agnostic` **15/15**. New:
  - H-013: the rendered-text reply extracts;
  - H-014: the retry wording;
  - H-015: every userscript reads with fences.
- Unchanged and passing: `test-extract-code` 19, `test-code-artifact` 46, `test-guardian-stream-extraction` 4, `queue.test` 51, `raid-retry-escalation` 9, `idearium-guardian-dispatch` 5, `test-guardian-retry-novelty-installs` 53.
