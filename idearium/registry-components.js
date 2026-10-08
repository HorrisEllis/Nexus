// ── idearium/registry-components.js — Canonical component descriptors ───────
// UUID: idearium-registry-components-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// §FIX-ROADMAP-61/62: backfills idearium's real API surface into
// lib/component-registry.js (the canonical registry, per architectural
// decision — see roadmap Phase 62). hooks/idearium.hooks.js declared 3 hooks
// with 1 real seam.componentId against 20+ real undeclared actions; this
// covers all 42 real routes idearium/api/index.js actually serves, derived
// directly from its routing tables (both static `routes` and `dynRoutes`),
// not invented separately.
//
// Registered via POST /api/register's existing `components` field
// (lib/component-registry.js's onSystemRegister(), already wired in
// orchestrator.js but never previously fed real data from any system).

function _grammarFor(action) {
  // Mechanical phrase generation from 'resource.verb' action names —
  // e.g. 'idea.create' -> ['create idea', 'idea create'].
  const parts = action.split('.');
  if (parts.length < 2) return [action];
  const [resource, verb] = parts;
  return [`${verb} ${resource}`, `${resource} ${verb}`];
}

function _comp(action, method, pathStr, description, opts = {}) {
  return {
    id:          `idearium.${action}`,
    namespace:   'idearium',
    name:        action,
    version:     opts.version || '1.0.0',
    grammar:     opts.grammar || _grammarFor(action),
    route:       { method, path: pathStr },
    description,
    params:      opts.params || [],
    returns:     opts.returns || { type: 'object', render: 'json' },
    tags:        ['idearium', ...(opts.tags || [])],
    permissions: opts.permissions || ['system'],
  };
}

