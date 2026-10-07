'use strict';
/**
 * lib/mcp-server.js — Phase 67: MCP Tool Bridge
 * UUID: nexus-mcp-server-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * Exposes NEXUS routes as MCP (Model Context Protocol) tools.
 * A connected Claude session calls nexus.copilot, nexus.gaps, nexus.status
 * instead of grep-exploring the filesystem from scratch each session.
 *
 * Transport: HTTP (SSE + POST) on :7821 by default.
 * Also supports stdio transport for direct Claude Desktop integration.
 *
 * §1.1 Nothing exists until proven — every tool call verified against live system
 * §1.2 Nothing silently fails — every tool error surfaces with context
 * §2.1 Disk before behavior — tool results written to JAA before returned
 * §5.7 HTTP seam only — no direct service imports
 */

const http   = require('http');
const crypto = require('crypto');

const MODULE_ID = 'mcp-server';
const VERSION   = '1.0.0';

const MCP_PORT   = parseInt(process.env.NEXUS_MCP_PORT || '7821', 10);
const GD_URL     = process.env.GUARDIAN_URL  || 'http://127.0.0.1:7820';
const CX_URL     = process.env.CORTEX_URL    || 'http://127.0.0.1:3748';
const INTEL_URL  = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753';
const OR_URL     = process.env.ORCH_URL      || 'http://127.0.0.1:9000';
const IDR_URL    = process.env.IDEARIUM_URL  || 'http://127.0.0.1:4800';
const CP_URL     = process.env.COPILOT_URL   || 'http://127.0.0.1:3750';   // §IN1 — introspect

