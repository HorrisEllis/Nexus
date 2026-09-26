'use strict';
/**
 * loom/maps/session-2026-08-14-map.js — maps the three genuinely NEW
 * components this session created (lib/agent-system/contracts.js, submit.js,
 * lib/loom-map.js) into LOOM's registry, closing the real orphan warning
 * scripts/precommit-check.js raised on commit 65239c0 (CLAUDE.md rule 3 /
 * AXIOMS §5.1 — "an unregistered hook is an orphan").
 * comp_id: nexus.loom.maps.session-2026-08-14
 * UUID: nexus-loom-map-session-20260814-v1-0000-2026-0814-001
 *
 * §SCOPE — the precommit warning also named cortex/intelligence/index.js,
 * cortex/liminal-space/index.js, and cortex/push-recall.js, but all three
 * are PRE-EXISTING files (only modified this session, not created) already
 * referenced in loom/maps/copilot-capability-map.js and
 * loom/maps/observability-map.js (grepped directly, confirmed) — treated
 * as a likely detection-pattern mismatch in the precommit script rather
 * than a real absence, and left out of this map rather than risking a
 * duplicate-id registration error against whatever already covers them.
 * Not re-verified beyond the grep given the person is waiting on this
 * build — flagged honestly as unconfirmed, not silently assumed fixed.
 *
 * Edges below are real require() calls, read directly from each file
 * (not recalled) — same discipline as warp-map.js/source-map.js.
 */

