# 0.60.495 — the live stream is the first source of a job's answer (PC8 expanded)

James, 2026-11-11: "also the .response. dom mutator is supposed to stream live." · asked whether to make the live stream the first source
of a job's reply: "Yes, build it"

## Before
His 0.39.278 direction ("guardian is polling, but it shouldn't be, live streams the dom mutation live") was built as the layer under the
job. A job still waited on the userscript's watch for a reply element, up to 180 s, with the stream only a fallback.

## Built (`guardian/lib/ncp-handler.js`)
- The reply the page's MutationObserver already sends as it changes completes the job itself: a chunk saying the page stopped generating,
  with text, and none after it for 8 s (`GUARDIAN_STREAM_SETTLE_MS`), is the answer. A chunk inside that time starts the wait again.
- The older watch still runs. Whichever comes second finds the job complete and is ignored.
- The tab's "no reply element" completes from what the stream already carried, before the chat ledger (0.60.494) and before failing.

## Proof
test-ncp-handler-sr3 10/10: NCP-020 (completes after the settle time), NCP-021 (a later chunk restarts the wait; the grown text is what
completes), NCP-022 (the no-reply-element road completes from the stream; with no stream it fails as before).

## Not done, said
- Not proved on a live job.
- ChatGPT's tab was signed out; its reply, a tool call, was on the page and nothing read it. Whether the observer sees a signed-out page is not known.
- Google refused the sign-in inside Clear Glass ("This browser or app may not be secure"). Not worked around.
- Clear Glass re-injects Claude's userscript every minute while its tab is on the sign-in page.
- Not yet in Versionium (§17.12).
