'use strict';
/**
 * cortex/core/raid/context-synthesis.js — synthesizeContext(): stage 1
 * comp_id: cortex.raid.context-synthesis
 * uuid: nexus-cortex-raid-context-synthesis-v1-0000-2026-0902-jamesbrooks-001
 * Version: 0.1.0
 *
 * §BUILT 2026-09-02 — docs/contracts/context-synthesis-pipeline.spec's
 * stage_1_data_to_context, made real. The confirmed gap this fills: no
 * single mechanism unioned cortex + loom + raid + guardian into one
 * candidate stream (warp/dispatch's "reuse" is a cache index over its
 * OWN generated candidates, not this — checked directly before writing
 * anything here).
 *
 * §REUSE, NOT REINVENT — every one of the 5 real per-system query tools
 * (lib/agent-tools/tools/query/{query-recall,query-movement,meta-query,
 * nexus-map,agent-chat-search}.js, lib/agent-tools/tools/diagnostic/
 * loom-scan.js) already correctly handles its own process boundary
 * (cortex/loom/guardian are separate real processes, each already
 * reached over the right port by these modules). This file calls their
 * real .execute() directly, in-process — it does NOT reimplement any
 * HTTP plumbing they already got right.
 *
 * §HONEST FILTER SCOPE — checked each tool's real parameters before
 * writing this: only query_recall (query) and agent_chat_search
 * (action:'search', query) take a real server-side keyword filter.
 * loom_scan, query_movement, and nexus_map's real actions return whole
 * snapshots/topic dumps — no server-side keyword param exists on any of
 * them. Their candidates are POST-FILTERED here, client-side, against
 * query.keywords/query.tags — never silently treated as pre-filtered
 * just because a keyword was requested.
 *
 * §DOES NOT RANK, DEDUPE, OR GATE — per the pipeline spec's own
 * boundary: this returns the raw, tagged candidate stream. Judging a
 * candidate against a specific contract's boundary is
 * context-candidate.spec's in_bounds_check, a separate, not-yet-built
 * step — kept separate on purpose so this function stays reusable
 * across every contract, not re-derived per boundary.
 *
 * §RE-APPLIED 2026-09-03 — this file existed in an earlier working copy
 * that pre-dates this zip snapshot; the snapshot didn't include it.
 * Re-checked before re-adding: all 5 real dependency paths below still
 * resolve unchanged in this snapshot (confirmed by direct file check,
 * not assumed from the earlier copy).
 */

const queryRecall       = require('../../../lib/agent-tools/tools/query/query-recall.js');
const queryMovement     = require('../../../lib/agent-tools/tools/query/query-movement.js');
const nexusMap          = require('../../../lib/agent-tools/tools/query/nexus-map.js');
const agentChatSearch   = require('../../../lib/agent-tools/tools/query/agent-chat-search.js');
const loomScan          = require('../../../lib/agent-tools/tools/diagnostic/loom-scan.js');

// §HONEST SCOPE — idearium deliberately excluded from ALL_SYSTEMS. Per
// the pipeline spec: idearium's chunk/manifest tables are real and
// queryable via its own db.js, but not yet exposed through any agent
// tool this function can call. Listed here, commented, so the gap stays
// visible rather than silently omitted.
const ALL_SYSTEMS = ['cortex', 'loom', 'raid', 'guardian', 'nexus_map']; // 'idearium' — no real query path yet, see header

function _tokenMatch(text, tokens) {
  if (!tokens.length) return true; // no filter requested — everything passes
  const lower = String(text || '').toLowerCase();
  return tokens.some(t => lower.includes(String(t).toLowerCase()));
}

/**
 * synthesizeContext(query, opts) — real, per-system fan-out.
 *
 * @param {object} query - { tags: string[], keywords: string[] }
 * @param {object} opts  - { systems: string[] — subset of ALL_SYSTEMS, default all }
 * @returns {Promise<{ candidates: object[], blind: object[] }>}
 *   candidates — tagged { id, kind, source_tool, raw }, per
 *   context-candidate.spec#candidate. NEVER an empty array standing in
 *   for a system that actually failed — a system that could not be
 *   read lands in `blind`, never silently folded into an empty result,
 *   same convention query_movement's own blind[] already uses.
 */