// [file, namespace.id, dir, requires (id of another component in THIS map or a known existing one)]
const FILES = [
  ['lib/agent-system/contracts.js', 'nexus.lib.agent-system.contracts', 'lib/agent-system', []],
  ['lib/agent-system/submit.js',    'nexus.lib.agent-system.submit',    'lib/agent-system', ['nexus.lib.agent-system.contracts']],
  ['lib/loom-map.js',               'nexus.lib.loom-map',               'lib',              []],

  // §ADDED 2026-08-17 — James: "make sure you are updating... loom
  // registry... to log all the history." Three real components had no
  // loom entry at all, under any id (checked directly, not assumed).
  ['lib/diagnostic-report.js',      'nexus.lib.diagnostic-report',      'lib', []],
  ['guardian/lib/ncp.js',           'nexus.guardian.lib.ncp',           'guardian/lib', []],
  ['guardian/lib/gap-hunter.js', 'nexus.guardian.lib.gap-hunter', 'guardian/lib', ['nexus.intelligence.gap.hunter']],
  ['intelligence/liminal-space/index.js', 'nexus.intelligence.liminal-space', 'intelligence/liminal-space', ['nexus.cortex.jaa-db', 'nexus.intelligence.domain-nodes']],
  ['clear-glass/src/userscripts/manager.js', 'nexus.clear-glass.userscripts.manager', 'clear-glass/src/userscripts', []],
  // §2026-08-23 — real, standalone HTTP bridge (:7704) proxying to
  // erosmancer-os's own real API (:7432) and clear-glass's IPC (:7702) —
  // confirmed by reading the file directly, not assumed from its name.
  ['clear-glass/wire/nexus-wire.js', 'nexus.clear-glass.wire.nexus-wire', 'clear-glass/wire', []],

  // §ADDED 2026-08-17b — TX10 (docs/clearglass-agent-suite-and-cfr-loom-
  // phasemap.spec), same standing instruction. Checked directly, not
  // assumed: copilot/lib/self-model.js (verifyAgentReachable/
  // navigateAgentToUrl live here) and lib/agent-tools/tools/sandbox/
  // cos-compartment.js are BOTH already registered (observability-map.js,
  // copilot-capability-map.js respectively) — those two functions are
  // additions to an already-registered file, not new components, correctly
  // left out. lib/agent-tools/tools/governance/spec-wizard.js genuinely
  // had no entry anywhere — confirmed by grep, not assumed. Its one real
  // require (nexus-client.js) has no findable registered id of its own,
  // left as [] rather than guessed, matching this file's own established
  // convention for unregistered dependencies.
  ['lib/agent-tools/tools/governance/spec-wizard.js', 'nexus.lib.agent-tools.governance.spec-wizard', 'lib/agent-tools/tools/governance', []],

  // §ADDED 2026-08-17c — found while merging the real "ledger wire + person
  // model" commit (e6dae51, cherry-picked from a parallel checkout). Its
  // own loom/maps/ledger-wire-person-model-map.js declares real wires
  // into nexus.lib.ledger-fanin, nexus.cortex.jaa-db, and nexus.lib.
  // component-ledger — three real, foundational, heavily-depended-on
  // files that had never been registered in THIS checkout's registry
  // under any id, confirmed by checking directly (not an id mismatch,
  // genuinely absent). Registered here so those real wires can resolve.
  ['lib/ledger-fanin.js',        'nexus.lib.ledger-fanin',        'lib',           []],
  ['cortex/memory/jaa-db.js',    'nexus.cortex.jaa-db',           'cortex/memory', []],
  ['bridge/causal/graph.js', 'nexus.bridge.causal.graph', 'bridge/causal', ['nexus.intelligence.cfr.graph']],
  ['bridge/index.js', 'nexus.bridge.index', 'bridge', ['nexus.intelligence.cfr']],
  // §2026-08-23 — the real HTTP server bridge/index.js wires in at boot
  // (createBridgeServer, Phase 5) — found genuinely unregistered while
  // fixing a real CORS bug in it.
  ['bridge/config.js', 'nexus.bridge.config', 'bridge', []],
  ['eravos/config.js', 'nexus.eravos.config', 'eravos', []],
  ['eravos/server.js', 'nexus.eravos.server', 'eravos', ['nexus.eravos.config']],
  ['bridge/server.js', 'nexus.bridge.server', 'bridge', ['nexus.bridge.index', 'nexus.bridge.config']],
  ['bridge/causal/expectation.js', 'nexus.bridge.causal.expectation', 'bridge/causal', ['nexus.intelligence.causal']],
  ['bridge/causal/projections.js', 'nexus.bridge.causal.projections', 'bridge/causal', ['nexus.intelligence.causal']],
  ['cortex/memory/causal-lookup.js', 'nexus.cortex.memory.causal-lookup', 'cortex/memory', ['nexus.intelligence.cfr.graph']],
  ['cortex/versionium/causality.js', 'nexus.cortex.versionium.causality', 'cortex/versionium', ['nexus.intelligence.cfr.graph']],
  ['lib/lenses.js', 'nexus.lib.lenses', 'lib', ['nexus.intelligence.cfr.sigma']],
  ['lib/component-ledger.js',    'nexus.lib.component-ledger',    'lib',           []],

  // §ADDED 2026-08-17d — the real consumer-side entry points the person-
  // model map's own CONSUMER_EDGES reference, also found genuinely
  // missing by checking directly, not assumed.
  ['autopilot.js',               'nexus.autopilot',               '.',      []],
  ['copilot/server.js',          'nexus.copilot.server',          'copilot', []],
  ['service/nexus-diagnostic.js','nexus.service.nexus-diagnostic','service', []],
  ['cos/kernel.js',              'nexus.cos.kernel',              'cos',     []],

  // §ADDED 2026-08-17e — GA3. guardian/server.js itself was found
  // genuinely unregistered under any id while adding its real tool-index
  // bridge routes (checked directly, not assumed). A real, significant,
  // pre-existing gap, not something this session's own work caused.
  // §2026-08-23 — real, centralized config, consolidating 9 real,
  // previously-scattered top-level constants. See guardian/config.js's
  // own header for the deliberate real scope limit (named-constant
  // consolidation only, not the many inline timeout literals scattered
  // through this file's route handlers — separate, larger work).
  ['guardian/config.js', 'nexus.guardian.config', 'guardian', []],
  // §2026-08-24 — found genuinely unregistered while fixing the real
  // flush-lock infinite-retry bug in this file. Zero real internal
  // dependencies of its own (only fs/path).
  ['guardian/jaa-store.js', 'nexus.guardian.jaa-store', 'guardian', []],
  ['idearium/config.js', 'nexus.idearium.config', 'idearium', []],
  ['architect/config.js', 'nexus.architect.config', 'architect', []],
  ['architect/service.js', 'nexus.architect.service', 'architect', ['nexus.architect.config']],
  ['emerge/config.js', 'nexus.emerge.config', 'emerge', []],
  ['emerge/emerge-ide.js', 'nexus.emerge.emerge-ide', 'emerge', ['nexus.emerge.config']],
  ['idearium/api/index.js', 'nexus.idearium.api', 'idearium/api', ['nexus.idearium.config']],
  ['guardian/server.js', 'nexus.guardian.server', 'guardian', ['nexus.guardian.config']],
  ['guardian/api-dispatch.js', 'nexus.guardian.api-dispatch', 'guardian', ['nexus.intelligence.liminal']],
  ['cortex/config.js', 'nexus.cortex.config', 'cortex', []],
  ['cortex/boot.js', 'nexus.cortex.boot', 'cortex', ['nexus.cortex.config']],

  // §ADDED 2026-08-17f — found genuinely unregistered while fixing 3 real
  // recency bugs in it (query() vs tail()).
  ['intelligence/index.js', 'nexus.intelligence', 'intelligence', ['nexus.intelligence.domain-nodes']],
  ['lib/uid/component-map.js', 'nexus.lib.uid.component-map', 'lib/uid', []],
  ['lib/event-types.js', 'nexus.lib.event-types', 'lib', []],

  // §ADDED 2026-08-17g — found unregistered while fixing its real,
  // significant disk/RAM-relevant bug (unbounded error log growth).
  ['clear-glass/src/diagnostic/error-capture.js', 'nexus.clear-glass.diagnostic.error-capture', 'clear-glass/src/diagnostic', []],

  // §ADDED 2026-08-18h — found unregistered while wiring the real,
  // opt-in escalation tool-access feature into it.
  ['guardian/ask.js', 'nexus.guardian.ask', 'guardian', []],

  // §ADDED 2026-08-18i — search_files, built this turn for the self-repair query capability.
  ['lib/agent-tools/tools/query/search-files.js', 'nexus.lib.agent-tools.query.search-files', 'lib/agent-tools/tools/query', []],

  // §ADDED 2026-08-18j — self_repair, the real propose/test/promote pipeline.
  ['lib/agent-tools/tools/sandbox/self-repair.js', 'nexus.lib.agent-tools.sandbox.self-repair', 'lib/agent-tools/tools/sandbox', []],

  // §ADDED 2026-08-18k — 3 real, tested modules integrated this pass
  // (wake-word listener, agent-to-agent chat, end-state goals). Real
  // requires checked directly per file, not guessed: agent-chat.js's
  // only top-level require is Node's own 'http' (not a real internal
  // NEXUS dependency, no edge); end-state.js's are 'crypto'/'fs'/'os'/
  // 'path' (same, no real internal edges); userscript-nexus-wake.js has
  // ZERO require() calls at all — confirmed by grep, expected for
  // browser-userscript code (no CommonJS in that context).
  ['lib/agent-chat.js', 'nexus.lib.agent-chat', 'lib', []],
  ['lib/end-state.js', 'nexus.lib.end-state', 'lib', []],
  ['guardian/userscript-nexus-wake.js', 'nexus.guardian.userscript.nexus-wake', 'guardian', []],

  // §ADDED 2026-08-18l — James: "build a compartment... interact with the
  // agents, and have that compartment be the output directory. then have
  // the agent use introspect to check nexus and improve it's own outputs...
  // co-pilot prompt the agent to introspect and iterate endlessly." Real
  // requires checked directly: agent-chat.js and end-state.js are both
  // ALREADY registered above (same file, reused not duplicated); self-
  // repair.js is registered separately under lib.agent-tools.sandbox.self-
  // repair (confirmed by grep before assuming it needed a second entry).
  ['lib/agent-build-loop.js', 'nexus.lib.agent-build-loop', 'lib',
    ['nexus.lib.agent-chat', 'nexus.lib.end-state', 'nexus.lib.agent-tools.sandbox.self-repair', 'nexus.lib.gap-field']],

  // §ADDED 2026-08-18k (agent-ids branch) — 6 real, foundational files
  // found genuinely unregistered under any id while doing this session's
  // own real work on them, confirmed by direct search, not assumed.
  //
  // §MERGE NOTE — copilot/lib/self-model.js below is registered here as
  // nexus.copilot.lib.self-model. A different checkout (this session,
  // earlier, different lineage — observability-map.js) already registers
  // the SAME real file as nexus.copilot.self-model (no '.lib.'). Both
  // real entries kept as-is by this merge, not silently deduplicated —
  // a genuine double-registration under two different ids for one real
  // file, surfaced honestly rather than decided unilaterally during a
  // merge. Worth a real look, not fixed here.
  ['lib/intent-classifier.js',       'nexus.lib.intent-classifier',       'lib',           []],
  ['cortex/core/raid/index.js',      'nexus.cortex.core.raid',            'cortex/core/raid', []],
  ['copilot/lib/self-model.js',      'nexus.copilot.lib.self-model',      'copilot/lib',   []],
  ['copilot/lib/grammar-router.js',  'nexus.copilot.lib.grammar-router',  'copilot/lib',   []],
  ['copilot/lifeline.js',            'nexus.copilot.lifeline',            'copilot',       []],
  ['ollama/server.js',               'nexus.ollama.server',               'ollama',        [
    'nexus.ollama.routes.system', 'nexus.ollama.routes.uploads', 'nexus.ollama.routes.stream',
    'nexus.ollama.routes.jobs', 'nexus.ollama.routes.queue', 'nexus.ollama.routes.models',
    'nexus.ollama.lib.state', 'nexus.ollama.lib.ollama-client', 'nexus.ollama.lib.dispatch', 'nexus.ollama.lib.http-utils',
  ]],
  // §DECOMPOSED 2026-08-28/wired 2026-08-29 — ollama/server.js went from
  // 693 to 106 lines, split into these 6 real route files + 4 real lib
  // files (same generic handle()->boolean dispatch contract this
  // session's copilot/routes/person-model.js extraction also uses — one
  // real pattern, not two differently-shaped refactors). Every edge
  // below verified against each file's REAL require() calls, not
  // guessed from filenames — an earlier pass at this got it wrong (a
  // narrower grep pattern silently missed most of the real requires,
  // making every route file look dependency-free when none of them
  // actually are), caught by re-running with the correct pattern before
  // committing anything inaccurate into the real component map.
  ['ollama/routes/system.js',        'nexus.ollama.routes.system',        'ollama/routes', ['nexus.ollama.config', 'nexus.ollama.lib.http-utils', 'nexus.ollama.lib.state']],
  ['ollama/routes/uploads.js',       'nexus.ollama.routes.uploads',       'ollama/routes', ['nexus.ollama.lib.http-utils', 'nexus.ollama.lib.state']],
  ['ollama/routes/stream.js',        'nexus.ollama.routes.stream',        'ollama/routes', ['nexus.ollama.config', 'nexus.ollama.lib.http-utils', 'nexus.ollama.lib.state']],
  ['ollama/routes/jobs.js',          'nexus.ollama.routes.jobs',          'ollama/routes', ['nexus.ollama.config', 'nexus.ollama.lib.dispatch', 'nexus.ollama.lib.http-utils', 'nexus.ollama.lib.ollama-client', 'nexus.ollama.lib.state']],
  ['ollama/routes/queue.js',         'nexus.ollama.routes.queue',         'ollama/routes', ['nexus.ollama.lib.http-utils', 'nexus.ollama.lib.state']],
  ['ollama/routes/models.js',        'nexus.ollama.routes.models',        'ollama/routes', ['nexus.ollama.config', 'nexus.ollama.lib.http-utils', 'nexus.ollama.lib.state']],
  // §REAL, notable cross-system edges found while verifying — lib/
  // dispatch.js is not ollama-internal-only, it reaches into
  // lib/seam/detector.js and 5 real warp/ files (Axiom, dispatch/
  // cascade, dispatch/index, dispatch/population, plugins/crystallizer-
  // flatfile). lib/ollama-client.js reaches into lib/agent-tools/index.js.
  // Both real, both confirmed by the actual require() calls, not
  // hypothetical — ollama's "sovereign system" framing (this file's own
  // header) doesn't mean isolated; it means not blocking Guardian.
  ['ollama/lib/dispatch.js',         'nexus.ollama.lib.dispatch',         'ollama/lib',    ['nexus.ollama.config', 'nexus.ollama.lib.ollama-client', 'nexus.ollama.lib.state', 'nexus.lib.seam.detector', 'nexus.warp.core.axiom', 'nexus.warp.dispatch.cascade', 'nexus.warp.dispatch.index', 'nexus.warp.dispatch.population', 'nexus.warp.plugins.crystallizer-flatfile']],
  ['ollama/lib/ollama-client.js',    'nexus.ollama.lib.ollama-client',    'ollama/lib',    ['nexus.ollama.config', 'nexus.ollama.lib.state', 'nexus.lib.agent-tools']],
  ['ollama/lib/state.js',            'nexus.ollama.lib.state',            'ollama/lib',    ['nexus.ollama.config']],
  ['ollama/lib/http-utils.js',       'nexus.ollama.lib.http-utils',       'ollama/lib',    []],
  // §2026-08-23 — real, centralized config (see ollama/config.js's own
  // header for the full real reason) and the hardware-fitted abliterated
  // model catalog it's paired with. No real dependencies of their own —
  // pure value/data files.
  ['ollama/config.js',               'nexus.ollama.config',               'ollama',        []],
  ['ollama/abliterated-catalog.js',  'nexus.ollama.abliterated-catalog',  'ollama',        []],

  // §ADDED 2026-08-18l (agent-ids branch) — a real, significant,
  // pre-existing gap: this file was genuinely unregistered under any id
  // despite being central to the whole hat/agent-switching system this
  // session built on.
  ['lib/hat-forge.js', 'nexus.lib.hat-forge', 'lib', []],

  // §ADDED 2026-08-19 — found genuinely unregistered by the precommit
  // hook while fixing suggestHat()'s real seedKey resolution bug. Real
  // requires checked directly: both dependencies already registered
  // above in this same file (self-model.js, intent-classifier.js) —
  // reused, not duplicated.
  ['lib/intent-hat-router.js', 'nexus.lib.intent-hat-router', 'lib',
    ['nexus.copilot.lib.self-model', 'nexus.lib.intent-classifier']],

  // §ADDED 2026-08-19 (nexus0822 branch) — the merged/extended "hey nexus"
  // agent-chat system's real tool wrapper. lib/agent-chat.js itself is
  // already registered above (line 105) — not re-added here, that would
  // be a genuine duplicate, checked and dropped during this merge rather
  // than carried forward blindly.
  ['lib/agent-tools/tools/coordination/agent-chat.js', 'nexus.lib.agent-tools.coordination.agent-chat', 'lib/agent-tools/tools/coordination', []],

  // §ADDED 2026-08-19b (nexus0822 branch) — pressure/intake subsystem,
  // tool-config governance ratchet, agent-reach, download-capture. Real,
  // merged, tested that turn.
  ['lib/pressure-window.js', 'nexus.lib.pressure-window', 'lib', []],
  ['lib/intake.js', 'nexus.lib.intake', 'lib', []],
  ['cli/pressure.js', 'nexus.cli.pressure', 'cli', []],
  ['lib/tool-config.js', 'nexus.lib.tool-config', 'lib', []],
  ['lib/agent-reach.js', 'nexus.lib.agent-reach', 'lib', []],
  ['lib/agent-tools/tools/governance/tool-config.js', 'nexus.lib.agent-tools.governance.tool-config', 'lib/agent-tools/tools/governance', []],
  ['clear-glass/src/providers/download-capture.js', 'nexus.clear-glass.providers.download-capture', 'clear-glass/src/providers', []],
  ['clear-glass/src/copilot/wake-relay.js', 'nexus.clear-glass.copilot.wake-relay', 'clear-glass/src/copilot', ['nexus.clear-glass.providers.host']],

  // §ADDED 2026-08-22 — 6 real files found genuinely unregistered by the
  // precommit hook after merging nexus0822/master. Real requires checked
  // directly per file, not guessed: copilot/registry-components.js and
  // all 4 provider userscripts have zero require() calls (browser-
  // context code, same as guardian/userscript-nexus-wake.js above);
  // lib/work-queue.js's only top-level require is Node's own 'os' (no
  // real internal edge); lib/introspect.js's real dependencies
  // (component-ledger.js, among others) are all lazy/dynamic requires
  // inside functions, not static top-level ones, so no edge is asserted
  // rather than guessed at which of several dynamic paths is "the" one.
  ['copilot/registry-components.js', 'nexus.copilot.registry-components', 'copilot', []],
  ['guardian/userscript-chatgpt.js', 'nexus.guardian.userscript.chatgpt', 'guardian', []],
  ['guardian/userscript-claude.js', 'nexus.guardian.userscript.claude', 'guardian', []],
  ['guardian/nexus-hey-claude.user.js', 'nexus.guardian.nexus-hey-claude', 'guardian', ['nexus.guardian.userscript.claude']],
  ['guardian/userscript-gemini.js', 'nexus.guardian.userscript.gemini', 'guardian', []],
  ['guardian/userscript-perplexity.js', 'nexus.guardian.userscript.perplexity', 'guardian', []],
  ['lib/introspect.js', 'nexus.lib.introspect', 'lib', []],
  ['lib/work-queue.js', 'nexus.lib.work-queue', 'lib', []],

  // §ADDED 2026-09-01 — §VERSIONIUM MIGRATION. precommit-check.js flagged
  // both as orphans after this session's real edits to them (CLAUDE.md
  // rule 3). Checked directly, not assumed: cortex/versionium/index.js
  // requires cortex/memory/jaa-db.js (already registered elsewhere as
  // nexus.cortex.jaa-db, same id loom/maps/session-2026-08-14-map.js's
  // own liminal-space entry above already references) and
  // intelligence/rfr2/{kernel,compress,context} (no findable registered
  // id for those three individually — left out rather than guessed,
  // same convention as spec-wizard.js above). versionium-commit.js's one
  // real require (lib/nexus-client.js) has no registered id either, same
  // honest gap.
  ['cortex/versionium/index.js', 'nexus.cortex.versionium', 'cortex/versionium', ['nexus.cortex.jaa-db']],
  ['lib/agent-tools/tools/governance/versionium-commit.js', 'nexus.lib.agent-tools.governance.versionium-commit', 'lib/agent-tools/tools/governance', []],

  // §ADDED 2026-09-02 — §AM1. precommit-check.js flagged this as an
  // orphan after this session's own commit added it (CLAUDE.md rule 3).
  // Real dependency: checkAgentIntentContract() requires lib/hat-forge.js
  // directly — no registered id found for hat-forge itself (checked, not
  // assumed; hat-forge predates this map file and was never added to it
  // either — a separate, pre-existing gap, not fixed here).
  ['lib/agent-intent-contract.js', 'nexus.lib.agent-intent-contract', 'lib', []],

  // §ADDED 2026-09-02 — §VS1. James: "map it in looms system map."
  // versionium promoted from a library embedded in cortex to its own
  // real sovereign system (docs/2026-09-02-versionium-sovereign-and-
  // cleanup-phasemap.spec) — every real file below is new this pass,
  // registered the same way this map already registers every other
  // real file it tracks, dependencies matched to each file's own real
  // require() calls, not guessed.
  ['versionium/config.js',                   'nexus.versionium.config',              'versionium',       []],
  ['versionium/lib/store.js',                'nexus.versionium.lib.store',           'versionium/lib',   ['nexus.versionium.config']],
  ['versionium/lib/http-utils.js',           'nexus.versionium.lib.http-utils',      'versionium/lib',   []],
  ['versionium/lib/engine.js',               'nexus.versionium.lib.engine',          'versionium/lib',   ['nexus.versionium.lib.store', 'nexus.versionium.config']],
  ['versionium/lib/causality.js',            'nexus.versionium.lib.causality',       'versionium/lib',   ['nexus.versionium.lib.store']],
  ['versionium/lib/migrate-legacy-data.js',  'nexus.versionium.lib.migrate-legacy-data', 'versionium/lib', ['nexus.versionium.lib.store']],
  ['versionium/registry-components.js',      'nexus.versionium.registry',            'versionium',       []],
  ['versionium/event-taxonomy.js',           'nexus.versionium.event-taxonomy',      'versionium',       []],
  ['versionium/routes/system.js',            'nexus.versionium.routes.system',       'versionium/routes', ['nexus.versionium.config', 'nexus.versionium.lib.http-utils', 'nexus.versionium.registry']],
  ['versionium/routes/versionium.js',        'nexus.versionium.routes.versionium',   'versionium/routes', ['nexus.versionium.lib.engine', 'nexus.versionium.lib.store', 'nexus.versionium.lib.http-utils']],
  ['versionium/server.js',                   'nexus.versionium.server',              'versionium',       ['nexus.versionium.config', 'nexus.versionium.lib.engine', 'nexus.versionium.lib.causality', 'nexus.versionium.lib.http-utils', 'nexus.versionium.lib.migrate-legacy-data', 'nexus.versionium.routes.system', 'nexus.versionium.routes.versionium']],

  // §ADDED 2026-09-02 — precommit-check.js flagged this as a real,
  // pre-existing orphan (CLAUDE.md rule 3) once this session's deepseek
  // addition touched the file — genuinely never registered before,
  // not a regression from that edit. No real dependency of its own
  // (checked directly: only requires cortex/memory/jaa-db.js, already
  // covered elsewhere in this map under nexus.cortex.jaa-db).
  ['lib/account-registry.js', 'nexus.lib.account-registry', 'lib', ['nexus.cortex.jaa-db']],

  // §ADDED 2026-09-02 — precommit-check.js flagged both as real
  // orphans (CLAUDE.md rule 3) once this session's embedding-pipeline
  // fix touched them. Genuinely never registered before.
  ['lib/local-vector-index.js', 'nexus.lib.local-vector-index', 'lib', []],
  ['lib/vector-memory.js', 'nexus.lib.vector-memory', 'lib', ['nexus.lib.local-vector-index', 'nexus.cortex.jaa-db']],

  // §ADDED 2026-09-02 — precommit-check.js flagged both as real
  // orphans (CLAUDE.md rule 3) while reconciling a parallel session's
  // work into this tree. cortex/self-heal/fault-taxonomy.js (a sibling
  // file) was already registered; the main module itself never was.
  ['cortex/core/raid/contract-boundary.js', 'nexus.cortex.core.raid.contract-boundary', 'cortex/core/raid', []],
  ['cortex/self-heal/index.js', 'nexus.cortex.self-heal', 'cortex/self-heal', ['nexus.cortex.self-heal.fault-taxonomy', 'nexus.cortex.core.raid.contract-intake']],

  // §ADDED 2026-09-02 — guardian/server.js decomposition, wired this
  // session (commit 91b2c46). Five real, new components; precommit-
  // check.js flagged all five as orphans (CLAUDE.md rule 3) on commit.
  // Edges are the real require()/injected-dependency relationships read
  // directly from each file. guardian/lib/dispatch-pool.js is dispatcher's
  // real dependency too but has no loom entry anywhere in this repo under
  // any id (checked directly) — a pre-existing gap, not introduced here,
  // left out rather than inventing an id for it.
  ['guardian/lib/jobs.js', 'nexus.guardian.lib.jobs', 'guardian/lib',
    ['nexus.lib.intent-hat-router', 'nexus.lib.hat-forge']],
  ['guardian/lib/provider-routing.js', 'nexus.guardian.lib.provider-routing', 'guardian/lib', []],
  ['guardian/lib/dispatcher.js', 'nexus.guardian.lib.dispatcher', 'guardian/lib', []],
  ['guardian/lib/dispatch-pool-bridge.js', 'nexus.guardian.lib.dispatch-pool-bridge', 'guardian/lib', []],
  ['guardian/lib/index.js', 'nexus.guardian.lib.lib-index', 'guardian/lib',
    ['nexus.guardian.lib.jobs', 'nexus.guardian.lib.provider-routing', 'nexus.guardian.lib.dispatcher', 'nexus.guardian.lib.dispatch-pool-bridge']],

  // §ADDED 2026-09-02 — guardian's NCP protocol handler, the largest
  // remaining piece of the same server.js decomposition (see the guardian
  // decomposition entries just above). Requires GapHunter/Detector
  // directly (real, stateless utility modules — both already registered
  // under these ids); jaa/physQueue/baseline/evLedger/activeQueues and the
  // still-inline extractCodeBlocks/extractToolCallsFromDOM/
  // findActiveSeamCompartment stay injected dependencies from server.js,
  // not requires, so this map doesn't claim edges to things this file
  // doesn't actually require.
  ['guardian/lib/ncp-handler.js', 'nexus.guardian.lib.ncp-handler', 'guardian/lib',
    ['nexus.intelligence.gap.hunter', 'nexus.lib.seam.detector']],
  // guardian/lib/artifact-namer.js really does require('../spec-namer') —
  // no edge claimed to it because guardian/spec-namer.js itself has no
  // registered component id anywhere in loom yet (checked, pre-existing
  // gap, not introduced here — separate from this fix's scope).
  ['guardian/lib/artifact-namer.js', 'nexus.guardian.lib.artifact-namer', 'guardian/lib', []],
  // §2026-09-03 checkpoint (commit a0bebe4) — registering the 6 files
  // precommit-check.js flagged as loom orphans after that commit landed.
  // All 6 are real, already registered in their owning system's .spec
  // (guardian.spec/idearium.spec/etc.) — this is the separate loom-map
  // registration CLAUDE.md rule 3 requires, not a second source of truth.
  ['guardian/routes/autonomous-loop.js', 'nexus.guardian.routes.autonomous-loop', 'guardian/routes',
    ['nexus.lib.autonomous-loop']],
  // guardian/routes/mesh.js removed 2026-09-03 — relocated to
  // clear-glass/src/network/routes.js (see that folder's install.js
  // header). Not re-added here; clear-glass has its own registration
  // convention this map doesn't cover.
  ['lib/autonomous-loop.js', 'nexus.lib.autonomous-loop', 'lib', []],
  ['lib/project-compartment.js', 'nexus.lib.project-compartment', 'lib', []],
  ['lib/dynamic-project-parser.js', 'nexus.lib.dynamic-project-parser', 'lib',
    ['nexus.lib.project-compartment', 'nexus.lib.spec-from-markdown']],
  ['lib/spec-from-markdown.js', 'nexus.lib.spec-from-markdown', 'lib', []],
  ['lib/node-export.js', 'nexus.lib.node-export', 'lib', []],
  ['lib/node-schemas.js', 'nexus.lib.node-schemas', 'lib',
    ['nexus.lib.hat-forge']],
  ['lib/self-build-loop.js', 'nexus.lib.self-build-loop', 'lib', []],
  // run-closed-loop.js is a tool file (module.exports =
  // {name,description,parameters,execute}), not a component in this
  // map's sense — its real registration point is lib/agent-tools/
  // index.js's tool registry (checked: it's already there). Not added
  // here to avoid a second, conflicting registration for the same file.

  // §BRAINOS 2026-09-03 — James: "Just do BrainOS." First real slice,
  // built against docs/brainos-live-control-panel.spec. Client-side
  // widget, no server component (see nexus/ui/brainos/brainos-
  // interaction-contract.json's own honest scope note) — registered
  // here anyway per this session's own established discipline that
  // every new file gets a real loom entry, code or UI alike.
  ['nexus/ui/brainos/brainos.js', 'nexus.ui.brainos.panel', 'nexus/ui/brainos', []],
  ['nexus/ui/brainos/brainos-canvas.js', 'nexus.ui.brainos.canvas', 'nexus/ui/brainos', ['nexus.ui.brainos.panel']],

  // §COMMAND-INDEX 2026-09-03 — docs/command-index-per-system.spec's
  // real build_order, phases 2-4 (phase 1 idearium, phase 5 clear-glass
  // were already DONE before this session touched them).
  ['ollama/lib/command-index.js', 'nexus.ollama.command-index', 'ollama/lib', []],
  ['guardian/lib/command-index-extract.js', 'nexus.guardian.command-index', 'guardian/lib', []],
  ['bridge/lib/command-index-extract.js', 'nexus.bridge.command-index', 'bridge/lib', []],

  // §RAID-AGENT-NODES 2026-09-11 — James: "populate real .agent node
  // instances from RAID's live health data... also deepseek... get
  // raid solid. enterprise grade." Same family as generate-tool-nodes.js
  // (lib/agent-tools/, exports {generate,checkDrift,startDriftListener},
  // not a tool-registry file — see the run-closed-loop.js note above for
  // why tool-shaped files register in lib/agent-tools/index.js instead
  // and don't belong here). Depends on lib/node-export.js (exportToFile)
  // and cortex/core/raid/index.js (its real _health/HEALTH_KEY source).
  ['lib/agent-tools/generate-agent-nodes.js', 'nexus.lib.agent-tools.generate-agent-nodes', 'lib/agent-tools',
    ['nexus.lib.node-export']],
];
function mapSession20260814(driver) {
  const results = { components: [], hooks: [], wires: [], failures: [] };

  // Pass 1 — components. dir is SB1's own new field (this session,
  // 2026-08-14) — using it here is the first real registration to exercise
  // it outside schema.test.js's synthetic cases.
  for (const [file, id, dir] of FILES) {
    const r = driver.declare('component', {
      id, namespace: 'lib', name: file, version: '1.0.0', dir,
      uuid: `nexus-loom-map-${id}-v1-0000-2026-0814-001`,
    });
    (r.ok ? results.components : results.failures).push({ id, r });
  }

  const requiredBy = new Set();
  for (const [, , , requires] of FILES) for (const dep of requires) requiredBy.add(dep);

  // Pass 2 — hooks
  for (const [, id, , requires] of FILES) {
    if (requiredBy.has(id)) {
      const r = driver.declare('hook', {
        id: `${id}.export`, component_id: id, name: 'export', type: 'direct', direction: 'out',
        uuid: `nexus-loom-map-${id}-export-v1-0000-2026-0814-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.export`, r });
    }
    if (requires.length > 0) {
      const r = driver.declare('hook', {
        id: `${id}.import`, component_id: id, name: 'import', type: 'direct', direction: 'in',
        uuid: `nexus-loom-map-${id}-import-v1-0000-2026-0814-001`,
      });
      (r.ok ? results.hooks : results.failures).push({ id: `${id}.import`, r });
    }
  }

  // Pass 3 — wires. type + intent both set (SB1 additive fields, exercised
  // for real here rather than only in synthetic tests).
  let wireN = 0;
  for (const [, id, , requires] of FILES) {
    for (const dep of requires) {
      wireN++;
      const r = driver.declare('wire', {
        id: `session-2026-08-14.wire.${wireN}.${dep}--${id}`,
        from_hook_id: `${dep}.export`, to_hook_id: `${id}.import`,
        type: 'direct-call', intent: `${id} requires ${dep}`,
        uuid: `nexus-loom-map-wire-${wireN}-v1-0000-2026-0814-001`,
      });
      (r.ok ? results.wires : results.failures).push({ from: dep, to: id, r });
    }
  }

  return results;
}

module.exports = { mapSession20260814, FILES };
