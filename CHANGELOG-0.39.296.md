# 0.39.296 — 2026-10-02

James: "alright but no lowercase. and make sure its enterprise grade"

## No lowercase
- **Everything in the Void is shown in capitals:** the field, the dials, the echoes, your idea as you type it, the placeholders and the messages.
- **Tooltips and the window title too.** Styling can't reach those, so they were uppercased at the source.
- **Your words are stored exactly as you typed them.** Only the display is in capitals, so the spec workshop and everything after still gets your spelling.

## The enterprise pass
- **Limits, said rather than silently cut:**
  - an idea is at most 4,000 characters, and a part you keep is at most 1,000;
  - going over is refused with the exact count;
  - the box shows the count as you near the limit.
- **Nothing hangs:**
  - every call has a deadline;
  - an agent answer (which can take minutes through a browser agent) shows a running timer;
  - if Idearium stops answering, you're told plainly, and the field stays on screen.
- **The field has its own states:**
  - ENTERING THE VOID while it loads;
  - THE VOID IS EMPTY with a nudge to speak your first vision;
  - THE VOID IS UNREACHABLE with TRY AGAIN.
- **Legible:**
  - text you actually read has proper contrast, and the dimness is kept only for decoration;
  - keyboard focus is visible on every control;
  - `/` jumps to the speak box.
- **Names never overprint.** The brightest ideas are named first; a name that would touch another waits for hover. Names are placed before they're drawn, so nothing fades across another.
- **Ideas with no saved place spread over the whole field**, instead of crowding into one ring.

## Measured
- **150 ideas:** load and paint in under 100 ms, and a repaint takes about 10 ms.
- **Edge cases, driven in Chromium against the real server:**
  - the empty Void;
  - an over-limit idea;
  - the server stopped mid-session.
- No console errors.
- `tests/modules/test-spatial-void.test.js`: 7/7. The new VD-07 covers the limits, capitals everywhere, no lowercase tooltip, the three states and the deadlines.
