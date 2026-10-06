'use strict';
/**
 * lib/agent-tools/tool-catalog.js — every registered tool, in plain language.
 * comp_id: nexus.lib.agent-tools.tool-catalog
 *
 * §BUILT 0.39.257 — James: "need the full capabilities, with the /help and tool
 * awareness to help. need the commands as user friendly as possible." The Agent tab's
 * /tools, /help and copilot's GET /api/tools/list read this. Every tool in the live
 * registry lands in exactly one group — by the rules below, else "Other" — so a tool
 * added later is listed the moment it is registered, never silently missing (unlike
 * user-guide-generator.js's hand list, which throws on an ungrouped tool and covers
 * about half of today's registry).
 *
 * Pure over what it is given: catalog({ tools, noteFor }) takes the registry's
 * entries, so it is testable without loading the registry (loading it re-indexes
 * cortex's tool_index).
 */

const GROUPS = Object.freeze([
  // 0.39.278 — James: "solidify the coding for repos". The repo code tools (a project's own code, by meaning, by
  // reference, edited in place and checked) are their own category, first, apart from generic file tools.
  { id: 'code',    title: 'Code (repo)',                          test: n => /^(idearium\.repo_chunks\.tool|idearium\.code_[a-z]+\.tool|idearium\.work_surface\.tool|loom\.(?:find|card|read|write|test)\.tool)$/.test(n) },
  { id: 'files',   title: 'Files',                                test: n => /^(read_file|file_tree|search_files|delete_file|safe_apply|stub_finder|mock_data_finder|analyze|compiler_info|nexus\.syntax_debug\.tool)$/.test(n) },
  { id: 'debug',   title: 'Debugging & the intelligence system',  test: n => /^(diagnose|intelligence_query|nexus_intelligence|fault_log|loom_scan|nexus_heal|self_repair|resource_monitor|system_priority|query_movement|meta_query|axiom_check|emergence|cortex\.restep\.tool)$/.test(n) },
  { id: 'cos',     title: 'Compartments (COS)',                   test: n => /^cos_/.test(n) },
  { id: 'build',   title: 'Build & run',                          test: n => /^(run_command|run_pipeline|run_chain|run_closed_loop|module_builder|forge_tool|spec_wizard|framework_builder|guardian\.build\.tool|move_data|dedup_table|call_system)$/.test(n) },
  { id: 'version', title: 'Versions (Versionium)',                test: n => /^versionium[._]/.test(n) },
  { id: 'raid',    title: 'RAID, rules & automation',             test: n => /^(raid_snr|tool_config|axiom_manage|ask_james|register_trigger|schedule_task|loom_register)$/.test(n) },
  { id: 'agents',  title: 'Other agents & chats',                 test: n => /^(agent_|roundtable$|parallel_dispatch$|guardian_dispatch$|ollama_generate$|ncp_status$|switch_agent$|intent_hat$|hat_forge$|nexus_wake_events$|run_adversarial$|agent_mesh_route$)/.test(n) },
  { id: 'browser', title: 'Browser & Clear Glass',                test: n => /^(browser_action|clear_glass|clearglass\.|macro$|bookmarks_manage$|history_manage$|autofill_manage$|site_settings_manage$|account_manage$|ui_spotlight$|ui_nerve$|rewind_replay$)/.test(n) },
  { id: 'memory',  title: 'Memory & thinking',                    test: n => /^(query_recall|notes_todo|cortex\.node_tag\.tool|parse_lenses|intuition|mastermind|synthesize|ambiguity_pull|nexus\.context\.tool|nexus\.learn\.tool)$/.test(n) },
  { id: 'about',   title: 'About NEXUS itself',                   test: n => /^(nexus_help|nexus_status|nexus_capability|nexus_map|copilot_identity|nexus\.tools\.tool|nexus\.tools_expand\.tool)$/.test(n) },
  { id: 'ideas',   title: 'Ideas',                                test: n => /^propose_idea$/.test(n) },
  // 0.39.272 — jobs, gigs, Fiverr/Upwork leads (lib/opportunity)
  { id: 'work',    title: 'Jobs, gigs & leads',                   test: n => /^nexus\.opportunity\.tool$/.test(n) },
]);
const OTHER = { id: 'other', title: 'Other' };

function groupOf(name) { return GROUPS.find(g => g.test(name)) || OTHER; }

function firstSentence(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.{20,220}?[.!?])(\s|$)/);
  return (m ? m[1] : t.slice(0, 200)).trim();
}

