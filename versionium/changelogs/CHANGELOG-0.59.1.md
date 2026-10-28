# 0.59.1 — 2026-10-10

James: "deepseek is absent." · "all of the over 1000 specs, map onto whats done, and what isn't or make a tool to check." · "i need you to look at my inputs today and give me somewhere for them to land"

## DeepSeek was missing from the agent lists

The DeepSeek userscript was wired into Clear Glass and Guardian, but more than ten places kept their own hard-coded list of agents without it. That included the copilot agent picker in the main UI (`ui/tv-shell/index.html` and `menu.js`), copilot's lifeline, `lib/agent-chat.js`, RAID's routing IR, the capability profile, the router's fallback order, the tool-node generator, Guardian's `/providers` fallback and the cockpit.

- **Fixed:** the Node lists now read `lib/agent-providers.js` (the Guardian userscripts are the one source), and the page lists name every agent.
- **New check, `tests/modules/test-provider-lists.test.js`:** fails whenever a list naming three or more agents misses one.
  - Deliberate subsets are marked `provider-list: chosen` on their line (a hat's allowed agents, the build chain without Perplexity).
  - Comments are skipped.

## The census: every spec and phase checked against the tree

`lib/spec-census.js`, available as `idearium census` and `GET /api/census`, is read-only.
- **Phases:** each phase's status is checked against its own evidence: the tests it names (do they exist, are they registered), the versions it names (were they released) and the files it names.
- **Specs:** every non-phasemap spec is checked against the code it names.
- **First run:** 1,232 phases (253 verified, 234 claimed with no test or release found, 9 marked done whose files are gone, 116 open, 563 on the shelf, 54 closed). 224 specs (96 built, 42 partial, 27 unbuilt, 59 documents only), 53 of them not in SPEC-REGISTRY.
- **Report:** `docs/census/spec-census.md`.

## Inbox

`docs/inbox-2026-10-10.md` lists everything said today: shipped, specced, or where the unplaced ideas should go.
