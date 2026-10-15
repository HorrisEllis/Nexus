# 0.60.56 - 2026-10-15

James: "use erosmanceros, scroll slowly, using the arrow keys or something, could also make it a macro and or automation in clearglass, a good way to test them"

## What it does
The background chat reader does not need new page code in a new place. Clear Glass already has an automation engine. It gained one step, **Scroll slowly until nothing new loads** (`scroll_until`):
- **Scroll with:** ErosmancerOS (a real mouse wheel through `/api/input`), the arrow keys (real keystrokes through the driver, several per step), or scrollBy in the page.
- **How slowly:** a small step (default 120 px), a pause after each (default 700 ms). Done when the count of messages, the scroll position and the page height have all stopped changing for N steps (default 4), or at a step limit.
- **Which area scrolls:** the step finds the inner scrolling element from the message selector (a chat's messages are usually not in the window itself) and focuses it before sending keys.
- **No quiet fallback:** if ErosmancerOS is not running, the step fails and says so. It does not switch to keys or the page. The result says which input path ran.

Also: `press` can send a real keystroke (`input: native`), which scrolls and focuses the way a person's key does. A synthetic in-page key event, the old behaviour, does not trigger the browser's default scrolling. ErosmancerOS has a pointer, a wheel and typing but no key press, so asking it for a key is refused and said. `scroll` can use the ErosmancerOS wheel.

## The test he asked for
A template, **Read one chat slowly (test)**, in Settings -> Automation: open one chat, scroll it, count the messages. It exercises the automation engine, ErosmancerOS input and the chat ledger's DOM observer on one real chat before the background reader depends on them. Five new settings under Chat capture -> Reading a chat (scroll with, direction, step, pause, stable steps).

## Proof and limits
`tests/modules/test-scroll-until.test.js` 9/9, and the existing automation suites still pass (18/18, 8/8). They run in jsdom behind the same `browserFn` hook Clear Glass sets: jsdom has no layout and no real wheel. **Not proven:** that the ErosmancerOS wheel scrolls a provider's chat; that the inner scroller is found on a real chat page; that arrow keys reach it; which direction loads older messages on each provider. The template is how to find out. Macros: not changed (automations convert from macros, not the reverse); to confirm whether `scroll_until` should also be a macro step.
