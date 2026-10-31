/**
 * cos/ui/overview/page.js — every system COS supervises (MOD-MG-UI-OVERVIEW). MG18, 0.60.336.
 * James, 2026-10-30: "look at tablet except it uses the compartments as a way to manage the compartments for each system" ·
 * 2026-10-31: "okay. lets build cos ui. floating, above the event bus."
 * A card per system, what needs him first; every number is the supervisor's with the time it was read; usage the OS did not report says
 * "not read" and why, never 0. Acts (start, stop, restart, reset the circuit, boot, stop all) are his, confirmed, ledgered with by = person.
 * It listens to cos.system.state and cos.ledger: nothing here polls while the bus is up (usage, which has no event, is read every 5 s).
 */
(async function () {
  'use strict';
  const { h, icon, esc } = COS;
  const $ = (id) => document.getElementById(id);
  const S = { systems: [], usage: null, usageAt: 0, filter: 'all', proposals: 0 };
  const GROUP = (s) => s === 'up' ? 'up' : /^(down|circuit-open)$/.test(s) ? 'down' : /^(starting|restarting|degraded|waiting-memory|stopping|idling)$/.test(s) ? 'attention' : 'resting';
  const ORDER = { down: 0, attention: 1, up: 2, resting: 3 };

  try { await COS.page('overview'); } catch (e) { return e.down ? COS.down($('grid'), e.message) : COS.say($('grid'), { glyph: 'x', title: 'This page could not start', text: COS.esc(e.message) }); }

  async function load() {
    try {
      const [sys, us] = await Promise.all([COS.call('GET', '/api/cos/systems'), COS.call('GET', '/api/cos/usage')]);
      S.systems = sys.systems; S.usage = us.usage; S.usageAt = Date.now(); render();
    } catch (e) { if (e.down) { COS.down($('grid'), e.message); $('stats').replaceChildren(); } else if (!e.refused) COS.notice('err', e.message); }
  }
  async function loadUsage() { try { S.usage = (await COS.call('GET', '/api/cos/usage')).usage; S.usageAt = Date.now(); render(); } catch (_) {} }
  async function loadProposals() { try { S.proposals = (await COS.call('GET', '/api/cos/proposals?open=1')).proposals.length; renderCallout(); } catch (_) {} }

  // ── acts ──
  const ACT = {
    start: { t: 'Start', d: (n) => `COS starts <b>${esc(n)}</b> now. If it does not answer its health within 30 s it is marked degraded and said.` },
    stop: { t: 'Stop', d: (n) => `COS asks <b>${esc(n)}</b> to end (SIGTERM), and ends it after 5 s if it has not. It is not restarted until someone starts it.`, danger: true },
    restart: { t: 'Restart', d: (n) => `COS stops <b>${esc(n)}</b> and starts it again at once. Its restart count and backoff are kept.` },
    'reset-circuit': { t: 'Reset the circuit', d: (n) => `The circuit stopped COS restarting <b>${esc(n)}</b>. Resetting clears its crash count; it stays stopped until you start it.` },
  };
  async function act(name, op, card) {
    const a = ACT[op]; if (!await COS.confirm({ title: `${a.t} ${name}?`, body: `${a.d(name)}<br><br>Written to the ledger as your act.`, act: a.t, danger: !!a.danger })) return;
    card && card.classList.add('busy');
    try { const r = await COS.call('POST', `/api/cos/systems/${encodeURIComponent(name)}/${op}`, { by: 'person' });
      COS.notice('ok', r.system && r.system.said ? `${name}: ${r.system.said}` : `${a.t}: ${name} — ${COS.stateLabel(r.system.state)}`); await load(); }
    catch (e) { if (!e.refused) COS.notice('err', `${a.t} ${name} was refused: ${e.message}`); }
    finally { card && card.classList.remove('busy'); }
  }
  async function boot(set) {
    const what = set === 'core' ? 'the critical systems only (the core set); every other system starts when it is asked for' : 'every declared system that is not on demand';
    if (!await COS.confirm({ title: set === 'core' ? 'Boot the core?' : 'Boot everything?', body: `COS starts ${what}, phase by phase, each phase waiting up to 30 s for its health.<br><br>Written to the ledger as your act.`, act: 'Boot' })) return;
    try { const r = await COS.call('POST', '/api/cos/boot', { set, by: 'person' }); COS.notice('ok', `Booted ${r.started.length}${r.skipped.length ? `; ${r.skipped.length} left for later` : ''}.`); await load(); }
    catch (e) { if (!e.refused) COS.notice('err', `The boot was refused: ${e.message}`); }
  }
  async function stopAll() {
    const running = S.systems.filter(s => s.pid);
    if (!running.length) return COS.notice('info', 'Nothing is running.');
    if (!await COS.confirm({ title: `Stop all ${running.length} running systems?`, body: `COS stops ${running.map(s => `<b>${esc(s.name)}</b>`).join(', ')}. Nothing restarts them until someone does.<br><br>Each stop is written to the ledger as your act.`, act: 'Stop all', danger: true })) return;
    let failed = 0; for (const s of running) { try { await COS.call('POST', `/api/cos/systems/${encodeURIComponent(s.name)}/stop`, { by: 'person' }); } catch (_) { failed++; } }
    COS.notice(failed ? 'err' : 'ok', failed ? `${failed} of ${running.length} stops were refused; the ledger says why.` : `Stopping ${running.length} systems.`); load();
  }

  // ── render ──
  function renderHead() {
    $('head-actions').replaceChildren(
      h('button', { class: 'btn', onclick: () => boot('core'), html: `${icon('bolt')}<span>Boot core</span>` }),
      h('button', { class: 'btn primary', onclick: () => boot('all'), html: `${icon('play')}<span>Boot all</span>` }),
      h('button', { class: 'btn danger', onclick: stopAll, html: `${icon('stop')}<span>Stop all</span>` }));
  }
  function renderStats() {
    const n = { up: 0, attention: 0, down: 0, resting: 0 }; for (const s of S.systems) n[GROUP(s.state)]++;
    const subs = { up: 'answering their health', attention: 'starting, restarting or degraded', down: 'down, or circuit open', resting: 'stopped, idle or not started' };
    const label = { up: 'Up', attention: 'Attention', down: 'Down', resting: 'Resting' };
    $('stats').replaceChildren(...Object.keys(n).map(k => h('button', { class: 'stat panel rise', 'data-k': k, 'aria-pressed': String(S.filter === k), onclick: () => { S.filter = S.filter === k ? 'all' : k; render(); } },
      h('span', { class: 'eyebrow' }, label[k]), h('span', { class: 'num' }, String(n[k])), h('div', { class: 'sub' }, subs[k]))));
  }
  function renderFilters() {
    const count = (k) => k === 'all' ? S.systems.length : S.systems.filter(s => GROUP(s.state) === k).length;
    $('filters').replaceChildren(...['all', 'down', 'attention', 'up', 'resting'].map(k => h('button', { class: 'chip', 'aria-pressed': String(S.filter === k), onclick: () => { S.filter = k; render(); } },
      k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1), h('span', { class: 'n' }, String(count(k))))));
    $('read-at').textContent = S.usageAt ? `read ${COS.clock(S.usageAt)}` : '';
  }
  function renderCallout() {
    const el = $('proposals-callout');
    if (!S.proposals) return el.replaceChildren();
    el.replaceChildren(h('div', { class: 'callout panel rise', onclick: () => COS.navigate('#/proposals') },
      h('span', { class: 'ic', html: icon('inbox') }), h('div', { html: `<b>${S.proposals} ${S.proposals === 1 ? 'proposal waits' : 'proposals wait'} for you.</b> <span class="muted">An agent asked to act; nothing runs until you take it.</span>` }),
      h('span', { class: 'go', html: icon('arrow') })));
  }
  function metric(k, v, title) { const none = v == null || v === '—'; return h('div', { class: 'metric', title: title || '' }, h('span', { class: 'k' }, k), h('span', { class: `v${none ? ' none' : ''}` }, none ? '—' : v)); }
  function card(s) {
    const u = S.usage && S.usage.systems[s.name];
    const mem = u && u.rssMB != null ? `${u.rssMB} MB` : null, cpu = u && u.cpuPct != null ? `${u.cpuPct.toFixed(1)}%` : null;
    const notRead = u && u.notRead && s.pid ? `not read: ${u.notRead}` : '';
    const tags = [s.critical && h('span', { class: 'tag ac' }, 'critical'), s.onDemand && h('span', { class: 'tag' }, 'on demand'), s.bootPhase != null && h('span', { class: 'tag' }, `phase ${s.bootPhase}`),
      s.system && s.system !== s.name && h('span', { class: 'tag' }, s.system)].filter(Boolean);
    const running = !!s.pid;
    const el = h('article', { class: 'card panel rise', 'data-s': s.state },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-name' }, h('span', { class: 'dot', 'data-s': s.state }), h('a', { href: '#', onclick: (e) => { e.preventDefault(); COS.navigate(`#/c/${encodeURIComponent(s.name)}`); } }, s.name)),
        h('span', { class: 'state' }, COS.stateLabel(s.state))),
      h('div', { class: 'card-tags' }, tags),
      s.circuit && s.circuit.open ? h('div', { class: 'why' }, `Circuit open ${COS.ago(s.circuit.openedAt)}: ${s.circuit.why}`) :
        s.state === 'degraded' ? h('div', { class: 'why warn' }, `Started, but its health has not answered (${s.healthUrl || 'no health url'}).`) :
        s.state === 'down' && s.lastExit ? h('div', { class: 'why' }, `Exited ${s.lastExit.code != null ? `with code ${s.lastExit.code}` : `on ${s.lastExit.signal}`} ${COS.ago(s.lastExit.ts)}; restarting after ${COS.dur(s.restarts.backoffMs)}.`) : null,
      h('div', { class: 'metrics' },
        metric('Port', s.port ? `:${s.port}` : null), metric('PID', s.pid), metric('Up for', running && s.startedAt ? COS.dur(Date.now() - s.startedAt) : null),
        metric('Memory', mem || (notRead ? 'not read' : null), notRead), metric('CPU', cpu || (notRead ? 'not read' : null), notRead),
        metric('Restarts', `${s.restarts.count}${s.crashesInWindow ? ` · ${s.crashesInWindow} in 5m` : ''}`)),
      h('div', { class: 'card-foot' },
        running ? h('button', { class: 'btn sm danger', onclick: (e) => act(s.name, 'stop', e.target.closest('.card')), html: `${icon('stop')}<span>Stop</span>` })
          : s.circuit && s.circuit.open ? h('button', { class: 'btn sm', onclick: (e) => act(s.name, 'reset-circuit', e.target.closest('.card')), html: `${icon('reset')}<span>Reset circuit</span>` })
          : h('button', { class: 'btn sm primary', onclick: (e) => act(s.name, 'start', e.target.closest('.card')), html: `${icon('play')}<span>Start</span>` }),
        running ? h('button', { class: 'btn sm', onclick: (e) => act(s.name, 'restart', e.target.closest('.card')), html: `${icon('restart')}<span>Restart</span>` }) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm quiet', title: `open ${s.name}'s cockpit`, onclick: () => COS.navigate(`#/c/${encodeURIComponent(s.name)}`), html: `<span>Open</span>${icon('arrow')}` })));
    return el;
  }
  function render() {
    renderStats(); renderFilters();
    const list = S.systems.filter(s => S.filter === 'all' || GROUP(s.state) === S.filter)
      .sort((a, b) => ORDER[GROUP(a.state)] - ORDER[GROUP(b.state)] || a.name.localeCompare(b.name));
    if (!S.systems.length) return COS.say($('grid'), { glyph: 'layers', title: 'No system declares a process', text: 'COS supervises what each system\'s <code>compartment.json</code> declares under <code>runtime.process</code>.' });
    if (!list.length) return COS.say($('grid'), { glyph: 'check', title: `Nothing ${S.filter}`, text: 'No system is in that state right now.' });
    $('grid').replaceChildren(...list.map(card));
  }

  // ── the bus ──
  let t = 0; const soon = () => { clearTimeout(t); t = setTimeout(load, 350); };
  COS.on('cos.system.state', ({ name, state, pid }) => { const s = S.systems.find(x => x.name === name); if (s) { Object.assign(s, { state, pid }); render(); } soon(); });
  COS.on('cos.ledger', ({ entry }) => { if (/^proposal-/.test(entry.kind)) loadProposals(); else soon(); });

  renderHead(); await load(); loadProposals();
  setInterval(loadUsage, 5000);
})();
