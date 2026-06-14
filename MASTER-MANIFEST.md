# NEXUS — Master Baseline (reconciled)
Built: merge of zip-7 trunk + 6 features from the UID/tutorial/harness line.
This is now the SINGLE source of truth. Build forward from this only.

## From zip-7 trunk (preserved, untouched)
- auth/ — RSA-2048 + AES-256-GCM + SNR-gate authentication, hotswappable
    policy.json, remote client (auth/client.js), clients/ + sessions/ dirs
- lib/file-push.js — drag-and-drop file routing, local + peer push
- lib/contract-handshake.js — per-system contract path fixes
- orchestrator.js — /api/api-map, /api/channels, /api/cli aggregators;
    serves ui/home/index.html (canonical) -> ui/orchestrator/index.html (fallback)
- human-readable client output formatting

## Merged in (the 6 features that kept getting lost to drift)
1+2. lib/uid/normalize.js + migrate.js — UID addressing backbone.
     Normalizes any UUID format -> canonical, alias ledger so nothing breaks.
     Addressable conformance 0% -> 92% (proven on this tree).
     THIS is what the intent-map walks. resolveAny(uuid) -> component -> intent.
3.   tutorial/wizard.js + server.js — first-start wizard (CLI + web).
     Explains -> verifies live -> self-repairs. End-to-end run = integration test.
4.   cortex/test/harness.js — self-adversarial harness (L1-L5),
     absorbs found faults into fault_taxonomy, re-runs as regression.
5.   RAID consultation seam:
     - admin-server.js: registerRaid() + GET /api/raid/decide
     - boot.js: registers raid module with admin server in organ loop
     - guardian/server.js: chooseProvider() consults RAID before dispatch
       (+ fixed pre-existing positional createJob bug)
6.   admin-server.js: GET /api/events fix — honors ?limit= and ?type=
     (was silently capped at 50, filter dropped). Found by the harness.

## Verified
- All edited files: node --check pass
- UID migration: 92% addressable conformance on this tree
- zip-7 work (auth, file-push, api-map) confirmed intact post-merge
- async dispatch enclosure confirmed (chooseProvider await is valid)

## The intent-map path is now unblocked
orchestrator /api/api-map (exists) + UID backbone (merged) + per-seam intent
(next gap) = the map-driven orchestrator UI you want. Build that next.

## Gap 2 — the intent-map (built on the UID backbone)
- lib/intent-map.js — 17 interaction points tagged with human intent, grouped
    into 6 categories (OBSERVE, ACT, MEMORY, CREATE, CONTROL, HEAL). Each entry:
    intent (plain English), verb, system, method, route, inputs, success, failure,
    and component (resolved through the UID registry to inherit component intent).
- orchestrator.js — new GET /api/intent-map endpoint (+ ?category= filter),
    sits alongside the existing /api/api-map. Added to self-documented routes.
- ui/home/intent.html — the map-driven orchestrator UI. Reads /api/intent-map,
    renders actions grouped by WHAT YOU WANT TO DO, not by system. Search,
    detail panel (component + intent + inputs + success/failure), run GET actions.
    Served at /home/intent.html. This is the "do anything, not just coding" door.
- Proven: endpoint serves 17 interactions / 6 categories, filter works, UI fetches it.

## Architecture now complete (CLI -> API -> map -> UI)
- CLI: every system has commands (existing)
- API: every capability is an HTTP route (existing, aggregated in /api/api-map)
- MAP: /api/intent-map tags each route with intent, component-resolved (NEW)
- UI:  ui/home/intent.html floats on the map, organizes by intent (NEW)
The UI can only reach the API; the API only exposes what's in the map.
The topology IS the contract — a UI cannot act off-map.

## Idearium-as-repo merge (forks/zips become tracked ideas)
- idearium/repo/index.js (ESM — matches idearium's module system) — RepoLayer:
    ingest({name,files}) -> a dropped zip/fork becomes a tracked IDEA (phase:building)
    + a canonical .spec + a repo record. fork(uuid) branches with lineage.
    Organized by repo/.spec. list()/get()/lineage()/archive(). §7.4 archive not delete.
    Built on IdeaOS PUBLIC methods only — respects the existing grain.
- idearium/repo/watcher.js (ESM) — RepoWatcher: fs.watch on data/drop/ for .zip,
    debounced, extracts (adm-zip -> unzip -> opaque fallback), ingest()s each as a repo.
    This is the directory listener + drag-drop-zip intake. §1.2 never throws on bad drop.
- lib/intent-map.js — +3 interactions: repo.drop (ingest), repo.fork, repo.list.
    Total now 20 interactions. Repos appear in the intent-map UI under CREATE/OBSERVE.
- Proven: zip -> ingest -> tracked idea+spec+repo -> fork -> lineage tree, all live.
- Honest boundary: RepoLayer + watcher + intent-map entries are done & proven.
    NEXT: wire /api/repos routes into idearium's ESM router + a repo UI view in
    ui/home/intent.html (read carefully — idearium's router is ESM, don't break it).

## Still to do (the other 3 of the 4-system request — parts exist, need connecting)
- Diagnostic dashboard: service/nexus-diagnostic.js + gap-finder + harness EXIST,
    need a UI view (surface, don't rebuild).
- Healing visibility: cortex/self-heal + cortex/healer EXIST & run headless,
    need UI + manual trigger. (Note: TWO healers exist — drift to reconcile.)
- Backup/restore: cortex/snapshot + cortex/replay EXIST, need scheduled backup
    + restore-from-zip + UI.
