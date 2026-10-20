'use strict';
/**
 * lib/agent-tools/tools/clear-glass/firefox.js — clear_glass_firefox: which Firefox profiles this machine has (BS7, 0.60.179).
 * Spec: clear-glass/spec/browser-shell.spec MOD-BSH-SURFACE.
 *
 * James, 2026-10-21: "can you build a import for firefox profiles and cookies for clearglass.?" An agent may LIST the profiles (name, default,
 * what each holds) so it can tell him what is there. It may not import: cookies are his sign-ins, so bringing them in is his act
 * (`idearium firefox import`, or Settings → Import). Reaches Clear Glass's :7702 /cli/firefox/profiles, the same door the command uses.
 */
const { _call } = require('./net.js');

module.exports = {
  name: 'clear_glass_firefox',
  description: 'List the Firefox profiles on this machine that Clear Glass can import from (name, whether it is the default, and whether it has cookies, bookmarks and prefs). ' +
    'Read-only: importing cookies is the person\'s act and is refused here. Returns ok:false if Clear Glass is not running.',
  parameters: { type: 'object', properties: { action: { type: 'string', enum: ['profiles', 'import'] } }, required: ['action'] },
  execute: async (a = {}) => {
    if (a.action === 'import') return { ok: false, error: 'importing Firefox cookies brings in his sign-ins, so it is a person\'s act. Ask him to run: idearium firefox import [profile], or use Settings → Import.' };
    try { const r = await _call('GET', '/cli/firefox/profiles'); return { ok: r.ok !== false, profiles: (r.profiles || []).map(p => ({ name: p.name, isDefault: p.isDefault, has: p.has })), looked: r.looked }; }
    catch (e) { return { ok: false, error: `clear_glass_firefox failed: ${e.message}` }; }
  },
};
