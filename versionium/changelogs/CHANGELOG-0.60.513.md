# 0.60.513 -- a real, persisted ErosmancerOS autostart option

James, 2026-11-13: "can you add an autostart option with erosmanceros?" (from Settings > ErosmancerOS > Workbench, shown disconnected,
EROS_AUTOSTART=0).

## Built
- clear-glass/src/options/store.js: DEFAULTS.eros.autostart (default true, matching today's behaviour), and NexusOptions.decideErosAutostart
  (envVar, optionAutostart) -- a pure, extracted precedence function: EROS_AUTOSTART wins when explicitly '0' or '1' (nothing already
  scripting it changes); otherwise the persisted option decides.
- clear-glass/src/main/index.js: the real boot decision (section 14.4) calls it; GET /eros-supervisor now reports autostartOption and why
  (when that is the reason nothing is running); POST /eros-supervisor/autostart persists a change for the next launch.
- clear-glass/renderer/settings/sections/eros.js: a real toggle under Settings > ErosmancerOS, wired to the route, naming the env var's
  override when it is in force.

## Found and fixed along the way -- real, urgent
tests/modules/nexus-options-autoboot.test.js's isolation (process.env.HOME alone) has been a no-op on this machine: store.js's real
storage is JaaKV, resolved from CG_JAA_DIR; its one-time legacy-file import path reads APPDATA before HOME; both are always set on
Windows. An early, unpatched run of the new eros-autostart test wrote test values into this machine's REAL Clear Glass options store
(confirmed directly: eros: {autostart:false, someOtherFutureKey:"kept"}). Repaired by hand immediately, then verified clean -- every
other real option (accounts, autoStartOnBoot, listeners, etc.) was checked and is untouched. Both test files now isolate CG_JAA_DIR (and
APPDATA, where the legacy-import tests need it) as well as HOME, restored at the end.

## Proof
tests/modules/clear-glass-eros-autostart.test.js, 13/13 (new). tests/modules/nexus-options-autoboot.test.js, 18/18 (2 of its migration
tests were silently never exercised correctly before this fix; both now pass for real).

## Not done, said
- No test reaches main/index.js's boot sequence itself (needs a full Electron environment); the precedence logic it calls is tested directly instead, and the call site is checked by a source match.
- In Versionium (§17.12): vtm-6d955198.