const COMPONENTS = [
  // ── Health / introspection ─────────────────────────────────────────────
  _comp('health',          'GET',  '/',                                  'Service liveness check'),
  _comp('contract.get',    'GET',  '/api/contract',                      "Return idearium's API contract descriptor"),
  _comp('stats.get',       'GET',  '/api/stats',                         'Runtime stats — idea/spec/gap counts, SNR'),
  _comp('snr.current',     'GET',  '/api/snr',                           'Current SNR (signal-to-noise) score'),
  _comp('snr.history',     'GET',  '/api/snr/history',                   'Historical SNR score timeline'),
  _comp('events.log',      'GET',  '/api/events',                        'Recent internal event log'),
  _comp('sse',             'GET',  '/sse',                               'Live SSE event stream', { tags: ['stream'] }),

  // ── Ideas ───────────────────────────────────────────────────────────────
  _comp('idea.list',       'GET',  '/api/ideas',                         'List all ideas'),
  _comp('idea.create',     'POST', '/api/ideas',                         'Create a new idea from free text',
    { params: [{ name: 'text', type: 'string' }, { name: 'tags', type: 'json' }, { name: 'compartment', type: 'string' }] }),
  _comp('idea.show',       'GET',  '/api/ideas/:uuid',                   'Get a single idea by uuid'),
  _comp('idea.update',     'PATCH','/api/ideas/:uuid',                   "Update an idea's fields"),
  _comp('idea.archive',    'DELETE','/api/ideas/:uuid',                  'Archive (soft-delete) an idea'),
  _comp('idea.tension',    'POST', '/api/ideas/:uuid/tension',           'Recompute tension score for an idea'),
  _comp('idea.link',       'POST', '/api/ideas/:uuid/link',              'Link two ideas together'),
  _comp('idea.spec',       'POST', '/api/ideas/:uuid/spec',              'Promote an idea into a spec'),
  _comp('idea.phase',      'POST', '/api/ideas/:uuid/phase',             "Advance an idea's lifecycle phase"),
  _comp('idea.progress',   'POST', '/api/ideas/:uuid/progress',          'Record progress against an idea'),

  // ── Specs ───────────────────────────────────────────────────────────────
  _comp('spec.list',       'GET',  '/api/specs',                        'List all specs'),
  _comp('spec.create',     'POST', '/api/specs',                        'Create a new spec from an idea'),
  _comp('spec.show',       'GET',  '/api/specs/:uuid',                  'Get a single spec by uuid'),
  _comp('spec.update',     'PATCH','/api/specs/:uuid',                  "Update a spec's section content"),
  _comp('spec.check',      'POST', '/api/specs/:uuid/check',            'Validate spec completeness before build'),
  _comp('spec.build',      'POST', '/api/specs/:uuid/build',            'Compile a spec via the Tier 0/1 pipeline (compiler-bridge)'),
  _comp('spec.export',     'GET',  '/api/specs/:uuid/export',           'Export a spec as a portable document'),

  // ── Gaps ────────────────────────────────────────────────────────────────
  _comp('gap.list',        'GET',  '/api/gaps',                         'List open gaps'),
  _comp('gap.open',        'POST', '/api/gaps',                         'Open a new gap'),
  _comp('gap.show',        'GET',  '/api/gaps/:uuid',                   'Get a single gap by uuid'),
  _comp('gap.resolve',     'POST', '/api/gaps/:uuid/resolve',           'Resolve an open gap'),
  _comp('gap.ignore',      'POST', '/api/gaps/:uuid/ignore',            'Mark a gap as ignored'),

  // ── Snapshots ───────────────────────────────────────────────────────────
  _comp('snapshot.list',   'GET',  '/api/snapshots',                    'List saved snapshots'),
  _comp('snapshot.push',   'POST', '/api/snapshots',                    'Push a new snapshot of current state'),
  _comp('snapshot.show',   'GET',  '/api/snapshots/:uuid',              'Get a single snapshot by uuid'),
  _comp('snapshot.diff',   'GET',  '/api/snapshots/:a/diff/:b',         'Diff two snapshots'),
  _comp('snapshot.restore','POST', '/api/snapshots/:uuid/restore',      'Restore state from a snapshot'),

  // ── Repos ───────────────────────────────────────────────────────────────
  _comp('repo.list',       'GET',  '/api/repos',                        'List ingested repos'),
  _comp('repo.ingest',     'POST', '/api/repos',                        "Ingest a repo's file tree as a new repo entry"),
  _comp('repo.show',       'GET',  '/api/repos/:uuid',                  'Get a single repo by uuid'),
  _comp('repo.fork',       'POST', '/api/repos/:uuid/fork',             'Fork a repo into a new lineage'),
  _comp('repo.archive',    'DELETE','/api/repos/:uuid',                 'Archive a repo'),
  _comp('repo.lineage',    'GET',  '/api/repos/:uuid/lineage',          "Get a repo's fork lineage"),
  // §CI 2026-09-20 — CI/CD per compartment (cos/ci/index.js). Real
  // commands, so the CLI and any agent reach CI the same way they reach
  // every other capability, rather than through a UI-only button.
  _comp('repo.scan',       'GET',  '/api/repos/:uuid/scan',             'Scan a repo for dangling hooks, gaps and tension', { tags: ['intelligence'] }),
  _comp('repo.chunk.run',  'POST', '/api/repos/:uuid/chunk',            'Run the import pipeline (parse, atlas, chunk, verify, index) over a repo already on disk', { tags: ['pipeline'] }),
  _comp('repo.snapshot.commit', 'POST', '/api/repos/:uuid/snapshot',        'Commit a section-33 snapshot of a repo (source hash, git commit, atlas/chunk/graph versions, dependency, environment, test and verification state) to versionium', { tags: ['snapshot', 'versionium'] }),
  _comp('repo.snapshot.list',   'GET',  '/api/repos/:uuid/snapshots',       'List a repo\'s versionium snapshots, newest first', { tags: ['snapshot', 'versionium'] }),
  _comp('repo.snapshot.show',   'GET',  '/api/repos/:uuid/snapshots/:commitId', 'Read one repo snapshot record back from versionium', { tags: ['snapshot', 'versionium'] }),
  _comp('repo.proof.run', 'POST', '/api/repos/:uuid/proof', 'Run the repo\'s runnable tests under V8 coverage and record which chunks executed under a passing test (proof.json)', { tags: ['verification'] }),
  _comp('repo.proof.get', 'GET',  '/api/repos/:uuid/proof', 'Per-chunk runtime proof: passed / failed / none / no_tests / unsupported / test, each with a stale flag against the current chunk hash', { tags: ['verification'] }),
  _comp('repo.roadmap.get',   'GET',  '/api/repos/:uuid/roadmap',        'A repo\'s roadmap: the phases in its phasemap files as dependency-ordered phase nodes (read with loom\'s parser)', { tags: ['roadmap'] }),
  _comp('repo.roadmap.phase.update', 'POST', '/api/repos/:uuid/roadmap/phase', 'Change one phase\'s status in a repo\'s phasemap file; refused unless loom reads it back exactly', { tags: ['roadmap'] }),
  _comp('repo.snapshot.restore', 'POST', '/api/repos/:uuid/snapshots/:commitId/restore', 'Restore a repo\'s files to a snapshot (dry run by default; takes a pre-restore snapshot; verifies the result against disk)', { tags: ['snapshot', 'versionium'] }),
  _comp('repo.hat.show',   'GET',  '/api/repos/:uuid/hat',              "Show this repo's project agent (hat), if forged", { tags: ['agent'] }),
  _comp('repo.hat.ensure', 'POST', '/api/repos/:uuid/hat',              'Forge the project agent for this repo, constrained to its compartment', { tags: ['agent'] }),
  _comp('repo.hat.refresh','POST', '/api/repos/:uuid/hat/refresh',      "Re-ground the project agent's persona against the repo's current index", { tags: ['agent'] }),
  _comp('repo.hat.revoke', 'DELETE','/api/repos/:uuid/hat',             "Revoke this repo's project agent", { tags: ['agent'] }),
  // §REPO-AGENT 2026-09-20 — the compartment's own agent CLI. lib/repo-agent.js
  // composes the hat's persona into an ordinary prompt; it never switches the
  // host's global current agent (see that file's header).
  _comp('repo.agent.status',        'GET',   '/api/repos/:uuid/agent',              "This compartment's agent: hat, index state, learned count, session", { tags: ['agent'] }),
  _comp('repo.agent.prompt',        'POST',  '/api/repos/:uuid/agent/prompt',       "Dispatch one message as this compartment's agent, wearing its repo hat", { tags: ['agent'] }),
  _comp('repo.agent.route',         'GET',   '/api/repos/:uuid/agent/route',        "Which model copilot's door would choose for this repo's agent, and the other hops (CT3)", { tags: ['agent'] }),
  _comp('repo.thread',              'GET',   '/api/repos/:uuid/thread',             "One spec's blocks ⇄ the phases planned from them ⇄ their runs ⇄ files and changes, stale blocks named (RS9)", { tags: ['phases', 'spec'] }),
  _comp('repo.agent.tool.event',    'POST',  '/api/repos/:uuid/agent/tool-event',   "copilot reports one of this repo agent's tool calls as it starts and ends (CT8)", { tags: ['agent'] }),
  _comp('repo.agent.tool.events',   'GET',   '/api/repos/:uuid/agent/tool-events',  "This repo agent's last tool calls, as reported live (CT8)", { tags: ['agent'] }),
  _comp('repo.agent.stream',        'POST',  '/api/repos/:uuid/agent/stream',       "copilot sends what this repo agent's Ollama model writes, as it writes it — broadcast as idearium.repo.agent.feed (LS3)", { tags: ['agent'] }),
  _comp('workshop.templates',       'GET',   '/api/workshop/templates',              "Every template the workshop's picker offers — the spec-document templates (genesis first), the COS archetypes and blueprints, the saved ones — each with its 11 parts previewed (RS5)", { tags: ['workshop'] }),
  _comp('workshop.template.save',   'POST',  '/api/workshop/templates',              "A workshop's sections saved as a template — a new version when it came from that template; the old kept (RS5)", { tags: ['workshop'] }),
  _comp('workshop.template.remove', 'POST',  '/api/workshop/templates/:tid/remove',  "Archives a saved template — kept, no longer offered; a built-in one is refused (RS5)", { tags: ['workshop'] }),
  _comp('ollama.check',             'GET',   '/api/ollama/check',                   "Installed Ollama models and how every idearium caller would route through copilot's door (CT4)", { tags: ['agent', 'ollama'] }),
  _comp('ollama.check.ask',         'POST',  '/api/ollama/check/ask',               'Ask one Ollama model a one-line question through copilot (CT4)', { tags: ['agent', 'ollama'] }),
  // §LATE 0.39.241 — a reply that arrived after copilot stopped waiting, read back from Clear Glass's Responses index.
  _comp('repo.agent.late.find',     'GET',   '/api/repos/:uuid/agent/late',         "Find this agent's late reply in the Responses index (read-only)", { tags: ['agent'] }),
  _comp('repo.agent.late.adopt',    'POST',  '/api/repos/:uuid/agent/late',         "Adopt a late reply as the exchange's answer: learn, inject, log — once", { tags: ['agent'] }),
  _comp('repo.agent.history',       'GET',   '/api/repos/:uuid/agent/history',      "This compartment's own exchange log, newest first", { tags: ['agent'] }),
  _comp('repo.agent.history.clear', 'DELETE','/api/repos/:uuid/agent/history',      "Clear this compartment's exchange log", { tags: ['agent'] }),
  _comp('repo.agent.memory.list',   'GET',   '/api/repos/:uuid/agent/memory',       'What this agent has learned working on the project', { tags: ['agent'] }),
  _comp('repo.agent.memory.record', 'POST',  '/api/repos/:uuid/agent/memory',       "Teach this agent something, and re-compose its live persona", { tags: ['agent'] }),
  _comp('repo.agent.memory.forget', 'DELETE','/api/repos/:uuid/agent/memory/:obs',  'Forget one observation, and drop it from the persona', { tags: ['agent'] }),
  // 0.39.272 — the context atlas: every memory system and graph behind one search
  _comp('context.directory',        'GET',   '/api/context/directory',              'Every memory system and graph NEXUS keeps: tables, row counts, what each is, which tool reads it', { tags: ['context','memory'] }),
  _comp('context.search',           'GET',   '/api/context/search',                 'Search every memory system and graph at once (?q=&sources=&limit=); hits cite source + id', { tags: ['context','memory'] }),
  _comp('context.get',              'GET',   '/api/context/get',                    'The whole record behind a context hit (?source=&id=)', { tags: ['context','memory'] }),
  _comp('repo.context.search',      'GET',   '/api/repos/:uuid/context',            "Context search scoped to this repo: its import graph and its agent's learned memory, plus everything else", { tags: ['context','agent'] }),
  _comp('repo.inject.list',        'GET',   '/api/repos/:uuid/injects',               "This compartment's .inject nodes and its inject mode", { tags: ['agent','inject'] }),
  _comp('repo.inject.create',      'POST',  '/api/repos/:uuid/injects',               'Propose (optionally apply) a write of one file into this compartment', { tags: ['agent','inject'] }),
  _comp('repo.inject.get',         'GET',   '/api/repos/:uuid/injects/:id',           'One .inject with the file as it is now', { tags: ['agent','inject'] }),
  _comp('repo.inject.edit',        'PUT',   '/api/repos/:uuid/injects/:id',           'Edit a proposed .inject before it is applied', { tags: ['agent','inject'] }),
  _comp('repo.inject.apply',       'POST',  '/api/repos/:uuid/injects/:id/apply',     'Write a proposed .inject into the repo; refuses if the file changed', { tags: ['agent','inject'] }),
  _comp('repo.inject.reject',      'POST',  '/api/repos/:uuid/injects/:id/reject',    'Reject a proposed .inject', { tags: ['agent','inject'] }),
  _comp('repo.inject.revert',      'POST',  '/api/repos/:uuid/injects/:id/revert',    'Undo an applied .inject from its recorded prior content', { tags: ['agent','inject'] }),
  _comp('repo.run',                'POST',  '/api/repos/:uuid/run',                  'Run or test this repo in a COS test environment (branch + sandbox)', { tags: ['run','cos'] }),
  _comp('repo.run.capabilities',   'GET',   '/api/repos/:uuid/run/capabilities',     'Which COS test environments are available here, and why not', { tags: ['run','cos'] }),
  _comp('repo.run.options',        'GET',   '/api/repos/:uuid/run/options',          'The COS run menu for this repo: every option, and why any is unavailable', { tags: ['run','cos'] }),
  _comp('cos.testenv.status',      'GET',   '/api/cos/testenv',                      'The COS test VM: available or not (and the fix), and the setup job\'s progress', { tags: ['run','cos','vm'] }),
  _comp('cos.install.status',      'GET',   '/api/cos/install',                      'Install jobs for tools a run needs (QEMU, Python, Ruby, PHP, Go, Git)', { tags: ['run','cos','install'] }),
  _comp('cos.install',             'POST',  '/api/cos/install',                      'Install a tool a run needs — winget/brew/apt; started only by a click in the Run menu', { tags: ['run','cos','install'] }),
  _comp('cos.testenv.setup',       'POST',  '/api/cos/testenv/setup',                'Set up the COS test VM in the background (QEMU via winget on Windows, base image via cos/testenv/provision.js)', { tags: ['run','cos','vm'] }),
  _comp('repo.agent.settings.get', 'GET',   '/api/repos/:uuid/agent/settings',        "This compartment agent's settings (inject mode, guardian switch + agent)", { tags: ['agent'] }),
  _comp('repo.agent.settings.set', 'POST',  '/api/repos/:uuid/agent/settings',        'Set inject mode, provider, ollamaModel (validated against Ollama\'s installed list), or useGuardian/guardianAgent', { tags: ['agent'] }),
  _comp('ollama.models',           'GET',   '/api/ollama/models',                     "Ollama's installed models via the ollama bridge (502 with the reason when unreachable) — the Agent tab's model dropdown", { tags: ['agent', 'ollama'] }),
  // 0.39.257 — the Agent tab's /tools, /debug, /graph (lib/repo-agent.js listTools / debugReport, lib/repo-context.js)
  _comp('repo.agent.tools',        'GET',   '/api/repos/:uuid/agent/tools',           "Copilot's tool catalog marked with this compartment's scope (all by default, or project); ?q= search", { tags: ['agent', 'tools'] }),
  _comp('repo.agent.debug',        'POST',  '/api/repos/:uuid/agent/debug',           'What is wrong, from the systems: syntax, unresolved imports, recent failures, the intelligence system', { tags: ['agent', 'debug'] }),
  _comp('repo.agent.graph',        'GET',   '/api/repos/:uuid/agent/graph',           'The project map from graph.json, or one file\'s connections (?file=)', { tags: ['agent', 'graph'] }),
  _comp('repo.agent.export',        'POST',  '/api/repos/:uuid/agent/export',       'Materialise this compartment agent as portable .hat + .repo_agent node files', { tags: ['agent'] }),
  _comp('repo.agent.import',        'POST',  '/api/repos/:uuid/agent/import',       'Restore a compartment agent from an .agent (or a legacy .repo_agent) node file, merging its observations', { tags: ['agent'] }),
  _comp('repo.ci.keys.list',    'GET',   '/api/repos/:uuid/ci/keys',          "List SSH key aliases registered to this compartment (never key material)", { tags: ['ci','keys'] }),
  _comp('repo.ci.keys.register','POST',  '/api/repos/:uuid/ci/keys',          'Register an SSH key BY PATH under an alias, in the compartment vault', { tags: ['ci','keys'] }),
  _comp('repo.ci.keys.remove',  'DELETE','/api/repos/:uuid/ci/keys/:alias',   'Remove an SSH key alias from this compartment', { tags: ['ci','keys'] }),
  _comp('repo.ci.secrets.list', 'GET',   '/api/repos/:uuid/ci/secrets',       'List CI secret names for this compartment (names only, never values)', { tags: ['ci','keys'] }),
  _comp('repo.ci.secrets.set',  'POST',  '/api/repos/:uuid/ci/secrets',       'Store an encrypted CI secret in the compartment vault', { tags: ['ci','keys'] }),
  _comp('repo.ci.secrets.remove','DELETE','/api/repos/:uuid/ci/secrets/:name','Delete a CI secret from this compartment', { tags: ['ci','keys'] }),
  _comp('repo.ci.config',  'GET',  '/api/repos/:uuid/ci',               "Read a compartment's CI pipeline definition", { tags: ['ci'] }),
  _comp('repo.ci.setConfig','PUT', '/api/repos/:uuid/ci',               "Write a compartment's CI pipeline definition", { tags: ['ci'] }),
  _comp('repo.ci.run',     'POST', '/api/repos/:uuid/ci/run',           'Run the compartment CI pipeline in a real sandbox', { tags: ['ci'] }),
  _comp('repo.ci.runs',    'GET',  '/api/repos/:uuid/ci/runs',          'List CI run history for a compartment', { tags: ['ci'] }),
  _comp('repo.ci.run.show','GET',  '/api/repos/:uuid/ci/runs/:runId',   'Get one CI run with full stage logs', { tags: ['ci'] }),
  // §0.39.265 — real git on the repo folder (lib/repo-git.js)
  _comp('repo.git.status', 'GET',  '/api/repos/:uuid/git',              'Git status: branch, remotes, ahead/behind, changed files, SSH key aliases', { tags: ['git'] }),
  _comp('repo.git.remote', 'POST', '/api/repos/:uuid/git/remote',       'Set a git remote URL (https, ssh://, git@host:path)', { tags: ['git'] }),
  _comp('repo.git.commit', 'POST', '/api/repos/:uuid/git/commit',       'Commit every change in the repo folder', { tags: ['git'] }),
  _comp('repo.git.push',   'POST', '/api/repos/:uuid/git/push',         'Push to a remote with a compartment SSH key or git_token', { tags: ['git'] }),
  _comp('repo.git.pull',   'POST', '/api/repos/:uuid/git/pull',         'Fast-forward pull; changed files are brought into the repo', { tags: ['git'] }),
  _comp('repo.git.keygen', 'POST', '/api/repos/:uuid/git/keygen',       'Create an ed25519 SSH key, register it to the compartment, return the public key', { tags: ['git', 'keys'] }),
  _comp('git.clone',       'POST', '/api/git/clone',                    'Clone a git URL into a new repo (same import rules as a zip)', { tags: ['git'] }),
  // §0.39.265 — compartment remotes (lib/cos-remote.js)
  _comp('cos.compartments.list', 'GET', '/api/cos/compartments',                         "This machine's compartments, with their repo and remotes", { tags: ['cos', 'remote'] }),
  _comp('cos.remote.list',   'GET',    '/api/cos/compartments/:cid/remotes',               "A compartment's remotes", { tags: ['cos', 'remote'] }),
  _comp('cos.remote.add',    'POST',   '/api/cos/compartments/:cid/remotes',               'Add a remote: a folder / synced drive, or user@host:path over ssh', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.remove', 'DELETE', '/api/cos/compartments/:cid/remotes/:name',         'Remove a remote', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.status', 'GET',    '/api/cos/compartments/:cid/remotes/:name/status',  'in-sync / ahead / behind / diverged against a remote', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.push',   'POST',   '/api/cos/compartments/:cid/remotes/:name/push',    'Push the compartment (and its project folder) to a remote', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.pull',   'POST',   '/api/cos/compartments/:cid/remotes/:name/pull',    'Pull from a remote; a backup of what it replaces is kept', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.browse', 'POST',   '/api/cos/remote/browse',                           'The compartments kept at a location', { tags: ['cos', 'remote'] }),
  _comp('cos.remote.clone',  'POST',   '/api/cos/remote/clone',                            'Pull a compartment this machine does not have (its project becomes a repo)', { tags: ['cos', 'remote'] }),

  // ── Queue ───────────────────────────────────────────────────────────────
  _comp('queue.show',      'GET',  '/api/queue/:queueId',               'Get queue item status'),
  _comp('queue.progress',  'POST', '/api/queue/:queueId/progress',      'Record progress against a queue item'),

  // ── CLI ─────────────────────────────────────────────────────────────────
  _comp('cli.exec',        'POST', '/api/cli/exec',                     'Execute a unified CLI command'),
];

export { COMPONENTS };
export default { COMPONENTS };
