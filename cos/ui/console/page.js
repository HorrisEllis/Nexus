/**
 * cos/ui/console/page.js — every system's output together, live, and COS's command line (SC11, 0.60.398).
 * James, 2026-11-05: "next phase. cos needs the console from the autopilot. like a console tab"
 * The retired autopilot printed "[time] [system:file] line", errors in red, and took commands (--cli). Here: GET /api/cos/console for the last
 * lines of every system (merged in time order), then cos.console from the bus as they are printed; the command line is POST /api/cos/cli.
 * Nothing is deleted: Clear view only empties this view.
 */
(async function () {
  'use strict';
  const { h } = COS; const $ = (id) => document.getElementById(id);
  const KEEP = 5000;   // lines this view holds; older ones fall off the top of the view only
  const S = { lines: [], systems: [], off: new Set(), errOnly: false, q: '', follow: true, hist: [], hi: 0 };
  try { await COS.page('console'); } catch (e) { return e.down ? COS.down($('term'), e.message) : COS.say($('term'), { glyph: 'x', title: 'This page could not start', text: COS.esc(e.message) }); }

  const hue = (name) => { let x = 0; for (const c of String(name)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
  const live = (s, text) => { $('live').replaceChildren(h('span', { class: 'dot', 'data-s': s }), text); };

  try {
    const [c, s] = await Promise.all([COS.call('GET', '/api/cos/console?limit=1500'), COS.call('GET', '/api/cos/systems')]);
    S.lines = c.lines; S.systems = s.systems.map(x => x.name);
    live('up', 'live');
  } catch (e) { return e.down ? COS.down($('term'), e.message) : COS.say($('term'), { glyph: 'x', title: 'The console could not be read', text: COS.esc(e.message) }); }

  const sysParam = COS.param('system'); if (sysParam) for (const n of S.systems) if (n !== sysParam) S.off.add(n);

  function chips() {
    $('f-sys').replaceChildren(...S.systems.map(n => h('button', { class: 'chip sys', style: `--h:${hue(n)}`, 'aria-pressed': String(!S.off.has(n)), onclick: () => { S.off.has(n) ? S.off.delete(n) : S.off.add(n); render(); } },
      n, h('span', { class: 'n' }, String(S.lines.filter(l => l.system === n).length)))));
  }
  const shown = (l) => !S.off.has(l.system) && (!S.errOnly || l.stream === 'err') && (!S.q || l.line.toLowerCase().includes(S.q));
  const row = (l) => h('div', { class: `ln ${l.stream === 'err' ? 'err' : l.stream === 'cmd' ? 'cmd' : l.stream === 'reply' ? 'reply' : ''}`, title: new Date(l.ts).toISOString() },
    h('span', { class: 't' }, COS.clock(l.ts)), h('span', { class: 'sys', style: `--h:${hue(l.system)}`, onclick: () => COS.navigate(`#/c/${encodeURIComponent(l.system)}/logs`) }, l.system), h('span', { class: 'tx' }, l.line));
  function render() {
    chips();
    const list = S.lines.filter(shown);
    if (!S.lines.length) return COS.say($('term'), { glyph: 'terminal', title: 'Nothing printed yet', text: 'When a system COS runs prints a line, it shows here.' });
    if (!list.length) return COS.say($('term'), { glyph: 'search', title: 'Nothing matches', text: 'No line from these systems has that text.' });
    $('term').replaceChildren(...list.slice(-1500).map(row));
    if (S.follow) $('term').scrollTop = $('term').scrollHeight;
  }
  function add(lines) {
    S.lines.push(...lines); if (S.lines.length > KEEP) S.lines.splice(0, S.lines.length - KEEP);
    for (const l of lines) if (l.system && !S.systems.includes(l.system)) S.systems.push(l.system);
    const term = $('term'); const atBottom = term.scrollHeight - term.scrollTop - term.clientHeight < 40;
    if (!term.querySelector('.ln') && !lines.some(shown)) return;
    if (!term.querySelector('.ln')) return render();
    for (const l of lines) if (shown(l)) term.append(row(l));
    while (term.childElementCount > 1500) term.firstElementChild.remove();
    chips(); if (S.follow && atBottom) term.scrollTop = term.scrollHeight;
  }

  $('f-err').onclick = () => { S.errOnly = !S.errOnly; $('f-err').setAttribute('aria-pressed', String(S.errOnly)); render(); };
  $('f-q').oninput = (e) => { S.q = e.target.value.toLowerCase(); render(); };
  $('follow').onclick = () => { S.follow = !S.follow; $('follow').setAttribute('aria-pressed', String(S.follow)); $('follow').textContent = S.follow ? 'Following' : 'Paused'; if (S.follow) $('term').scrollTop = $('term').scrollHeight; };
  $('clear').onclick = () => { S.lines = []; render(); };

  // the command line: COS's own table (SC3), its answer in the stream
  $('line').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && S.hi > 0) { S.hi--; $('line').value = S.hist[S.hi]; e.preventDefault(); }
    if (e.key === 'ArrowDown' && S.hi < S.hist.length) { S.hi++; $('line').value = S.hist[S.hi] || ''; e.preventDefault(); }
  });
  $('prompt').onsubmit = async (e) => {
    e.preventDefault(); const line = $('line').value.trim(); if (!line) return;
    S.hist.push(line); S.hi = S.hist.length; $('line').value = '';
    const now = Date.now(); add([{ system: 'cos', ts: now, stream: 'cmd', line: `cos> ${line}` }]);
    let out;
    try { out = (await COS.call('POST', '/api/cos/cli', { line, by: 'person' })).lines; }
    catch (err) { out = err.body && Array.isArray(err.body.lines) ? err.body.lines : [err.message]; }
    add((out.length ? out : ['(no output)']).map(l => ({ system: 'cos', ts: Date.now(), stream: 'reply', line: l })));
  };

  COS.on('cos.console', ({ lines, dropped }) => { add(lines); if (dropped) add([{ system: 'cos', ts: Date.now(), stream: 'err', line: `${dropped} lines were dropped in one burst (more than 500 in 200 ms); each system's own Logs tab keeps its last ${400}` }]); });
  COS.on('cos.system.state', ({ name }) => { if (name && !S.systems.includes(name)) { S.systems.push(name); chips(); } });
  render();
})();
