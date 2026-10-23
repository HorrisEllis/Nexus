# 0.60.218 — ClearDriver, Agent Mesh and Guardian settings (SP4)

James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
Cleardriver, agentmesh and guardian setting."

Owned by: clear-glass/spec/site-profile.spec MOD-SP-GLOBAL (dated addendum) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP4.

## What stands on what
- The options store Clear Glass already had holds the new settings.
- The per-site keys fall back to these settings (0.60.215). The driver and Guardian already read them through the site resolver (0.60.216),
  so they needed no new code.
- Each default is today's constant (decision SP_D2), so nothing changes until he changes it. A site's own choice in Site settings wins over
  these.

## Built
- **Settings › ClearDriver** (new):
  - whether agents may drive sites;
  - the navigate timeout (was a fixed 30 s);
  - the wait timeout (was a fixed 10 s).

  The bounds come from the same key table that checks a site's own value, so the two never disagree. An out-of-range value is refused, with
  the reason, and put back.
- **Settings › Guardian** (new):
  - page listeners on or off;
  - chat capture on or off;
  - listener decay. That setting has existed since 0.39.265 but had no control until now.
- **Agent mesh › "When a task fails"**:
  - how many tries each strategy gets (was a fixed 2);
  - the wait before each strategy: retry, respawn, fallback, diagnostic (was a fixed 1, 3, 8 and 15 s).

  The mesh reads these at each failure, so a change applies to the next one. A bad value isn't used; the old constant is, and the reason is
  given.

## Not done, said
- The drain's order of strategies stays fixed: retry, respawn, fallback, then diagnostic. What's set is the tries and the waits.
- Guardian's section doesn't include "the provider host". Its controls are already in the agents hub and Providers & accounts.

## Proof
- `test-global-settings`: 5/5.
  - GS-01: the defaults equal today's constants.
  - GS-02: a real mesh failure uses the option's wait, and a bad value says why.
  - GS-03: the global navigate timeout is the one used (1.2 s). "Agents may drive no site" refuses an agent, unless the site allows it.
  - GS-04: Guardian listening off everywhere, unless the site says listen.
  - GS-05: the three screens in Clear Glass save through `options.set`, and out-of-range values are refused.
