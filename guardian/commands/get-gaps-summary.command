envelope: 1
uuid: nexus-export-command-get-gaps-summary
type: command
id: get-gaps-summary
context: >-
  guardian/commands — one real, live-extracted route (idiom: single). Regenerate this file by
  re-running this script if guardian/server.js's real dispatch changes — it is derived from the
  literal file text, not hand-maintained, so a stale copy is a real drift risk if server.js moves on
  and this file isn't regenerated.
intent: null
summary: null
system: guardian
tags:
  - guardian
  - command
  - single
exported_at: 1789239400886
source: guardian/lib/command-index-extract.js#extractCommandIndex()
payload:
  method: GET
  path: /gaps/summary