async function synthesizeContext(query = {}, opts = {}) {
  const tags     = Array.isArray(query.tags) ? query.tags : [];
  const keywords = Array.isArray(query.keywords) ? query.keywords : [];
  const filterTokens = [...tags, ...keywords];
  const systems = Array.isArray(opts.systems) && opts.systems.length
    ? opts.systems.filter(s => ALL_SYSTEMS.includes(s))
    : ALL_SYSTEMS;

  const candidates = [];
  const blind = [];

  // ── cortex — real server-side keyword filter (query_recall) ────────────
  if (systems.includes('cortex')) {
    try {
      const r = await queryRecall.execute({ query: filterTokens.join(' ') || (tags[0] || keywords[0] || ''), intent: 'general' });
      if (r.error) blind.push({ system: 'cortex', source_tool: 'query_recall', reason: r.error });
      else for (const item of (r.results || [])) {
        candidates.push({ id: item.id || null, kind: 'chat_exchange', source_tool: 'query_recall', raw: item });
      }
    } catch (e) { blind.push({ system: 'cortex', source_tool: 'query_recall', reason: e.message }); }
  }

  // ── guardian — real server-side keyword filter (agent_chat_search) ─────
  if (systems.includes('guardian')) {
    try {
      const r = await agentChatSearch.execute({ action: 'search', query: filterTokens.join(' ') || (tags[0] || keywords[0] || ''), scope: 'all' });
      if (r.error) blind.push({ system: 'guardian', source_tool: 'agent_chat_search', reason: r.error });
      else for (const item of (r.results || [])) {
        candidates.push({ id: item.id || item.uuid || null, kind: 'chat_exchange', source_tool: 'agent_chat_search', raw: item });
      }
    } catch (e) { blind.push({ system: 'guardian', source_tool: 'agent_chat_search', reason: e.message }); }
  }

  // ── loom — no server-side keyword param on any real action; post-filter ─
  if (systems.includes('loom')) {
    try {
      const r = await loomScan.execute({ action: 'capabilities' });
      if (r.error) blind.push({ system: 'loom', source_tool: 'loom_scan', reason: r.error });
      else {
        const items = Array.isArray(r.capabilities) ? r.capabilities : (Array.isArray(r) ? r : []);
        for (const item of items) {
          const text = `${item.id || ''} ${item.name || ''} ${item.description || ''}`;
          if (_tokenMatch(text, filterTokens)) {
            candidates.push({ id: item.id || null, kind: 'component', source_tool: 'loom_scan', raw: item });
          }
        }
      }
    } catch (e) { blind.push({ system: 'loom', source_tool: 'loom_scan', reason: e.message }); }
  }

  // ── raid — real two-step call: query_movement's own real code requires
  // `system` on "snapshot" (its description text says otherwise, but the
  // actual ACTIONS.snapshot in query-movement.js hard-checks a.system —
  // confirmed by actually RUNNING this against a live-but-backend-down
  // instance and reading the real error string, not by trusting the
  // tool's own description). Discover real system names via "systems"
  // first, then snapshot each — never guess a system name.
  if (systems.includes('raid')) {
    try {
      const list = await queryMovement.execute({ action: 'systems' });
      if (list.error) blind.push({ system: 'raid', source_tool: 'query_movement', reason: list.error });
      else {
        const names = Array.isArray(list.systems) ? list.systems : (Array.isArray(list) ? list : []);
        for (const name of names) {
          try {
            const snap = await queryMovement.execute({ action: 'snapshot', system: name });
            if (snap.error) { blind.push({ system: `raid:${name}`, source_tool: 'query_movement', reason: snap.error }); continue; }
            const gaps = (snap.gaps && Array.isArray(snap.gaps.top)) ? snap.gaps.top : [];
            const text = `${name} ${JSON.stringify(snap.gaps || {})}`;
            if (_tokenMatch(text, filterTokens)) {
              candidates.push({ id: name, kind: 'gap', source_tool: 'query_movement', raw: snap });
            }
          } catch (e) { blind.push({ system: `raid:${name}`, source_tool: 'query_movement', reason: e.message }); }
        }
      }
    } catch (e) { blind.push({ system: 'raid', source_tool: 'query_movement', reason: e.message }); }
  }

  // ── nexus_map — no server-side keyword param; post-filter over graph ────
  if (systems.includes('nexus_map')) {
    try {
      const r = await nexusMap.execute({ action: 'graph' });
      if (r.error) blind.push({ system: 'nexus_map', source_tool: 'nexus_map', reason: r.error });
      else {
        const components = Array.isArray(r.components) ? r.components : [];
        for (const item of components) {
          const text = `${item.id || ''} ${item.name || ''}`;
          if (_tokenMatch(text, filterTokens)) {
            candidates.push({ id: item.id || null, kind: 'component', source_tool: 'nexus_map', raw: item });
          }
        }
      }
    } catch (e) { blind.push({ system: 'nexus_map', source_tool: 'nexus_map', reason: e.message }); }
  }

  return { candidates, blind };
}

module.exports = { synthesizeContext, ALL_SYSTEMS };
