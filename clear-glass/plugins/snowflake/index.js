'use strict';
/**
 * plugins/snowflake/index.js — "Open link with Snowflake" (context-menu-item), NP11/NP12; its page (settings), SF8 0.60.184.
 * Composes with core the way every plugin here does: ctx.emit / ctx.on only. It asks core to open the link ('net.open', answered by src/ipc/bridge.js, which
 * starts the transport if it is configured but off, waits for it, and opens a window whose session is forced through it). The plugin decides nothing about
 * routing and holds no proxy settings, so it cannot weaken the fail-closed rule; a disabled or crashed plugin just means no menu row.
 *
 * SF8 (0.60.184) — James, 2026-10-21: "you'll be able to import folders and host lists. Same with the Snowflake plugin." Reading, to confirm:
 * the sites in a host list always go through Snowflake. Its page imports a list file or a folder of them, adds one site, and removes a list.
 * The rules are written by core (src/net/host-import.js → the service's addRoutes → policy.addRule), so the policy's collision rule still decides,
 * and an import never overwrites a rule he made. Still nothing here holds proxy settings.
 */
function openLink(data, ctx) {
  const url = String((data && data.url) || '');
  let u; try { u = new URL(url); } catch (_) { u = null; }
  if (!u || !/^https?:$/.test(u.protocol)) {
    ctx.emit('driver.exec', { action: 'toast', agentId: (data && data.agentId) || 'default', msg: 'Snowflake can open http and https links only.', type: 'warn', durationMs: 4000 });
    return { type: 'plugin:snowflake:refused', data: { url } };
  }
  ctx.emit('net.open', { url: u.href, agentId: (data && data.agentId) || 'default' });
  return { type: 'plugin:snowflake:requested', data: { url: u.href } };
}

let _via = 'transport';   // where the next imported list goes; transport unless he picks direct or block
const net = () => require('../../src/net/service').service();
const HI = () => require('../../src/net/host-import');
const STATE = { running: 'On', ready: 'On', starting: 'Starting', bootstrapping: 'Starting', stopped: 'Off', failed: 'Failed' };

function _view() {
  const svc = net(); let st = { transport: { state: 'stopped' } }; try { st = svc.status(); } catch (_) {}
  const t = st.transport || {}; const lists = HI().lists(svc);
  const sites = lists.filter(l => l.via === 'transport').reduce((a, l) => a + l.hosts, 0);
  return {
    summary: { value: STATE[t.state] || (t.state ? String(t.state) : 'Off'), label: `Snowflake transport${t.socksPort ? ` · SOCKS ${t.socksPort}` : ''} · ${sites} imported site${sites === 1 ? '' : 's'} through it` },
    fields: [
      { type: 'info', label: 'How it works', value: 'Sites on these lists always go through Snowflake. When Snowflake is off they do not load (fail closed).' },
      { key: 'hostlists', type: 'list', label: 'Host lists', empty: 'No host list yet.', items: lists.map(l => ({ id: `${l.list}\u0000${l.via}`, label: l.list, sub: `${l.hosts.toLocaleString('en')} site${l.hosts === 1 ? '' : 's'} · ${l.via === 'transport' ? 'through Snowflake' : l.via} · ${l.sample.join(', ')}${l.hosts > l.sample.length ? '…' : ''}`, remove: true })) },
      { key: 'via', type: 'select', label: 'Imported sites go', value: _via, options: [{ value: 'transport', label: 'Through Snowflake' }, { value: 'direct', label: 'Direct (never through Snowflake)' }, { value: 'block', label: 'Blocked' }] },
      { key: 'hosts', type: 'import', label: 'Import a host list', accept: ['file', 'folder'], help: 'A hosts file, a list of domains, ||host^ lines or URLs — or a folder of them. Each file becomes one list.' },
      { key: 'site', type: 'add', label: 'Add a site', placeholder: 'example.com', button: 'Add' },
    ],
  };
}

const said = (r) => {
  const one = (x) => `${x.added} added${x.skipped.duplicate ? `, ${x.skipped.duplicate} already there` : ''}${x.skipped.collision.length ? `, ${x.skipped.collision.length} already routed another way (${x.skipped.collision.slice(0, 3).map(c => c.host).join(', ')}${x.skipped.collision.length > 3 ? '…' : ''}; kept as they were)` : ''}${x.skipped.overLimit ? `, ${x.skipped.overLimit} over the 5,000 limit` : ''}`;
  if (r.results) return r.results.map(x => `${require('path').basename(x.file)}: ${one(x)}`).join(' · ') + (r.skipped.length ? ` · skipped: ${r.skipped.slice(0, 3).map(x => `${require('path').basename(x.path)} (${x.why})`).join(', ')}` : '') || 'Nothing read';
  return one(r);
};

/** settings({ op, key, value, requestId }) → plugin:settings { requestId, view, note } */
function settings(data = {}) {
  const reply = (extra = {}) => { let view; try { view = _view(); } catch (e) { view = { fields: [{ type: 'info', label: 'Not ready', value: e.message }] }; } return { type: 'plugin:settings', data: { requestId: data.requestId, view, ...extra } }; };
  const { op = 'get', key, value } = data;
  if (op === 'summary') { const r = reply(); return { type: 'plugin:settings', data: { requestId: data.requestId, view: { summary: r.data.view.summary } } }; }
  if (op !== 'set') return reply();
  try {
    if (key === 'via' && ['transport', 'direct', 'block'].includes(value)) { _via = value; return reply({ note: `Imported sites will go ${value === 'transport' ? 'through Snowflake' : value}` }); }
    if (key === 'hosts' && value && Array.isArray(value.paths)) return reply({ note: said(HI().importPaths(net(), value.paths, { via: _via })) });
    if (key === 'site' && value) { const hosts = HI().hostsOf(String(value)); if (!hosts.length) return reply({ note: `Not a site: ${value}` }); return reply({ note: `${hosts.join(', ')}: ${said(HI().importHosts(net(), hosts, { via: _via, list: 'added by hand' }))}` }); }
    if (key === 'hostlists' && value && value.remove) { const [list] = String(value.id).split('\u0000'); const r = HI().removeList(net(), list); return reply({ note: `${list}: ${r.removed} rule${r.removed === 1 ? '' : 's'} removed` }); }
  } catch (e) { return reply({ note: `Not done: ${e.message}` }); }
  return reply();
}

// BS19 (0.60.185) — James: "still missing snowflake from tghe ocntext menu". A page right-click (not on a link) offers the page itself; the
// window sends the page's URL, and the same core path opens it (net.open), so nothing about routing changes.
const openPage = openLink;

module.exports = { openLink, openPage, settings };
