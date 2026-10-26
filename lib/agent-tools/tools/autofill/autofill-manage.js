'use strict';
/**
 * lib/agent-tools/tools/autofill/autofill-manage.js — autofill_manage tool
 * UUID: nexus-agent-tools-autofill-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "autofill... deep and enterprise grade
 * code. Follow axioms." Real profile CRUD (clear-glass/src/autofill/
 * store.js), a real, evidence-graded field-matching engine (matcher.js
 * — autocomplete attribute first, per the actual WHATWG standard, name/
 * id/placeholder heuristics only as real fallbacks, each match
 * carrying its own real confidence), and two real orchestration
 * actions (detect: preview only; fill: actually dispatches, default
 * refuses low-confidence matches). Found and fixed a real, pre-existing
 * bug along the way: dom_mutate's own value-setting never worked
 * correctly against a React/Vue-controlled input and never dispatched
 * a real input/change event — fixed at the source in
 * clear-glass/src/dom/archaeology.js's mutate(), not worked around
 * here, since every other real caller of dom_mutate's value mutation
 * had the exact same bug.
 *
 * §SUPERSEDED 0.60.251 (AD1) — the uploads limit below still holds for THIS fill (matcher.js skips
 * type=file); the driver gained `upload` in 0.39.272 and nexus.opportunity.tool's prepare uploads the resume (lib/opportunity
 * apply.js planFill). The Guardian transport this tool used never reached Clear Glass (see §AD1 below). Kept as written (§0.3).
 *
 * §HONEST LIMIT, NAMED NOT HIDDEN — file-upload fields (resume PDFs)
 * are NOT filled by this tool. ClearDriver has no real file-input-
 * setting capability at all (checked directly, zero matches for
 * setInputFiles/uploadFile anywhere in clear-glass/src/driver/
 * index.js) — a real, separate, larger gap, not faked here. detect/
 * fill both correctly exclude type="file" inputs from their real
 * match set rather than silently failing on them.
 *
 * §HONEST LIMIT — traced and unit-tested (the matcher and store are
 * pure/file-backed and were run for real against realistic input),
 * but detect/fill's own real dom.handleQuery/handleMutate round trip
 * has NOT been run against a live Electron instance — same honest
 * limit every ClearGlass-facing tool this session names.
 */

// §AD1 0.60.251 — James, 2026-10-25: "need clearglass' fiverr, job application automation, autofill and macros working fully,
// including with the agents and copilot." Read in the code before this change (§0.1): this tool posted a Guardian job with
// provider 'autofill', but guardian/lib/dispatcher.js sends only provider 'browser' to Clear Glass — the job waited on a chat
// lane named 'autofill' that does not exist, and every call ended in the 30s timeout (§1.2: a timeout, never the reason). Even
// on the browser lane, clear-glass-bridge's _responseTypeFor would wait on 'autofill.profile.result' for a gate that emits
// 'autofill.profile.created', and the bus gates never pass the learned map. Decided by his axioms (§8.6, AD_D1): this tool now
// calls Clear Glass's own /cli/autofill/* routes — the ones the Settings panel and the co-pilot use (learned fields, needsPick,
// the Fiverr gig, the picker) — through clearglass.browser.tool's _call, the direct :7702 door. The Guardian path above is in
// git history (§0.3); the bus gates stay for bus callers.
const _call = (...a) => require('../clear-glass/browser.js')._call(...a);
const _q = (u) => (u ? `?url=${encodeURIComponent(u)}` : '');