/**
 * catalog({ tools, noteFor, scope }) -> [{ name, group, groupTitle, summary, use, params, inScope }]
 * tools: iterable of registry entries ({ name, description, parameters }).
 * scope: null/'all' = every tool in scope, else an array of allowed names.
 */
function catalog({ tools = [], noteFor = null, scope = null } = {}) {
  const allowed = Array.isArray(scope) ? new Set(scope) : null;
  const out = [];
  for (const t of tools) {
    if (!t || !t.name) continue;
    const g = groupOf(t.name);
    let use = null;
    try { const n = noteFor ? noteFor(t.name) : null; use = n && (n.use || n.prefer) ? String(n.use || n.prefer) : null; } catch (_) {}
    out.push({ name: t.name, group: g.id, groupTitle: g.title, summary: firstSentence(t.description), use,
      params: Object.keys((t.parameters && t.parameters.properties) || {}), inScope: allowed ? allowed.has(t.name) : true });
  }
  const order = [...GROUPS.map(g => g.id), OTHER.id];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name));
}

/** search(list, q) — tools whose name, group, summary or note mention every word of q. */
function search(list, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter(t => { const hay = `${t.name} ${t.groupTitle} ${t.summary} ${t.use || ''}`.toLowerCase(); return words.every(w => hay.includes(w)); });
}

/**
 * systemOf(name) — the system that owns a tool, for layer 2's branches. A dotted name says so itself
 * (idearium.code_edit.tool → idearium); a flat name by its prefix (cos_*, versionium_*, clear_glass*); the rest are
 * the shared core (lib/agent-tools) → 'nexus'.
 */
const FLAT_OWNERS = [[/^cos_/, 'cos'], [/^versionium_/, 'versionium'], [/^(clear_glass|clearglass)/, 'clearglass'],
  [/^guardian_/, 'guardian'], [/^ollama_/, 'ollama'], [/^ncp_/, 'ncp'], [/^loom_/, 'loom'], [/^agent_mesh/, 'mesh']];
function systemOf(name) {
  const m = /^([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*\.tool$/.exec(String(name || ''));
  if (m) return m[1];
  const f = FLAT_OWNERS.find(([re]) => re.test(name));
  return f ? f[1] : 'nexus';
}

/** categories(list) — layer 1: the non-empty groups in GROUPS order, each with its count and a few names. */
function categories(list, { examples = 4 } = {}) {
  const order = [...GROUPS, OTHER];
  const out = [];
  for (const g of order) {
    const names = list.filter(t => t.group === g.id).map(t => t.name);
    if (names.length) out.push({ id: g.id, title: g.title, count: names.length, examples: names.slice(0, examples) });
  }
  return out;
}

function _paramsOf(entry) {
  const p = (entry && entry.parameters) || {};
  const req = new Set(Array.isArray(p.required) ? p.required : []);
  return Object.entries(p.properties || {}).map(([name, s]) => ({
    name, type: (s && (s.type || (s.enum ? 'enum' : null))) || 'any', required: req.has(name),
    ...(s && s.enum ? { enum: s.enum } : {}), ...(s && s.description ? { description: String(s.description).slice(0, 200) } : {}),
  }));
}

/**
 * expand(list, category, { entries }) — layer 2: one category's tree, a branch per owning system, each tool with its
 * summary, guide note and typed parameters (read from `entries`, the registry's own schemas). The category is matched
 * by id or title, case-insensitively; an unknown one is an error naming the real ids — never an empty tree.
 */
function expand(list, category, { entries = null } = {}) {
  const want = String(category || '').trim().toLowerCase();
  const all = [...GROUPS, OTHER];
  const g = all.find(x => x.id === want || x.title.toLowerCase() === want);
  const present = categories(list).map(c => c.id);
  if (!g || !present.includes(g.id)) return { ok: false, error: `unknown category "${category}" — one of: ${present.join(', ')}` };
  const branches = new Map();
  for (const t of list.filter(x => x.group === g.id)) {
    const sys = systemOf(t.name);
    if (!branches.has(sys)) branches.set(sys, []);
    const e = entries && entries.get ? entries.get(t.name) : null;
    branches.get(sys).push({ name: t.name, summary: t.summary, use: t.use, params: e ? _paramsOf(e) : t.params.map(n => ({ name: n, type: 'any', required: false })) });
  }
  const out = [...branches.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([system, tools]) => ({ system, tools }));
  return { ok: true, category: g.id, title: g.title, count: out.reduce((n, b) => n + b.tools.length, 0), branches: out };
}

module.exports = { GROUPS, OTHER, groupOf, catalog, search, firstSentence, systemOf, categories, expand };
