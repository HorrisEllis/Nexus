/**
 * cos/ui/proposals/page.js — agents' held acts (MOD-MG-UI-PROPOSALS, MG-006). MG18, 0.60.336.
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus." A proposal shows the agent, the act, the target, the agent's
 * reason and its age; if the target's state changed since the agent asked, that is shown before Take (GATE-MGUI-PR-002: take confirmed).
 */
(async function () {
  'use strict';
  const { h, icon, esc } = COS; const $ = (id) => document.getElementById(id);
  const S = { all: [], tab: 'held' };
  try { await COS.page('proposals'); } catch (e) { return e.down ? COS.down($('list'), e.message) : COS.say($('list'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  async function load() {
    try { S.all = (await COS.call('GET', '/api/cos/proposals')).proposals; render(); }
    catch (e) { e.down ? COS.down($('list'), e.message) : COS.notice('err', e.message); }
  }
  async function now(target) { try { return (await COS.call('GET', `/api/cos/systems/${encodeURIComponent(target)}`)).system; } catch (_) { return null; } }
  async function take(p) {
    const cur = await now(p.target);
    const changed = cur && (cur.state !== p.seen.state || cur.pid !== p.seen.pid) ? `<br><br><b>It has changed since ${esc(p.by)} asked:</b> it was ${esc(COS.stateLabel(p.seen.state))}, it is ${esc(COS.stateLabel(cur.state))} now.` : '';
    if (!await COS.confirm({ title: `${p.verb} ${p.target}?`, body: `${esc(p.by)} proposed it: “${esc(p.why)}”${changed}<br><br>Taken, it runs now as <b>your</b> act.`, act: `Take and ${p.verb}`, danger: p.verb === 'stop' })) return;
    try { const r = await COS.call('POST', `/api/cos/proposals/${encodeURIComponent(p.id)}/take`, { by: 'person' });
      COS.notice(r.proposal.status === 'failed' ? 'err' : 'ok', r.proposal.status === 'failed' ? `Taken, and it failed: ${r.proposal.error}` : `Taken: ${p.verb} ${p.target}.`); load(); }
    catch (e) { if (!e.refused) COS.notice('err', e.message); }
  }
  async function drop(p) {
    if (!await COS.confirm({ title: `Drop ${p.by}'s proposal?`, body: `${esc(p.verb)} ${esc(p.target)} will not run. The drop is written to the ledger.`, act: 'Drop' })) return;
    try { await COS.call('POST', `/api/cos/proposals/${encodeURIComponent(p.id)}/drop`, { by: 'person' }); COS.notice('ok', 'Dropped.'); load(); }
    catch (e) { if (!e.refused) COS.notice('err', e.message); }
  }
  function render() {
    const held = S.all.filter(p => p.status === 'held'), closed = S.all.filter(p => p.status !== 'held');
    $('tabs').replaceChildren(...[['held', 'Waiting', held.length], ['closed', 'Closed', closed.length]].map(([k, t, n]) =>
      h('button', { class: 'chip', 'aria-pressed': String(S.tab === k), onclick: () => { S.tab = k; render(); } }, t, h('span', { class: 'n' }, String(n)))));
    const list = S.tab === 'held' ? held : closed;
    if (!list.length) return COS.say($('list'), S.tab === 'held'
      ? { glyph: 'inbox', title: 'Nothing waits for you', text: 'When an agent wants to act on a system it posts a proposal to <code>POST /api/cos/proposals</code>, and it appears here.' }
      : { glyph: 'list', title: 'Nothing closed yet', text: 'Proposals you take or drop are kept here, and on the ledger.' });
    $('list').replaceChildren(...list.map(p => h('article', { class: `prop panel rise${p.status === 'held' ? '' : ' closed'}` },
      h('div', { class: 'who', title: p.by }, (p.by.replace(/^agent:/, '')[0] || 'A').toUpperCase()),
      h('div', {},
        h('h3', { html: `<span class="verb">${esc(p.verb)}</span> ${esc(p.target)}` }),
        h('p', { class: 'reason' }, `“${p.why}”`),
        h('div', { class: 'meta' }, h('span', {}, p.by), h('span', {}, `asked ${COS.ago(p.at)}`), h('span', {}, `saw it ${COS.stateLabel(p.seen.state)}`),
          p.status !== 'held' ? h('span', { class: `status ${p.status}` }, `${p.status} by ${p.closedBy} ${COS.ago(p.closedAt)}`) : null),
        p.error ? h('div', { class: 'changed' }, p.error) : null),
      p.status === 'held' ? h('div', { class: 'acts' },
        h('button', { class: 'btn sm quiet', onclick: () => drop(p) }, 'Drop'),
        h('button', { class: 'btn sm primary', onclick: () => take(p), html: `${icon('check')}<span>Take</span>` })) : h('span'))));
  }
  COS.on('cos.ledger', ({ entry }) => { if (/^proposal-/.test(entry.kind)) load(); });
  load();
})();