const REAL_ACTIONS = {
  // the 7 actions this tool always named, same names and data shapes
  listProfiles:  ()  => _call('GET', '/cli/autofill/profiles'),
  getProfile:    (d) => (d.id ? _call('GET', `/cli/autofill/profiles/${encodeURIComponent(d.id)}`) : { ok: false, error: 'getProfile needs {id}' }),
  createProfile: (d) => _call('POST', '/cli/autofill/profiles', d),
  updateProfile: (d) => (d.id ? _call('PUT', `/cli/autofill/profiles/${encodeURIComponent(d.id)}`, d.updates || {}) : { ok: false, error: 'updateProfile needs {id, updates}' }),
  deleteProfile: (d) => (d.id ? _call('DELETE', `/cli/autofill/profiles/${encodeURIComponent(d.id)}`) : { ok: false, error: 'deleteProfile needs {id}' }),
  detect:        (d) => _call('POST', '/cli/autofill/detect', { agentId: d.agentId || 'default', profileId: d.profileId }),
  fill:          (d) => _call('POST', '/cli/autofill/fill', { agentId: d.agentId || 'default', profileId: d.profileId, minConfidence: d.minConfidence || 'medium', vars: d.vars }),
  // §AD1 — what the person and the co-pilot already had, now the agents' too
  fieldTypes:    ()  => _call('GET', '/cli/autofill/field-types'),
  gig:           (d) => _call('POST', '/cli/autofill/gig/autofill', { agentId: d.agentId || 'default', offer: d.offer || '', profileId: d.profileId || null, minConfidence: d.minConfidence || 'medium' }, 180000),
  gigDraft:      (d) => _call('POST', '/cli/autofill/gig', d, 180000),
  gigDetect:     (d) => _call('POST', '/cli/autofill/gig/detect', { agentId: d.agentId || 'default', gig: d.gig }),
  gigFill:       (d) => _call('POST', '/cli/autofill/gig/fill', { agentId: d.agentId || 'default', gig: d.gig, minConfidence: d.minConfidence || 'medium' }),
  pick:          (d) => (d.fieldType ? _call('POST', '/cli/autofill/pick', { agentId: d.agentId || 'default', fieldType: d.fieldType, profileId: d.profileId || null, label: d.label || null }, 5 * 60000) : { ok: false, error: 'pick needs {fieldType} (a fill\'s needsPick.unplaced)' }),
  learn:         (d) => (d.fieldKey && d.fieldType ? _call('POST', '/cli/autofill/learn', { agentId: d.agentId || 'default', fieldKey: d.fieldKey, fieldType: d.fieldType, url: d.url || null }) : { ok: false, error: 'learn needs {fieldKey, fieldType}' }),
  learned:       (d) => _call('GET', `/cli/autofill/learned${_q(d.url)}`),
  forget:        (d) => (d.url && d.fieldKey ? _call('POST', '/cli/autofill/forget', { url: d.url, fieldKey: d.fieldKey }) : { ok: false, error: 'forget needs {url, fieldKey}' }),
  // §AT2 0.60.256 — James, 2026-10-26: "i want to be able to import and export the data." The .autofill file (clear-glass/src/autofill/transfer.js)
  export:        ()  => _call('GET', '/cli/autofill/export'),
  import:        (d) => (d.text ? _call('POST', '/cli/autofill/import', { text: String(d.text), by: 'agent' }) : { ok: false, error: 'import needs {text} (an .autofill file\'s contents)' }),
  importUndo:    ()  => _call('POST', '/cli/autofill/import/undo', {}),
};

module.exports = {
  name: 'autofill_manage',
  description:
    'Clear Glass autofill — job applications, the Fiverr gig editor, contact forms — through the same routes the Settings panel ' +
    'and the co-pilot use. detect previews which fields WOULD be filled and how confidently (high: the field declares its purpose ' +
    'via the HTML autocomplete attribute, or the person taught it on this site; medium: name/id; low: placeholder only) without ' +
    'touching the page. fill types the values in (low-confidence refused by default; file fields are left — nexus.opportunity.tool prepare ' +
    'uploads the resume for an application in the pipeline) and returns needsPick.unplaced — the profile values no field took; for each, pick pops the element picker for the person to ' +
    'click the box (saved per site, the page filled again), or learn teaches a field by its label/name/id. gig fills the Fiverr gig ' +
    'editor in the tab (the gig already written, else one written from the Fiverr profile + offer, else needsGig: ask for one line). ' +
    'Never saves, submits or publishes. ' +
    `Params: action (one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — getProfile/deleteProfile {id}; createProfile ` +
    '{label, fields?, documents?}; updateProfile {id, updates}; detect/fill {profileId?, agentId?, minConfidence?, vars?}; gig ' +
    '{agentId?, offer?, profileId?}; pick {fieldType, agentId?}; learn {fieldKey, fieldType, url?|agentId?}; learned {url?}; forget {url, fieldKey}; export {} → {text, filename}; import {text} (merges, keeps what it replaced); importUndo {}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which autofill action to perform' },
      data:   { type: 'object', description: 'Action-specific parameters' },
    },
    required: ['action'],
  },
  execute: async ({ action, data = {} } = {}) => {
    const fn = REAL_ACTIONS[action];
    if (!fn) return { error: `unknown action "${action}" — expected one of: ${Object.keys(REAL_ACTIONS).join(', ')}` };
    const r = await fn(data || {});
    if (!r || r.ok === false || (r.error && !r.needsGig && !r.cancelled)) return { error: (r && r.error) || 'no reply from Clear Glass', ...(r || {}) };
    return { ok: true, action, result: r };
  },
  REAL_ACTIONS,
};
