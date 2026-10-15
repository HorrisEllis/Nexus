# 0.60.46 — 2026-10-15

James, his run log (0.60.44): `[guardian] NCP disconnected: provider=chatgpt` at 13:00:31, then `cancelled — no chatgpt tab connected for 120 s`

## A dropped provider tab reconnects within one heartbeat

**What James's log showed.** At 13:00:31 Guardian logged ChatGPT as disconnected. The tab didn't notice:
- It finished the job it was on (submitted and completed over HTTP after the "disconnect").
- It kept sending heartbeats.
- It never reconnected, so the next job waited 120 s and was cancelled. That is what opened the "is not connecting" panel.

**Root cause, from the source.** The live connection between Guardian and the tab broke on Guardian's side without the tab ever seeing an error. His machine was at 4–10% free memory at that moment. Two things then kept it broken:
- The tab only reconnects when it sees an error, and none arrived.
- Guardian answered heartbeats from a tab it had already dropped with the same plain acknowledgement as a healthy one. The tab believed it was connected, indefinitely.

**The fix:**
- Guardian's heartbeat reply now says `registered: true/false`: does Guardian still hold this tab's connection.
- Every provider userscript sends its heartbeat through `_hbPost`. On `registered: false` it reconnects at once, unless it is already reconnecting.
- This recovers within one heartbeat (8 s), whatever broke the connection.
- Userscript versions: chatgpt and claude 10.12.2, gemini and deepseek 10.10.2, perplexity 10.9.2.

**Also from his log:** the picker twice saved the input's placeholder text (`p.placeholder`) as the send button. A send pick that isn't a button, an element with `role=button`, or a submit input is now refused, and the panel says why.

## Proof

- test-ncp-half-open 3/3:
  - **NH-01** (the reply says whether the connection is still registered) fails on the old code.
  - **NH-02** runs every provider userscript's `_hbPost`: it reconnects only on `registered:false`, and not while already reconnecting.
  - **NH-03** (the send pick must be a button) fails on the old code.
- Unchanged and passing: userscript-protocol-parity 12/12, nexus-wake 34/34, chat-transcripts 31/31, live-stream-and-gates 13/13, selector-map 15/15, cg-attention-focus 5/5, plan-code-run-attention 40/40.
- Already failing on main, unchanged: guardian-job-correlation (2 checks), accounts-picker-cos WR-01.

## Seen in the same log, named and not fixed here

- **RAID officiator:** synthesis fails every 20 s ("no real agent response (forAgent=ollama)") while Ollama was up.
- **Intelligence:** logs hundreds of trivial co-occurrence "patterns" a minute. That's noise, and it costs memory.
- **Claude:** its reply element wasn't found ("needs-you").
- **Memory:** the first nexus-self sync rewrote 3805 files, and the machine fell to 4% free memory.
