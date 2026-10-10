# 0.57.0 — 2026-10-10

James: "can you have these settings broken up into repos? or at least expand the settings drastically, i prefer options over hard coded, and i prefer it over code honestly. anything high leverage, or that removes the need to understand code so i dont have to change it." · "have the envirement and desktop tabs in the same manu, have it dynamic. like once you set it up, change the button to edit desktop. and have a setting button next to it."

## Options instead of code, starting with guardian (OP0–OP3)

**One shape for every system's options: `lib/options.js`.** It's the shape Idearium's own config already used, now shared:
- **Each option says** its type, default, range, unit and what it does.
- **The value comes from one of three places,** lowest first: the default, then the system's own `data/options.json`, then an environment variable if the option names one. Every environment variable that worked before still works and still wins, and the setting says that it is being overridden.
- **A bad value is refused with the reason,** never quietly clamped.
- **Every change is kept** in the system's `options-ledger.jsonl`, with who made it.
- **A change applies on the next use,** with no restart.

**Guardian is the first system on it** (`guardian/options.js`). Its 13 options:
- **jobs:** pickup window, no-tab wait, economy wait, idle window, empty-reply grace, chat-resume grace, longest reply;
- **retry:** attempts, first wait, first wait when the tab is busy;
- **ask:** default wait;
- **routing:** transport, wake depth.

Guardian's code reads them instead of numbers written into it. Each default is the value the code used before.

**Where you see them:**
- **The settings console:** every `nexus/<system>` repo gets a **System** tab with that system's options. They're grouped, each with its description, range, default and source (default · set · env), and an editor and a reset. The values are read and written through the system itself (guardian's `GET/POST /api/options`, reached via Idearium's `/api/systems/:system/options`). Systems that haven't declared options yet say so.
- **The command line, and copilot through `nexus.command`:** `idearium options guardian`, or `idearium options guardian jobs.pickup_ms 60000`, or `… --reset`. Copilot may change only the options marked as copilot-writable.

**A write must be a JSON request.** A web page can't send one without the browser asking first, which closes the hole found today (SD15) for these routes.

## Environment & desktop in one menu (OP4)

In a repo's Settings, Environment and Desktop are now one item. The desktop's buttons follow its state:
- **Not set up:** ⚙ Set up desktop, with the reason.
- **Set up and stopped:** ▣ Open desktop · ✎ Edit desktop · ⚙ settings.
- **Running:** ▣ Open desktop · ■ Stop · ⚙ settings.

## Mapped, not built

- **`docs/2026-10-10-shape-of-nexus-phasemap.spec`:**
  - **Options everywhere** (OP1 for the other systems).
  - **The Clear Glass interaction field** injected once per page, not once per frame (google.com).
  - **One source of truth for the browser:** the HTML holds the structure, `browser.js` only the behaviour.
  - **The Nexus tutorial** (copilot, spotlight, the field) and the Fiverr tutorial in the browser.
  - **Every claim says how it's known** (epistemology).
  - **COS as the empirical layer:** a claim is verified only by an experiment run in a compartment.
  - **One home for every concept.**
  - **"Explain this" anywhere.**
- **`docs/2026-10-10-test-attack-qa-catalog.md`:** about 90 testing, debugging, red-team and QA methods across domains, each against Nexus, with what exists. **Verified there:** any web page can make guardian send a prompt through his agents (`Access-Control-Allow-Origin: *`, a plain-text body parsed as JSON). Idearium also allows any origin. That fix is SD15, first on the path.

## Tests

- `test-options` 6/6, including a live guardian: a plain-text write is refused with 415, and a JSON write is set, read back and recorded in the ledger.
- The Clear Glass probe is 30/30: the three desktop states, and the System tab reading, writing and refusing.