// §IN1 — loom's registry, read from the repo (cached by mtime): nexus_loom answers with every service down
let _loomCache = null, _loomKey = null;
function _loomRegistry() {
  const fs = require('fs'), path = require('path');
  const f = process.env.NEXUS_LOOM_REGISTRY || path.resolve(__dirname, '..', '..', 'loom', 'data', 'registry.json');
  let st; try { st = fs.statSync(f); } catch (_) { throw new Error(`loom's registry is not at ${f} — run node loom/bootstrap.js`); }
  const key = `${f}|${st.mtimeMs}`;
  if (_loomCache && _loomKey === key) return _loomCache;
  _loomCache = JSON.parse(fs.readFileSync(f, 'utf8')); _loomKey = key;
  return _loomCache;
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

// §IN1 2026-10-02 — honest degradation (map invariant: "every tool degrades honestly when its service is down, never a
// fake answer"). This used to return null for a refused connection, and the tools read null as an empty result:
// nexus_gaps with guardian down said "No open gaps ✓". Now a service that cannot be reached, or answers with an error,
// THROWS with its name and port — the tool call fails with that reason. A 404 is still null: "nothing there" is real.
function _service(url) {
  const port = (() => { try { return new URL(url).port; } catch (_) { return ''; } })();
  const name = { 7820: 'guardian', 3748: 'cortex', 3753: 'intelligence', 9000: 'orchestrator', 4800: 'idearium', 3750: 'copilot' }[port] || 'the service';
  return `${name} :${port}`;
}
async function _get(url, ms = 3000) {
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(ms) }); }
  catch (e) { throw new Error(`${_service(url)} not reachable — ${e.name === 'TimeoutError' ? `no answer in ${ms}ms` : (e.cause && e.cause.code) || e.message} (nothing was read; this is not an empty result)`); }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${_service(url)} answered HTTP ${r.status} for ${new URL(url).pathname}`);
  return r.json();
}

async function _post(url, body, ms = 30000) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
    return r.json();
  } catch(e) { return { ok: false, error: e.message }; }
}

// ── Tool registry ──────────────────────────────────────────────────────────────
// Each tool: { name, description, inputSchema, handler(args) → string }

const TOOLS = [


  // ── Blueprint (Phase 42) ──────────────────────────────────────────────────
  {
    name: 'nexus_blueprint',
    description: 'Phase 42: Read or compile the NEXUS Blueprint — single source of truth listing all components, grammar, axioms, CLI map, and sigma. Compile first if it does not exist.',
    inputSchema: { type:'object', properties: { compile: { type:'boolean', default:false } } },
    handler: async ({ compile: recompile = false }) => {
      if (recompile) {
        const r = await _post(`${GD_URL}/blueprint/compile`, {}, 15000);
        if (!r?.ok) return `Compile failed: ${r?.error || 'unknown'}`;
      }
      const bp = await _get(`${GD_URL}/blueprint`);
      if (!bp) return 'No blueprint yet. Call with compile:true first.';
      return [
        `NEXUS Blueprint ${bp.uuid}`,
        `Compiled: ${new Date(bp.compiledAt||0).toISOString()}  Sigma: ${(bp.sigma||0).toFixed(3)}`,
        `Components: ${bp.registry?.components||0} across ${(bp.registry?.namespaces||[]).join(', ')}`,
        `Grammar: ${bp.grammar?.entries||0} entries  ready:${bp.grammar?.ready}`,
        bp.gaps?.length ? `Gaps: ${bp.gaps.map(g=>`[${g.severity}] ${g.type}`).join(', ')}` : 'Gaps: none',
        `CLI: ${(bp.cliMap||[]).map(c=>c.command).slice(0,10).join(', ')}`,
      ].join('\n');
    },
  },

  // ── Autonomous loop (Phase 13) ────────────────────────────────────────────
  {
    name: 'nexus_autonomous_run',
    description: 'Phase 13: Run an autonomous multi-step task using Ollama as brain. All four fields required (goal/budget/boundary/exit). Hard limits enforced. RAID-gated. Rewinds if sigma > 0.70.',
    inputSchema: {
      type: 'object',
      properties: {
        goal:     { type:'string', description:'Specific success condition' },
        budget:   { type:'object', description:'{ maxSteps, maxMs, maxTokens }' },
        boundary: { type:'string', description:'What the loop must NOT touch' },
        exit:     { type:'string', description:'Condition that terminates the loop' },
      },
      required: ['goal','budget','boundary','exit'],
    },
    handler: async ({ goal, budget, boundary, exit: exitCond }) => {
      const r = await _post(`${GD_URL}/autonomous/run`,
        { goal, budget, boundary, exit:exitCond, source:'mcp', proof:{session:'claude'} }, 180000);
      if (!r) return 'Guardian unreachable';
      if (!r.ok) return `Failed: ${r.error || r.exitReason}`;
      return [
        `Run: ${r.runId?.slice(0,8)}  Status: ${r.status}`,
        `Steps: ${r.steps?.length||0}  Tokens: ${r.tokensUsed||0}`,
        `Outcome: ${r.outcome || '(none)'}`,
        `Exit: ${r.exitReason}`,
        r.steps?.length ? '\n' + r.steps.map(s=>`  ${s.step}. ${(s.action||'').slice(0,60)}`).join('\n') : '',
      ].filter(Boolean).join('\n');
    },
  },

  // ── BUILD — the whole point ──────────────────────────────────────────────────
  // This is what NEXUS was built for. Spec → running code.
  // T0 (scaffold) + T1 (wiring) + T2 (Ollama implementation) → files on disk.
  {
    name: 'nexus_build',
    description: [
      'Build something from a spec. This is the primary NEXUS capability.',
      'Takes a .spec file path or spec text, compiles it (T0 scaffold + T1 wiring),',
      'then dispatches each T2 node to Ollama for implementation.',
      'Returns when all nodes are implemented and written to disk.',
      'RAID-gated. Uses Ollama locally — no browser tab needed.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        specPath: { type: 'string', description: 'Absolute path to .spec file' },
        specText: { type: 'string', description: 'Spec content as a string (alternative to specPath)' },
        name:     { type: 'string', description: 'Name for the output directory' },
        outputDir:{ type: 'string', description: 'Where to write output (default: nexus/output/<name>)' },
        provider: { type: 'string', description: 'ollama (default) | chatgpt | claude', default: 'ollama' },
        dryRun:   { type: 'boolean', description: 'Build prompts but do not dispatch', default: false },
      },
    },
    handler: async ({ specPath, specText, name, outputDir, provider = 'ollama', dryRun = false }) => {
      if (!specPath && !specText) return 'specPath or specText required';
      const r = await _post(`${GD_URL}/build`, {
        specPath, specText, name, outputDir, provider, dryRun,
        proof: { source: 'mcp', session: 'claude' },
      }, 300000);
      if (!r) return 'Guardian unreachable — is NEXUS running?';
      if (!r.ok) return `Build failed (${r.stage}): ${r.error || r.summary}`;
      return r.summary || `Build complete. Stage: ${r.stage}. Output: ${r.outputDir}`;
    },
  },

  // ── Primary: co-pilot ─────────────────────────────────────────────────────
  {
    name: 'nexus_copilot',
    description: [
      'Ask the NEXUS co-pilot anything about the running system.',
      'Returns a grounded answer built from live system state: gaps, jobs, CFR field,',
      'provider health, patterns, conversations, causal graph.',
      'This is the primary tool. Use it before searching the filesystem.',
      'The co-pilot has 7-layer context and a user model. It knows the system better than grep.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Your question or command' },
        channel: { type: 'string', description: 'Current channel context (optional)', default: 'mcp' },
      },
      required: ['prompt'],
    },
    handler: async ({ prompt, channel = 'mcp' }) => {
      const r = await _post(`${OR_URL}/api/guardian/copilot/prompt`, {
        prompt, channel, channelName: 'MCP Session',
        contextOpts: { intent: prompt },
      }, 120000);
      if (!r) return 'NEXUS co-pilot unreachable. Is NEXUS running?';
      return r.text || r.error || 'No response';
    },
  },

  // ── System status ──────────────────────────────────────────────────────────
  {
    name: 'nexus_status',
    description: 'Get the current health status of all NEXUS services. Returns online/offline state for Guardian, Cortex, Orchestrator, Idearium, Bridge, Architect.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const systems = [
        { name: 'Guardian',    url: `${GD_URL}/health`,  port: 7820 },
        { name: 'Cortex',      url: `${CX_URL}/health`,  port: 3748 },
        { name: 'Orchestrator',url: `${OR_URL}/health`,  port: 9000 },
        { name: 'Idearium',    url: `${IDR_URL}/health`, port: 4800 },
      ];
      const results = await Promise.allSettled(systems.map(s => _get(s.url, 2000)));
      const lines = systems.map((s, i) => {
        const r = results[i].status === 'fulfilled' ? results[i].value : null;
        const ok = r?.ok === true || r?.status === 'ok';
        return `  ${s.name.padEnd(14)} :${s.port} ${ok ? '✓ online' : '✗ offline'}`;
      });
      return `NEXUS service status:\n${lines.join('\n')}`;
    },
  },

  // ── Gaps ───────────────────────────────────────────────────────────────────
  {
    name: 'nexus_gaps',
    description: 'List open gaps in the NEXUS system. Gaps are named, typed structural problems detected by the diagnostic engine. Returns type, severity, body, and age.',
    inputSchema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['high', 'medium', 'low', 'all'], default: 'all' },
        limit: { type: 'number', default: 20 },
      },
    },
    handler: async ({ severity = 'all', limit = 20 }) => {
      const url = `${GD_URL}/gaps?status=open&limit=${limit}${severity !== 'all' ? `&severity=${severity}` : ''}`;
      const d = await _get(url);
      const gaps = d?.gaps || [];
      if (!gaps.length) return 'No open gaps ✓';
      return `${gaps.length} open gap${gaps.length === 1 ? '' : 's'}:\n` +
        gaps.map(g => `  [${g.severity?.padEnd(6)||'?     '}] ${g.type}: ${(g.body||'').slice(0,100)}`).join('\n');
    },
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  {
    name: 'nexus_jobs',
    description: 'List recent Guardian jobs — dispatched work items (Ollama completions, NCP dispatches, repairs). Useful for understanding what the system has been doing.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'complete', 'error', 'all'], default: 'all' },
        limit: { type: 'number', default: 10 },
      },
    },
    handler: async ({ status = 'all', limit = 10 }) => {
      const url = `${GD_URL}/jobs?limit=${limit}${status !== 'all' ? `&status=${status}` : ''}`;
      const d = await _get(url);
      const jobs = d?.jobs || [];
      if (!jobs.length) return 'No jobs found.';
      return `${jobs.length} job${jobs.length === 1 ? '' : 's'}:\n` +
        jobs.map(j => `  [${j.status?.padEnd(8)||'?       '}] ${j.provider} · ${(j.prompt||j.command||'').slice(0,60)}`).join('\n');
    },
  },

  // ── Patterns ───────────────────────────────────────────────────────────────
  {
    name: 'nexus_patterns',
    description: 'List crystallized intelligence patterns — event co-occurrences and failure precursors the system has observed with high confidence. Essential for understanding recurring problems.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 15 } },
    },
    handler: async ({ limit = 15 }) => {
      const d = await _get(`${INTEL_URL}/api/intelligence/patterns?limit=${limit}`);
      const pats = (d?.patterns || []).filter(p => p.crystallised).slice(0, limit);
      if (!pats.length) return 'No patterns crystallised yet. System needs more uptime.';
      return `${pats.length} crystallised patterns:\n` +
        pats.map(p => `  [${Math.round((p.confidence||0)*100)}%] ${p.description?.slice(0,100)||p.signature}`).join('\n');
    },
  },

  // ── RCA ────────────────────────────────────────────────────────────────────
  {
    name: 'nexus_rca',
    description: 'Get root cause analysis findings. The intelligence engine reads crystallized patterns and produces structured diagnoses: what is wrong, why, and how to fix it.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const d = await _get(`${INTEL_URL}/api/intelligence/rca?limit=5`);
      // FIXED 2026-09-19: this read d.findings with {severity,name,rootCause,fix}, a
      // shape no route has ever returned (no engine produces it). The real
      // /api/intelligence/rca contract is { rca:[{gapId,type,cause,since,sigma}] }.
      const findings = d?.rca || [];
      if (!findings.length) return 'No open gaps to diagnose. Nothing is currently unresolved.';
      return findings.map(f =>
        `[gap ${f.gapId}] ${f.type}\n  Cause: ${String(f.cause).slice(0,150)}\n  Open since: ${f.since ? new Date(f.since).toISOString() : 'unknown'}`
      ).join('\n\n');
    },
  },

  // ── CFR field ──────────────────────────────────────────────────────────────
  {
    name: 'nexus_cfr',
    description: 'Get the current CFR-Ω field state: sigma (anomaly score), regime, coherence, friction, entropy. Sigma > 0.7 means something is critically wrong.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const d = await _get(`${OR_URL}/cfr/field`);
      if (!d) return 'CFR field unavailable  is the orchestrator running?';
      const f = d.field || d;
      // 2026-09-19: the CFR field endpoint has never carried a `sigma` (sigma is a per-event score on
      // ledger entries; no route exposes a current aggregate), so this always printed 0.000 / "stable".
      // Say so instead of asserting stability: no sigma reported => qualifier is based on regime only.
      const sigma = typeof f.sigma === 'number' ? f.sigma : (typeof f.sigma?.score === 'number' ? f.sigma.score : null);
      const qual = sigma === null ? `sigma not reported, regime ${d.regime || f.regime || 'unknown'}`
                 : sigma < 0.35 ? 'stable' : sigma < 0.7 ? 'elevated' : 'CRITICAL';
      return [
        `CFR field [${qual}]`,
        sigma === null ? `  Sigma:     n/a (not exposed by the field endpoint)` : `  Sigma:     ${sigma.toFixed(3)}`,
        `  Regime:    ${d.regime || f.regime || '?'}`,
        f.coherence !== undefined ? `  Coherence: ${f.coherence.toFixed(3)}` : null,
        f.friction  !== undefined ? `  Friction:  ${f.friction.toFixed(3)}`  : null,
        f.entropy   !== undefined ? `  Entropy:   ${f.entropy.toFixed(3)}`   : null,
      ].filter(Boolean).join('\n');
    },
  },

  // ── Conversations ──────────────────────────────────────────────────────────
  {
    name: 'nexus_conversations',
    description: 'Read recent co-pilot conversation history from the JAA chat_log. Shows what the user has asked and what answers were given. Useful for continuity across sessions.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
    handler: async ({ limit = 10 }) => {
      const d = await _get(`${OR_URL}/api/memory?table=chat_log&limit=${limit}`);
      const rows = (d?.rows || d?.result || [])
        .filter(r => r.source === 'copilot')
        .sort((a, b) => (b.ts||0) - (a.ts||0))
        .slice(0, limit);
      if (!rows.length) return 'No conversations logged yet.';
      return rows.map(r => {
        const ago = Math.round((Date.now() - (r.ts||0)) / 60000);
        return `[${ago}m ago · ${r.intent||'?'}]\nQ: ${(r.prompt||'').slice(0,80)}\nA: ${(r.response||'').slice(0,120)}`;
      }).join('\n\n');
    },
  },

  // ── Artifacts ──────────────────────────────────────────────────────────────
  {
    name: 'nexus_artifacts',
    description: 'List saved code artifacts from the Guardian artifact store. These are code blocks extracted from AI responses and saved for reuse.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (optional)' },
        limit: { type: 'number', default: 10 },
      },
    },
    handler: async ({ query = '', limit = 10 }) => {
      const url = `${GD_URL}/artifacts?limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
      const d = await _get(url);
      const arts = d?.artifacts || [];
      if (!arts.length) return 'No artifacts found.';
      return `${arts.length} artifact${arts.length === 1 ? '' : 's'}:\n` +
        arts.map(a => `  [${a.lang||'?'}] ${a.specName||a.name||'untitled'} · ${(a.content||'').slice(0,60)}`).join('\n');
    },
  },

  // ── Search idearium ────────────────────────────────────────────────────────
  {
    name: 'nexus_ideas',
    description: 'Search Idearium — the NEXUS idea and spec store. Returns ideas matching a query, sorted by tension score. Useful for finding what has been planned or specced.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
    handler: async ({ query, limit = 10 }) => {
      const d = await _get(`${IDR_URL}/api/ideas?q=${encodeURIComponent(query)}&limit=${limit}`);
      const ideas = d?.ideas || d?.rows || [];
      if (!ideas.length) return `No ideas found for: ${query}`;
      return `${ideas.length} idea${ideas.length === 1 ? '' : 's'} matching "${query}":\n` +
        ideas.map(i => `  [tension:${(i.tension||0).toFixed(2)}] ${(i.title||(i.body||'').slice(0,60)||'untitled')}`).join('\n');
    },
  },

  // ── Save to idearium ────────────────────────────────────────────────────────
  {
    name: 'nexus_save_idea',
    description: 'Save a note, idea, spec fragment, or observation to Idearium. Use this to persist insights, decisions, or plans discovered during a Claude session.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The idea, note, or spec fragment to save' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for discovery', default: [] },
      },
      required: ['text'],
    },
    handler: async ({ text, tags = [] }) => {
      const r = await _post(`${IDR_URL}/api/ideas`, {
        text, tags: ['mcp', 'claude-session', ...tags],
        compartment: 'mcp-session',
      }, 5000);
      if (r?.ok === false) return `Failed to save: ${r.error || 'unknown error'}`;
      return `Saved to Idearium (id: ${r?.id || r?.uuid || '?'})`;
    },
  },

  // ── Hot load a module ──────────────────────────────────────────────
  {
    name: 'nexus_hot_load',
    description: 'Phase 14/28: Replace a running NEXUS module without restart. Snapshots first, validates invariants in quarantine, monitors for 60s, rolls back if sigma > 0.70. RAID-gated.',
    inputSchema: {
      type: 'object',
      properties: {
        modulePath: { type: 'string', description: 'Path relative to NEXUS root e.g. "lib/copilot-context.js"' },
        src: { type: 'string', description: 'New source code (optional - omit to reload from disk)' },
        monitorMs: { type: 'number', description: 'Monitor window ms (default 60000)', default: 60000 },
      },
      required: ['modulePath'],
    },
    handler: async ({ modulePath, src, monitorMs = 60000 }) => {
      const r = await _post(`${GD_URL}/hot-load`, { modulePath, src, monitorMs,
        proof: { source: 'mcp', session: 'claude' } }, 30000);
      if (!r) return 'Guardian unreachable';
      if (!r.ok) return `Hot-load failed: ${r.error || r.reason || 'unknown'}`;
      return `Hot-load: ${r.loadId}\nState: ${r.state}\nMonitoring ${monitorMs/1000}s — rollback if σ > 0.70`;
    },
  },

  // ── Build ERAVOS organism from description ─────────────────────────────────
  {
    name: 'nexus_build_organism',
    description: [
      'Build a new ERAVOS organism from a natural language description.',
      'Follows the FORGE protocol: spec → hostile review → build → zip output.',
      'The description is routed through co-pilot which uses the build contract spec',
      'to produce a conforming organism pack ready to drop into ERAVOS.',
      'Returns a plan and next steps — full build requires FORGE phases.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Natural language description of the organism to build',
        },
        organism_type: {
          type: 'string',
          enum: ['audio', 'nexus', 'automation', 'cognitive', 'sensory', 'interface'],
          description: 'Category of organism',
          default: 'nexus',
        },
      },
      required: ['description'],
    },
    handler: async ({ description, organism_type = 'nexus' }) => {
      const prompt = [
        `NEXUS FORGE — BUILD FROM DESCRIPTION`,
        `Organism type: ${organism_type}`,
        `Description: ${description}`,
        ``,
        `Before phase 3, produce:`,
        `1. A complete organism spec (id, label, hooks, capabilities, config)`,
        `2. Hostile review — every assumption named`,
        `3. Build order (bottom-up: schema → engine → hooks → UI)`,
        `4. File list for the zip`,
        ``,
        `Kernel target: ERAVOS 3.0.0`,
        `No stubs. Surface all gaps. Follow eravos.nexus.build-contract.spec.`,
      ].join('\n');

      const r = await _post(`${OR_URL}/api/guardian/copilot/prompt`, {
        prompt, channel: 'mcp', channelName: 'MCP Build Session',
        contextOpts: { intent: `build organism: ${description}` },
      }, 120000);

      // Also save the description to Idearium for tracking
      await _post(`${IDR_URL}/api/ideas`, {
        text: `MCP organism build request: ${description}`,
        tags: ['mcp', 'organism', 'build', organism_type],
        compartment: 'mcp-builds',
      }, 3000).catch(() => {});

      return r?.text || 'Co-pilot unavailable for build planning.';
    },
  },

  // ── File read (repo navigation) ────────────────────────────────────────────
  {
    name: 'nexus_read_spec',
    description: 'Read a NEXUS spec file by name. Returns the spec content. Use this instead of file system grep when you need to understand a component.',
    inputSchema: {
      type: 'object',
      properties: {
        spec_name: {
          type: 'string',
          description: 'Spec name without path e.g. "copilot" "architect" "nexus-organisms"',
        },
      },
      required: ['spec_name'],
    },
    handler: async ({ spec_name }) => {
      const d = await _get(`${IDR_URL}/api/specs?name=${encodeURIComponent(spec_name)}&limit=1`);
      const specs = d?.specs || d?.rows || [];
      if (specs.length) {
        return `Spec: ${specs[0].name}\n\n${specs[0].content?.slice(0,3000)||'(no content)'}`;
      }
      // Fall back to reading from Idearium's /api/ideas search
      const d2 = await _get(`${IDR_URL}/api/ideas?q=${encodeURIComponent(spec_name)}&limit=3`);
      const ideas = d2?.ideas || d2?.rows || [];
      if (ideas.length) return `Found in Idearium:\n` + ideas.map(i=>`  ${i.title||i.body?.slice(0,80)}`).join('\n');
      return `Spec "${spec_name}" not found in Idearium. Check docs/ directory in the repo.`;
    },
  },

  // ── §IN1 2026-10-02 — what a builder needs (docs/2026-10-02-emerge-field-memory-build-phasemap.spec IN1) ─────────
  // James: "i want to get you to work from inside nexus … then you could use introspect". Each a thin call onto what
  // exists; loom and the contract check read the repo itself, so they answer with every service down. nexus_loom_impact
  // adds the WIRING (depends on / used by) that the tokensave tool nexus_loom_query, a list by namespace or name, does not.
  {
    name: 'nexus_loom_impact',
    description: 'Find a NEXUS component in loom\'s registry (by id or file path, e.g. "lib/component-store.js") and see its real wiring: what it depends on, and what depends on it — the impact of changing it. Read before changing or building, to reuse what exists. (To list many components by namespace or name, use nexus_loom_query.)',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'a component id or a path fragment' }, limit: { type: 'number', default: 5 } }, required: ['query'] },
    handler: async ({ query, limit = 5 }) => {
      const reg = _loomRegistry();
      const q = String(query || '').trim().toLowerCase();
      if (!q) throw new Error('query is required');
      const asId = 'nexus.' + q.replace(/\.(c|m)?js$/, '').replace(/[\/\\]/g, '.');
      const all = Object.values(reg.component);
      const exact = all.filter(c => c.id.toLowerCase() === q || c.id.toLowerCase() === asId || String(c.name || '').toLowerCase() === q);
      const hits = (exact.length ? exact : all.filter(c => c.id.toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q))).slice(0, Math.max(1, Math.min(20, limit)));
      if (!hits.length) return `No loom component matches "${query}". Loom has ${all.length} components; it may be new (build it) or named differently (try a shorter fragment).`;
      const compOfHook = (h) => (reg.hook[h] && reg.hook[h].component_id) || String(h).replace(/\.(export|import|[^.]+)$/, '');
      const wires = Object.values(reg.wire);
      return hits.map(c => {
        const uses = [...new Set(wires.filter(w => compOfHook(w.to_hook_id) === c.id).map(w => compOfHook(w.from_hook_id)))].sort();
        const usedBy = [...new Set(wires.filter(w => compOfHook(w.from_hook_id) === c.id).map(w => compOfHook(w.to_hook_id)))].sort();
        const hooks = Object.values(reg.hook).filter(h => h.component_id === c.id).map(h => h.id.slice(c.id.length + 1));
        return [`${c.id}${c.name && c.name !== c.id ? `  (${c.name})` : ''}`,
          `  hooks: ${hooks.join(', ') || 'none'}`,
          `  depends on (${uses.length}): ${uses.slice(0, 25).join(', ') || 'nothing in loom'}${uses.length > 25 ? ', …' : ''}`,
          `  used by (${usedBy.length}) — the impact of changing it: ${usedBy.slice(0, 25).join(', ') || 'nothing in loom'}${usedBy.length > 25 ? ', …' : ''}`].join('\n');
      }).join('\n\n') + (exact.length ? '' : `\n\n(${hits.length} partial match${hits.length === 1 ? '' : 'es'} for "${query}")`);
    },
  },

  {
    name: 'nexus_introspect',
    description: 'Have the co-pilot examine an answer: its verdict on whether the response actually addressed the prompt, with the real signals behind it (lib/introspect.js through copilot :3750).',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, response: { type: 'string' }, userSaidWrong: { type: 'boolean', default: false } }, required: ['prompt', 'response'] },
    handler: async ({ prompt, response, userSaidWrong = false }) => {
      const r = await _post(`${CP_URL}/api/introspect`, { prompt, response, userSaidWrong }, 30000);
      if (!r || r.ok === false) throw new Error(`${_service(CP_URL)} — introspect failed: ${(r && r.error) || 'no answer'}`);
      const { ok, ...rest } = r;
      return `Introspection:\n${JSON.stringify(rest, null, 2).slice(0, 6000)}`;
    },
  },

  {
    name: 'nexus_contracts_check',
    description: 'Check that every event a NEXUS system emits is declared in its own event-taxonomy (EV0). Run it after adding an emit: new undeclared events are listed with file:line. Reads the repo; no service needed.',
    inputSchema: { type: 'object', properties: { system: { type: 'string', description: 'one system (e.g. idearium); omit for all held to the contract' } } },
    handler: async ({ system = null }) => {
      const EC = require('../../lib/event-contract-check.js');
      const root = require('path').resolve(__dirname, '..', '..');
      const base = EC.loadBaseline(root);
      const systems = system ? [system] : Object.keys(base.systems);
      if (system && !base.systems[system]) throw new Error(`${system} is not held to the contract — the systems are: ${Object.keys(base.systems).join(', ')}`);
      const lines = []; let bad = 0;
      for (const s of systems) {
        const r = EC.checkSystem(root, s), b = EC.againstBaseline(r, base.systems[s]);
        if (!b.ok) bad++;
        lines.push(`${b.ok ? '✓' : '✗'} ${s}: ${r.emitted.length} emitted, ${r.undeclared.length + r.unresolved.length} not yet declared`);
        for (const e of b.added) lines.push(`    new, undeclared: ${e}  ${((r.undeclared.find(x => x.event === e) || {}).sites || []).join(', ')} — declare it in ${r.taxonomyFile || `${s}/event-taxonomy.js`}`);
        for (const e of b.cleared) lines.push(`    declared now — drop from ${EC.BASELINE_FILE}: ${e}`);
        for (const c of r.missing || []) lines.push(`    emits undefined: ${c.constant} (${c.site})`);
      }
      return `${lines.join('\n')}\n\n${bad ? `${bad} system(s) drifted` : 'no new drift'}`;
    },
  },

  {
    name: 'nexus_proof_check',
    description: 'Run a repo\'s end-state conditions through Idearium\'s delivery checker (idearium :4800) and get the verdict in plain words: which promises are met, which are not, and the likely cause. conditions: [{ says, check: { kind: file|contains|command|output|tests|page, … } }].',
    inputSchema: { type: 'object', properties: { repoUuid: { type: 'string' }, conditions: { type: 'array', items: { type: 'object' } } }, required: ['repoUuid', 'conditions'] },
    handler: async ({ repoUuid, conditions }) => {
      const r = await _post(`${IDR_URL}/api/repos/${encodeURIComponent(repoUuid)}/deliver/check`, { conditions }, 600000);
      if (!r || r.ok === false) throw new Error(`${_service(IDR_URL)} — the proof run did not run: ${(r && r.error) || 'no answer'}`);
      const run = r.run || r;
      return [`${run.verdict === 'ready' ? 'READY' : 'NOT READY'} — ${run.met} of ${run.total} condition(s) met`,
        ...(run.results || []).map(x => `  ${x.met ? '✓' : '✗'} ${x.says}\n      ${x.evidence || ''}${x.met ? '' : `\n      likely cause: ${x.cause || '?'}`}`),
        run.files && run.files.report ? `report: ${run.files.report}` : ''].filter(Boolean).join('\n');
    },
  },

  // §0.39.376 CM2 — James: "Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can." The
  // same tool copilot and every repo agent have (lib/agent-tools/tools/nexus/command.js over the command table): any
  // `idearium <command>`, for Claude Code too. A Claude Code run started by a repo agent knows its repo
  // (NEXUS_MCP_REPO, set by lib/claude-code-backend.js); the person's own acts stay theirs.
  {
    name: 'nexus_command',
    description: 'Run any Nexus command — the same ones a person types as `idearium <command>`: "repo tasks", "repo activity", "activity", "repo desktop" (status|pause|resume|checkpoint|checkpoints|rewind <tag>), "repo system", "repo charter", "repo changes", "repo agent", "perf", "models". action "list" shows every command with its usage. repo: uuid or name (default: the repo this run works on). args: the words after the repo. flags: its --flags as an object. Approving proposals and stopping a system are the person\'s.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['run', 'list'] }, command: { type: 'string' }, repo: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, flags: { type: 'object' } } },
    handler: async (input = {}) => {
      const T = require('../../lib/agent-tools/tools/nexus/command.js').command;
      const r = await T.execute(input, { agent: 'claude-code', context: process.env.NEXUS_MCP_REPO ? { repoUuid: process.env.NEXUS_MCP_REPO } : {} });
      if (r && r.error) throw new Error(r.error);
      return JSON.stringify(r, null, 2);
    },
  },
];

