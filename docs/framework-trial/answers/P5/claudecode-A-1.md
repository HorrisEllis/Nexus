**Core idea:** the agent reads the page as structured text through the browser's accessibility tree. It does not look at pixels. It acts by meaning: a role plus a name, such as `textbox "Email"`. It does not act by CSS path. Each task that works once is saved as a deterministic script. A model is called only when that script breaks.

**1. Driver ($0).** Use headless Chromium, driven over the Chrome DevTools Protocol. Puppeteer or Playwright both work, and both are free. Use a persistent profile so cookies and sessions survive between runs. One tab needs roughly 200–400 MB, which fits on consumer hardware.

**2. Observation without vision.** Call `Accessibility.getFullAXTree` (CDP) or take an ARIA snapshot. Compress the result into lines like this:
`[12] textbox "Email" required` · `[13] button "Sign in"` · `[20] alert "Wrong password"`
- Each actionable node gets a short ref.
- Decorative nodes are dropped, and long lists are cut down.

A typical page comes to 1–3k tokens, which a local 7–8B model (Qwen2.5/Llama via Ollama) can handle. If labels are missing, fill them in from `<label for>`, placeholder, `aria-*`, nearby text and `name=` attributes.

**3. Acting by meaning.** Every step is stored as `{intent, role, name, fallbacks:[label, placeholder, name-attr, text-near], postcondition}`. To resolve a step, try an exact role and name match first. Then try fuzzy matching (normalised text, synonyms such as "Log in"/"Sign in"). Then try the fallbacks. Pick the best match only if exactly one candidate scores above the threshold.

**4. Checking every step (the main source of reliability).** Each step declares what must be true afterwards:
- the URL changed;
- an expected element appeared;
- an `alert` or `role=status` did not appear;
- a network response came back 2xx (CDP `Network` events).

Do not rely on fixed sleeps. Wait until the DOM and network have been quiet for about 500 ms and the postcondition holds. If the postcondition fails, the step failed, even when the click itself "worked".

**5. Escalation ladder (cheapest first).**
1. Replay the stored script. This takes milliseconds and costs no tokens.
2. Re-resolve the step with fuzzy matching and fallbacks, still deterministically.
3. Give the local LLM the compressed tree, the intent and the error. It picks a ref, and the postcondition still checks its choice.
4. If that still fails, stop. Save the tree diff and hand the problem to a human.

When a repair passes, the new locator is written back to the script, so the script heals itself and the change is versioned.

**6. Reading results.** Pull tables, lists and `dl` elements from the tree into JSON, and check the JSON against a schema the task declares. A schema failure is treated as a page change, never as data.

**7. Shortcut where it is safe.** Record the network traffic of a working run. If the site submits a plain form or uses a JSON API, a later run can send the HTTP request directly, carrying the cookies and CSRF token taken from the live page. This is faster and breaks less often. If the API stops matching the recording, go back to the browser.

**8. Hard limits.**
- CAPTCHAs, 2FA and bot walls go to a human. Do not try to beat them, because that is unreliable and often against the site's terms.
- Credentials stay in a local encrypted store and are typed in by the driver. The LLM never sees them.
- Send requests at a human pace and respect robots.txt and the site's terms.

**Recommendation:** use CDP-driven Chromium with a compressed accessibility tree as the agent's view. Store each task as a meaning-based script with a postcondition on every step, use a local LLM only for repairs, and replay over direct HTTP where it is safe.

**Why:**
- Text trees are cheap and fit a local model.
- Meaning (role and name) changes less often than layout and CSS.
- Postconditions turn silent failures into failures you can see.
- Spending tokens only on breakage keeps the cost at $0.

**Main risks:**
- Sites with poor accessibility markup (canvas apps, unlabelled div buttons) leave the tree thin. Text heuristics recover part of this, but not all.
- Bot detection and CAPTCHAs will block some sites outright.
- A small local model can pick the wrong but plausible element. Postconditions catch most of these cases, not all, so irreversible actions such as payments or submissions should need confirmation.
- A redesign that changes the flow itself, not just its labels, still needs a human to re-record the task.
