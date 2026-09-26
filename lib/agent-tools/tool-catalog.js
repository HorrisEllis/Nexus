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
  { id: 'files',   title: 'Files & code',                         test: n => /^(read_file|file_tree|search_files|delete_file|safe_apply|stub_finder|mock_data_finder|analyze|compiler_info|nexus\.syntax_debug\.tool|idearium\.repo_chunks\.tool)$/.test(n) },
  { id: 'debug',   title: 'Debugging & the intelligence system',  test: n => /^(diagnose|intelligence_query|nexus_intelligence|fault_log|loom_scan|nexus_heal|self_repair|resource_monitor|system_priority|query_movement|meta_query|axiom_check|emergence|cortex\.restep\.tool)$/.test(n) },
  { id: 'cos',     title: 'Compartments (COS)',                   test: n => /^cos_/.test(n) },
  { id: 'build',   title: 'Build & run',                          test: n => /^(run_command|run_pipeline|run_chain|run_closed_loop|module_builder|forge_tool|spec_wizard|framework_builder|guardian\.build\.tool|move_data|dedup_table|call_system)$/.test(n) },
  { id: 'version', title: 'Versions (Versionium)',                test: n => /^versionium[._]/.test(n) },
  { id: 'raid',    title: 'RAID, rules & automation',             test: n => /^(raid_snr|tool_config|axiom_manage|ask_james|register_trigger|schedule_task|loom_register)$/.test(n) },
  { id: 'agents',  title: 'Other agents & chats',                 test: n => /^(agent_|roundtable$|parallel_dispatch$|guardian_dispatch$|ollama_generate$|ncp_status$|switch_agent$|intent_hat$|hat_forge$|nexus_wake_events$|run_adversarial$|agent_mesh_route$)/.test(n) },
  { id: 'browser', title: 'Browser & Clear Glass',                test: n => /^(browser_action|clear_glass|clearglass\.|macro$|bookmarks_manage$|history_manage$|autofill_manage$|site_settings_manage$|account_manage$|ui_spotlight$|ui_nerve$|rewind_replay$)/.test(n) },
  { id: 'memory',  title: 'Memory & thinking',                    test: n => /^(query_recall|notes_todo|cortex\.node_tag\.tool|parse_lenses|intuition|mastermind|synthesize|ambiguity_pull)$/.test(n) },
  { id: 'about',   title: 'About NEXUS itself',                   test: n => /^(nexus_help|nexus_status|nexus_capability|nexus_map|copilot_identity)$/.test(n) },
  { id: 'ideas',   title: 'Ideas',                                test: n => /^propose_idea$/.test(n) },
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

module.exports = { GROUPS, OTHER, groupOf, catalog, search, firstSentence };