// §WIRED 2026-09-12 — orchestrator/lib/mcp-tools-tokensave.js's own header
// says to spread these in here; done, not left as a dead, unwired file
// sitting next to the tools it describes.
const { TOOLS: TOKENSAVE_TOOLS } = require('./mcp-tools-tokensave.js');
TOOLS.push(...TOKENSAVE_TOOLS);

// ── MCP Protocol implementation ────────────────────────────────────────────────
// Implements MCP 2024-11-05 over HTTP with SSE transport

function _mcpResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function _mcpError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function _handleMCPRequest(body) {
  const { id, method, params } = body;

  if (method === 'initialize') {
    return _mcpResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'nexus-mcp', version: VERSION },
    });
  }

  if (method === 'tools/list') {
    return _mcpResponse(id, {
      tools: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return _mcpError(id, -32601, `Tool not found: ${name}`);

    try {
      const result = await tool.handler(args || {});
      return _mcpResponse(id, {
        content: [{ type: 'text', text: String(result) }],
      });
    } catch(e) {
      return _mcpError(id, -32603, `Tool error: ${e.message}`);
    }
  }

  if (method === 'notifications/initialized') {
    return null; // notification, no response
  }

  return _mcpError(id, -32601, `Method not found: ${method}`);
}

// ── HTTP server ────────────────────────────────────────────────────────────────

let _server = null;
const _sseClients = new Set();

function _cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

function start() {
  if (_server) return;

  _server = http.createServer(async (req, res) => {
    _cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${MCP_PORT}`);

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: VERSION, tools: TOOLS.length, port: MCP_PORT }));
      return;
    }

    // SSE stream (MCP transport)
    if (req.method === 'GET' && url.pathname === '/sse') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', server: 'nexus-mcp', version: VERSION })}\n\n`);
      _sseClients.add(res);
      req.on('close', () => _sseClients.delete(res));
      return;
    }

    // MCP JSON-RPC endpoint
    if (req.method === 'POST' && url.pathname === '/mcp') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const response = await _handleMCPRequest(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(response || '');
        } catch(e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Tool list (convenience REST endpoint)
    if (req.method === 'GET' && url.pathname === '/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        tools: TOOLS.map(t => ({ name: t.name, description: t.description.slice(0, 80) })),
        total: TOOLS.length,
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  _server.listen(MCP_PORT, '127.0.0.1', () => {
    console.log(`[${MODULE_ID}] v${VERSION} — MCP server :${MCP_PORT}`);
    console.log(`[${MODULE_ID}] ${TOOLS.length} tools: ${TOOLS.map(t => t.name).join(', ')}`);
    console.log(`[${MODULE_ID}] Claude Desktop config:`);
    console.log(`  { "nexus": { "url": "http://127.0.0.1:${MCP_PORT}/sse" } }`);
  });

  _server.on('error', e => {
    console.error(`[${MODULE_ID}] server error: ${e.message}`);
  });
}

function stop() {
  if (_server) { _server.close(); _server = null; }
  for (const client of _sseClients) { try { client.end(); } catch(_) {} }
  _sseClients.clear();
}

function status() {
  return {
    ok: !!_server,
    port: MCP_PORT,
    tools: TOOLS.length,
    toolNames: TOOLS.map(t => t.name),
    version: VERSION,
    clients: _sseClients.size,
  };
}

module.exports = { start, stop, status, TOOLS, MODULE_ID, VERSION };
