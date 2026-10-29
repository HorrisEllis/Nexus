# 0.60.282 — the Snowflake step turns Snowflake on

James, 2026-10-29: "can 't you have it turn on the snowflake?"

He said this after 0.60.281. In that release, a macro or workflow Snowflake step refused whenever the Snowflake plugin was off.

## What changed (clear-glass/src/net/step.js)
His words can be read two ways. Both are done; this is the coder's reading, **to confirm**:
- **The plugin.** A step that finds the Snowflake plugin off turns it on, the way the 🧩 panel does (`plugins:enable`).
  - It stays on after a restart.
  - The result says `pluginTurnedOn: true`.
  - `turnOn: false` refuses instead, as before.
- **The transport.** Routing a site now starts Snowflake when it is off.
  - Why: a site routed through a transport that is off is blocked, never sent direct.
  - The result says `startedTransport`.
  - `start: false` leaves it off.
- **When it cannot.** A turn-on that does not take, or a plugin that is not installed, is said.

## Open
- His message went on "what about combining the" and was cut off. Asked.

## Proof
- `test-snowflake-steps` 5/5. SF-05 is new.
