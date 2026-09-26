# Clear Glass — first-class plugin system, real design

James, 2026-08-23: "build a first-class plugin system." Confirmed as the
right first move — TX13 alone has 6 substantial, empty capabilities
(passwords, downloads UI, zoom, webcam/audio, Whisper, per-site settings),
and building each as ad-hoc core code first means real, avoidable rework
later if any of them should have been a plugin.

Every real decision below is traced to something that already exists and
works in this codebase — not invented from nothing.

## 1. Manifest shape

Modeled directly on `UserscriptManager`'s real, working script shape
(`{ id, name, source, enabled, agentId, matches, persistent }`) —
same real fields where they mean the same thing, extended for a plugin's
larger real surface:

```js
{
  id:          'uuid, same crypto.randomUUID() convention already used everywhere this session',
  name:        'human name',
  version:     'semver string',
  entry:       'relative path to the plugin's real main.js',
  permissions: ['dom-access', 'network', 'filesystem', 'macro', 'rewind'],  // see §3
  enabled:     true,
  installedAt: timestamp,
}
```

## 2. Storage & lifecycle

Same real, on-disk convention `UserscriptManager` already uses —
`.clear-glass/plugins/<id>/` (manifest.json + the plugin's own real
files), not a new storage location invented for this. Lifecycle verbs
match the same real gate-naming convention already established
(`userscript.list/toggle/create/delete` →
`plugin.list/toggle/install/uninstall/reload`):

- `install(manifest, files)` — real, validates the manifest, writes to disk
- `enable(id)` / `disable(id)` — exactly `UserscriptManager.toggle()`'s
  real shape, reused, not reinvented
- `uninstall(id)` — real delete
- `reload(id)` — the real "hot-updatable" part of James's own ask;
  re-reads the plugin's real files from disk and re-runs its init
  without restarting Clear Glass

## 3. Permission model

Reuses `lib/tool-config.js`'s real, already-proven `{ allow, reason,
needsConfirm }` check shape — every real tool call in this whole
codebase already goes through this exact pattern; a plugin's calls
into real Clear Glass capability should go through the same one, not
a second, parallel permission system:

A plugin manifest declares which real capabilities it needs
(`dom-access`, `network`, `filesystem`, `macro`, `rewind`, ...). At
load time, each declared permission is checked the same way a tool
call already is. An undeclared capability is never silently granted —
matching this whole codebase's own repeated §1.2 discipline (loud,
specific failure, not a silent gap).

## 4. API surface — reusing the real, proven cross-process bridge

A plugin's own code should NOT get raw access to Electron internals —
matching the real reasoning `dom-archaeology.js`/`userscripts.js`/
`tab-visibility.js`/`provider-deploy.js` already established this
session (real, scoped HTTP routes on the wire server, not a direct
require into Electron internals). A plugin gets a real, curated `api`
object at init — `api.dom.query()`, `api.macro.run()`, etc. — each
method backed by the exact real, already-working route those 4 tools
already call, not new endpoints invented per plugin.

## 5. Where plugins run

Same real process as Clear Glass's own main process (matching TX1's
own real precedent — `copilot/bridge.js`'s direct cross-directory
require, "no IPC, no bridge process" — reused here for consistency,
not because sandboxing wasn't considered). Real, honest limit worth
stating plainly: this means a plugin is NOT sandboxed from the rest of
Clear Glass the way a real browser extension would be — the permission
check in §3 is a real, enforced gate, but it is a convention enforced
by the loader, not a hard process boundary. If real isolation
(a plugin literally cannot touch memory outside its own scope) is a
hard requirement, that changes §5 to a subprocess-per-plugin model —
a real, bigger, separate decision, not assumed away here.

## Real, honest scope for a first build

Given the size of this, real v1 scope: manifest validation, install/
enable/disable/uninstall/reload, the permission check wired to
tool-config's real pattern, and ONE real plugin built end-to-end to
prove the whole loop — not all of TX13 at once.

**§CORRECTED 2026-08-23** — James, correctly: "per-site settings, the
app menu, passwords, zoom, webcam, are normal browser features." Right
— these are baseline capability every browser has natively, not
optional, disable-able features someone would want as a plugin. Zoom
was the original first-plugin pick here; wrong for the same reason.
Those items now live in TX13 as real, native Clear Glass core, no
plugin needed, no dependency on this system at all.

The genuinely plugin-appropriate first target: the old Guardian
social-media listener pattern (Instagram/Threads DM detection,
`modules/base-module.js`'s `GuardianModule` class) — a real, working,
optional capability someone enables, not baseline chrome. Proves the
loop on the smallest real, self-contained surface before anything
harder (or anything genuinely ambiguous, like Whisper — TX15) is
attempted as a plugin.
