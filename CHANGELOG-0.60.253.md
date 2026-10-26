# 0.60.253 — ErosmancerOS hooked into Snowflake, the accounts manager and the DOM mutator; the co-pilot reaches Guardian

James, 2026-10-25: "can you hook erosmanceros into snowflake, accounts manager, and the dom mutator."

Map: `docs/2026-10-25-erosmancer-hooks-phasemap.spec` (ER1–ER4).

The coder's reading, to confirm. ErosmancerOS is the engine that drives Clear Glass's tabs with human-paced input. It should be able to:
- drive a page that goes through Snowflake;
- drive a page as one of his accounts, signed in, at that account's own pace;
- be what the DOM mutator types with when asked, so a value is typed like a person instead of set.

## What was wrong, read in the code (§0.1)
- **Eros could drive the wrong page.** The wire picked Eros's tab by an exact URL match, else the first tab, and kept that choice for
  the agent forever. After any navigation, or with two tabs open, its clicks and keys went to the wrong page.
- **Eros's own tabs were anonymous.** Eros opens tabs (`POST /api/tabs`) in Clear Glass's default browser context, so they were never
  signed in as an account and never on Snowflake's forced session.
- **The DOM mutator never reached Eros.** A value was always set, never typed.
- **Found on the way: the agents' `dom_mutate` never worked.** `browser_action` documents it as `{selector, value}` and sends exactly
  that, but the mutator read only `mutation`. The page got `mutate(cgId, undefined)` and threw, and the agent's call timed out. Macro
  `dom_mutate` steps failed the same way.

## What changed
- **ER1, the right tab or none.** `clear-glass/src/eros/tab-match.js`.
  - `pickTarget` matches the agent's page by its URL and its title.
  - `resolveTab` breaks a tie by stamping a one-time marker into that page and reading it back through Eros. The cached choice is
    re-checked against the page's URL on every call.
  - No match is an error that names the agent.
  - The wire, the pointer, and `/bridge/driver` all use it.
- **ER2, Snowflake and accounts.** `POST /cli/eros/open { url, via, accountId? }`. Clear Glass opens the page through the door that owns
  its session, then Eros attaches to exactly that page:
  - Snowflake: `_netOpenVia`, the transport's forced session.
  - An account: an `acct-<id>` window in the account's own session, with its sign-in restored.
  - Plain: an ordinary agent window.

  The pace is per account:
  - `erosProfile` on the account: precise, cautious, exploratory or turbo; null clears it.
  - It is set on Eros's session for that page.
  - Eros's `/api/input` now takes `profile`: every wait in the pointer path and between keystrokes scales by it (cautious 1.6×,
    turbo 0.4×).

  `GET /cli/eros/tabs` shows which agent each Eros tab is.
- **ER3, the DOM mutator types through Eros.** `handleMutate({ …, via: 'eros' })`.
  - The DOM mesh's new `prepareType` scrolls the field into view, focuses it, empties it, and gives its centre.
  - Eros then clicks there and types the value, one character at a time, at the account's pace.
  - Only the value is typed. text, html, style, attrs and remove are still applied natively.
  - If Eros is missing, the call fails and says so. Nothing is set instead.
  - The `{selector, value}` shorthand now works for every caller.
- **ER4, every door.**
  - Rows: `eros open <url> [--snowflake | --account <id>]`, `eros tabs`, `eros pace <accountId> <pace|default>`.
  - Co-pilot tools: `eros.open` and `eros.tabs`. `dom.mutate` now takes `via`.
  - The agents' `browser_action` description names `via:"eros"`.
  - Settings › Accounts: each account has an "Eros:" pace select.
  - Loom edges.

## LG1 — the co-pilot reaches Guardian
James, 2026-10-25: "its not hooked into guardian. look at idearium". He sent it with his co-pilot pane:
- "fill this out for me" ran the gig fill with no model (0.60.251), and asked for the offer line.
- "try again" got "Both Ollama and Guardian are unavailable. Check system health." Guardian was up, passing 12/12.

**What was wrong:**
- Clear Glass starts provider tabs on first use ("NCP auto-boot: skipped (lazy-only …)"), so no tab is connected at the first ask.
- `copilot/lifeline.js` `_tryGuardian` read that as "nothing can answer" and refused without dispatching.
- Then the lifeline replaced the reason with "Both … unavailable".
- Idearium's repo agents never hit this, because their `agentId` makes Guardian's dispatcher open the tab.

**What changed:**
- The lifeline uses the same door his CL1 call (0.60.231) built for a person's pick: `openTab`. The dispatcher asks Clear Glass for the
  tab, the job waits up to two minutes, and it goes when the tab connects.
- A final failure now names Ollama's reason and Guardian's.
- Kept (§0.3): `noOpenTab` keeps the 2026-07-09 fail-closed rule for a caller that wants it. Its test (T-006) still runs; T-006b holds the
  new default. lifeline-fluid-routing 7/7; lifeline ask, contracts, fault-logging, guardian-timeout and ollama-dispatch all still pass.

**From his log, not fixed here:**
- Free memory fell to 1–1.4% ("pressure -> critical") a few minutes after boot, with Clear Glass, Ollama and every system running. Ollama
  answering "unavailable" fits that.
- ErosmancerOS logged "Evicted 0 nodes for tab …" about 60 times in a minute. Targets are being created and destroyed. To trace.
- The orchestrator reads ErosmancerOS's contract and gets its HTML page ("invalid JSON: '<!DOCTYPE'"). Eros has no /contract route.

## Proof
`tests/modules/test-eros-hooks.test.js` 6/6:
- tab matching;
- the resolver against a fake Eros and webContents (the tie-break, re-finding after a navigation, the pace, "none" named);
- `prepareType` in a real page driven in Clear Glass (glass.js);
- the typed mutation, and the refusal when Eros is missing;
- the shorthand;
- the account's pace;
- the wiring.

The TypeScript change compiles: `tsc --noEmit` shows no new errors, only the tsconfig's existing rootDir notices, the same as on the base.

## Not proven here
- A live Eros typing into a live Clear Glass page. There is no display in this container.
- The Accounts pace select on screen (checked in its source, not driven).
- Eros through a live Snowflake circuit.

## Open
1. The Snowflake plugin's own page has no "Open with ErosmancerOS" row yet. The door is `eros open --snowflake` and `eros.open`.
2. Autofill could type through Eros for a site that refuses set values (an `autofill fill --human` option). Not built: say if wanted.
