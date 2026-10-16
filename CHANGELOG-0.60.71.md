# 0.60.71 — 2026-10-16

James: "actually wen its asking me to pick the inputs or response, or what ever. its needs to use the guardian picker so
i can traverse through the elements one at a time."

## What was there

When a provider tab needs mapping, the attention panel offers Pick input / Pick send / Pick reply. Those picks used a
one-click picker: whatever was under the cursor when he clicked was the pick. On a chat page the element under the
cursor is often a child of the one he means, like the placeholder `<p>` inside the input box or the icon inside the send
button. His run once saved ChatGPT's placeholder as the send button that way.

The Guardian picker (`clear-glass/renderer/guardian-picker.js`) already had traversal, the popup's ↑ PARENT / ↓ CHILD /
← PREV / → NEXT and NEARBY chips, but only for making callto entries.

## What changed

**The panel's picks open the Guardian picker in a field mode:**
- The banner says what to pick, e.g. "PICK THE SEND BUTTON".
- Click near the element, then walk the page one element at a time, with the arrow keys or the popup's buttons and
  chips.
- Each step shows `<tag> · role · "name"`, so he can see when he has reached the button and not the icon inside it.
- USE AS SEND (or Enter) settles it; Esc or CANCEL cancels.

**The checks are unchanged.** The element he settles on is described exactly as before: selector, how many it matches,
and where it sits. Its selector and anchor come from one set of helpers that both pickers share (`attention.js
_pickHelpers`), not a copy. Then the selector check, the role check (a send must be a button) and the semantic address
(SP2, 0.60.70) run as they did.

**The callto picker is unchanged.** Opened from the context menu, the Guardian picker starts in its own callto mode;
the field mode exists only when the panel asks for it.

**Fallback:** if the Guardian picker cannot run on a page, the one-click picker is used and the log says so.

**Found while there:** the Guardian picker's highlight added the page's scroll offset to a fixed-position box, so on a
scrolled page the green frame was drawn below the element being walked to. Fixed.

## Proof

- `tests/modules/test-guardian-field-pick.test.js` 5/5, on a chat page in jsdom:
  1. click the placeholder `<p>`;
  2. ↑ reaches the input (`<div> · textbox · "Write your prompt"`);
  3. → reaches the send button;
  4. Enter.
  The settled element passes the send and role checks. Esc and CANCEL resolve cancelled. Without the panel's flag the
  callto mode starts as before.
- Green: attention-focus 6/6, plan-code-run-attention 40/40, semantic-field-map 5/5, ncp-half-open 3/3,
  reply-not-found-attention 3/3, guardian-picker-cookies-wiring 2/2, cg-selector-assign 9/9, guardian-agent-registry
  11/11.
- GA-07 drives the handler with a scripted fake window written for the one-click picker. It now pins
  `pickerSource: null` so it keeps testing the panel → pick → Guardian flow it was written for.

## Not proven here

The walk is tested in jsdom, not in a live Clear Glass provider window. In his next "map the chat", the banner should
say what to pick, and the arrow keys should move the green frame.
