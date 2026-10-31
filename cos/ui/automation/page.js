/**
 * cos/ui/automation/page.js — the supervisor's policy as a form (MOD-MG-UI-AUTOMATION: "including the supervisor's policy (SupervisorPolicy)
 * as a settings form"). MG18 release, 0.60.336. Each value says its layer (the default, or set at runtime); a change is confirmed, sent as one
 * PATCH with by = person, and read back (GATE-MGUI-AU-002). Macros and rules wait on MG7, said on the page.
 */
(async function () {
  'use strict';
  const { h, esc } = COS; const $ = (id) => document.getElementById(id);
  const S = { policy: null, defaults: null, edits: {} };
  // [path, title, what, unit, toUi, fromUi, kind]
  const s = (ms) => ms / 1000, ms = (v) => Math.round(Number(v) * 1000), pc = (f) => Math.round(f * 1000) / 10, fr = (v) => Number(v) / 100, min = (ms) => ms / 60000, mms = (v) => Math.round(Number(v) * 60000);
  const GROUPS = [
    { t: 'Boot', d: 'What starts when COS boots.', rules: [['bootSet', 'Boot set', 'All: every declared system that is not on demand. Core: only the critical set; every other system starts when asked (CS4a).', '', x => x, x => x, 'select']] },
    { t: 'Restart', d: 'A crashed system is restarted after a backoff that doubles each time.', rules: [
      ['restart.backoffMs.0', 'First wait', 'How long after a crash before the first restart.', 's', s, ms], ['restart.backoffMs.1', 'Longest wait', 'The backoff never grows past this.', 's', s, ms],
      ['restart.factor', 'Growth', 'Each wait is the last one times this.', '×', x => x, Number], ['stableMs', 'Stable after', 'Up this long, and the backoff starts over.', 's', s, ms]] },
    { t: 'Circuit', d: 'A system that will not stay up is stopped and said, not retried forever.', rules: [
      ['circuit.maxRestarts', 'Crashes allowed', 'This many crashes within the window opens the circuit.', '', x => x, Number], ['circuit.windowMs', 'Window', 'The window the crashes are counted in.', 'min', min, mms]] },
    { t: 'Memory', d: 'Spawns wait while the machine is short of memory.', rules: [
      ['memoryHaltPct', 'Floor', 'Below this much free memory, no system is started.', '%', pc, fr], ['criticalHaltPct', 'Floor for critical', 'Critical systems may start down to this.', '%', pc, fr],
      ['memBackoffMs', 'Try again after', 'A refused start is tried again after this.', 's', s, ms], ['maxOldSpaceMB', 'Heap per system', 'Each Node system\'s heap cap, unless it declares its own.', 'MB', x => x, Number]] },
    { t: 'Health and idle', d: 'How long COS waits, and when on-demand systems rest.', rules: [
      ['phaseGateMs', 'Health wait', 'How long a boot phase waits for its systems\' health.', 's', s, ms], ['idleMs', 'Idle after', 'An on-demand system with no activity this long is stopped.', 'min', min, mms],
      ['stopGraceMs', 'Stop grace', 'After asking a system to stop, how long before it is ended.', 's', s, ms]] },
  ];
  const at = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  try { await COS.page('automation'); } catch (e) { return e.down ? COS.down($('form'), e.message) : COS.say($('form'), { glyph: 'x', title: 'This page could not start', text: esc(e.message) }); }

  async function load() {
    try { const r = await COS.call('GET', '/api/cos/policy'); S.policy = r.policy; S.defaults = r.defaults; S.edits = {}; render(); }
    catch (e) { e.down ? COS.down($('form'), e.message) : COS.notice('err', e.message); }
  }
  function render() {
    $('form').replaceChildren(...GROUPS.map(g => h('section', { class: 'group panel rise' },
      h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, g.t), h('p', {}, g.d))),
      h('div', { class: 'panel-body' }, ...g.rules.map(([p, t, d, unit, toUi, , kind]) => {
        const cur = at(S.policy, p), def = at(S.defaults, p), changed = JSON.stringify(cur) !== JSON.stringify(def), dirty = p in S.edits;
        const input = kind === 'select'
          ? h('select', { class: 'input', 'data-p': p, onchange: (e) => edit(p, e.target.value) }, ...['all', 'core'].map(v => h('option', { value: v, selected: (dirty ? S.edits[p] : cur) === v }, v)))
          : h('input', { class: 'input mono', type: 'number', step: 'any', min: '0', 'data-p': p, value: dirty ? S.edits[p] : toUi(cur), oninput: (e) => edit(p, e.target.value) });
        return h('div', { class: `rule${changed ? ' changed' : ''}${dirty ? ' dirty' : ''}` },
          h('div', { class: 'what' }, h('b', {}, t), h('span', {}, d)), h('div', { class: 'val' }, input, unit ? h('span', { class: 'unit' }, unit) : null),
          h('span', { class: 'layer' }, dirty ? 'unsaved' : changed ? `set · default ${kind === 'select' ? def : toUi(def)}${unit ? ' ' + unit : ''}` : 'default'));
      })))));
    $('save').disabled = $('revert').disabled = !Object.keys(S.edits).length;
  }
  function edit(p, v) { const g = GROUPS.flatMap(x => x.rules).find(r => r[0] === p); if (String(v) === String(g[4](at(S.policy, p)))) delete S.edits[p]; else S.edits[p] = v;
    const row = document.querySelector(`[data-p="${CSS.escape(p)}"]`).closest('.rule'); row.classList.toggle('dirty', p in S.edits);
    row.querySelector('.layer').textContent = p in S.edits ? 'unsaved' : 'default'; $('save').disabled = $('revert').disabled = !Object.keys(S.edits).length; }
  function patchOf() {
    const patch = {}; const rules = GROUPS.flatMap(x => x.rules);
    for (const [p, v] of Object.entries(S.edits)) {
      const r = rules.find(x => x[0] === p), val = r[5](v);
      if (r[6] !== 'select' && (!Number.isFinite(val) || val < 0)) throw new Error(`${r[1]}: "${v}" is not a number COS can use`);
      const [top, ...rest] = p.split('.');
      if (!rest.length) patch[top] = val;
      else { patch[top] = patch[top] || JSON.parse(JSON.stringify(S.policy[top])); let o = patch[top]; for (let i = 0; i < rest.length - 1; i++) o = o[rest[i]]; o[rest[rest.length - 1]] = val; }
    }
    return patch;
  }
  $('revert').onclick = () => { S.edits = {}; render(); };
  $('save').onclick = async () => {
    let patch; try { patch = patchOf(); } catch (e) { return COS.notice('err', e.message); }
    const lines = Object.keys(S.edits).map(p => { const r = GROUPS.flatMap(x => x.rules).find(x => x[0] === p); return `<b>${esc(r[1])}</b>: ${esc(r[4](at(S.policy, p)))} → ${esc(S.edits[p])}${r[3] ? ' ' + esc(r[3]) : ''}`; });
    if (!await COS.confirm({ title: 'Change how COS supervises?', body: `${lines.join('<br>')}<br><br>It applies to every system at once, and is written to the ledger as yours.`, act: 'Apply' })) return;
    try { await COS.call('PATCH', '/api/cos/policy', { patch, by: 'person' }); COS.notice('ok', 'Applied, and read back.'); load(); }
    catch (e) { if (!e.refused) COS.notice('err', `Refused: ${e.message}`); }
  };
  COS.on('cos.ledger', ({ entry }) => { if (entry.kind === 'policy' && !Object.keys(S.edits).length) load(); });
  load();
})();
