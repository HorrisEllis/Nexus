# 0.60.204 — a ChatGPT sign-in popup stays open

James, 2026-10-22: "also fix chatgpt. i can't login. i click login and it pops up for a second and dissapears"

## What was happening (read from the code; his run confirms it)
- This is the third time he has reported it:
  - 0.60.45: "i click login and it closes the login";
  - 0.60.52: "i cant click the login on the popup for chatgpt".
- ChatGPT is the one provider whose chat works signed out, so when Guardian says the ChatGPT tab needs a sign-in, the attention
  handler first sends the tab back to its chat. It does not do this while the person is using the window. "Using" meant one of two
  things: he had typed in it within the last two minutes, or it was visible and focused (AF-02b, 0.60.52).
- "Continue with Google", "Continue with Microsoft" and "Continue with Apple" each open a popup, and the popup takes focus. The
  ChatGPT window behind it was visible but not focused, so it read as the hidden agent tab:
  - it was sent back to chatgpt.com;
  - the popup, whose opener was gone, closed a moment after it appeared.

## What changed (clear-glass/src/providers/attention.js 1.4.0)
- A window with a popup of its own open counts as in use. The check is that the popup's `webContents.opener` is the window's main frame.
  While that popup is open, the window is not sent back to its chat or focused.
- While that popup is open, the attention panel no longer hides the window when it passes through a page that is not a sign-in page.
- These now count as sign-in pages: login.live.com (Microsoft accounts), auth0.openai.com, and challenges.cloudflare.com (the
  "verify you are human" step).
- With no popup of its own, nothing changes: an unfocused tab nobody is using still goes back to its chat (AF-02b is kept).

## Proof
- tests/modules/test-cg-attention-focus.test.js, 7/7.
  - New, AF-02c: a visible, unfocused ChatGPT window on auth.openai.com whose Google popup is open is neither sent back nor focused.
  - The same window with only another window's popup open is sent back, as before.
- This was tested with fake windows. Electron 42 provides `webContents.opener`; the live check is his next sign-in.

## If it still closes
- Clear Glass's log will show what did it:
  - `[attention] chatgpt — on a sign-in page, but ChatGPT works signed out`, or
  - `[attention] chatgpt — left the sign-in page`.
- If neither line appears, the sign-in was in a normal browser tab, not the ChatGPT agent window. That is a different path, and the
  next one to read.
