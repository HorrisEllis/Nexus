# 0.60.503 — each system's map, generated from its own folder, in Emerge (SW1 slice a)

James, 2026-11-13: "comtinue to the registry." His decision SW_D2: "Basically looms map but per system and it's in charge of its own map."
And the same day: "Each primitive/capabity should be its own file. The core file being either the foundation or the pillars." · "Like isn't
pillar the replacement to lib"

## Built
- `pillar/map/map.eg` (one capability, one file): `map_of(root, system)` reads ONE system's folder and returns
  `{ system, files, routes, events, crossings: [{ to, count }], commands, fingerprint }`. It writes nothing.
  Read by text, since Emerge has no capturing regular expression yet: a route is a string after `=== ` starting with `/`; an event is the
  first string given to `emit(`; a crossing is a `require('./…' or '../…')` that leaves the system's folder, each file-to-file pair once.
- `pillar/pillar.eg`: a new in hook, `map`; `pillar/cli.eg`: `eg run pillar/cli.eg map <root> <system>` sends to it.
- `emerge/emerge/lang/runtime.js`: `is_dir`, so a walk can tell a folder from a file. `emerge/emerge.cos` relocked.

## Proof
- `pillar/test/map.test.eg` 4/4; Pillar's tests 4/4, 5/5, 5/5; `tests/modules/test-pillar.test.js` 5/5, `test-pillar-conform` 3/3.
- The 14 systems mapped twice: the same fingerprint 14 of 14; the whole tree in under 8 seconds.
- Versionium's 19 routes equal a plain grep; Guardian's 49 command nodes equal the scorecard; Guardian's 10 reaches into Intelligence and
  Versionium's (Cortex 5, Intelligence 4, lib 10) equal lib/system-boundary.js's census.

## Not done, said
- Slice b: each `server.js` keeping its own map in its own folder and serving `GET /api/<system>/registry`; the routes found against
  `registry-components.js` declared.
- Not seen: a route matched by a regular expression in the code, a computed require, an event named by a variable.
- Reaches between systems total 160 by this map against the census's 150 measured earlier the same day: not traced.
- His question, the compartment's file: today `<system>.cos` (his "use .cos"), else `compartment.json`. Whether the `.spec` becomes it is his.
- In Versionium (§17.12): vtm-26e189df, recorded as 0.60.502 before the renumbering (main took 0.60.502 for CIE13 slice a while this was unpushed).
