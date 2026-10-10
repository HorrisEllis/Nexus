/**
 * clear-glass/renderer/gig-panel.js — Fiverr in the browser itself (0.59.3).
 * James, 2026-10-10: "fiverr tutorial for helping me speed up gigs as much as possible, i need serious help. i have no
 * bandwidth, and this is my only chance. gigs, portfolio, i was thinking to have the questions for the end state
 * conditions in the gigs, so i can just send them to idearium and have them built. like this is vital also, its built
 * somewhere but not in the browser.html".
 *
 * It was built — src/autofill/gig.js — but its only screen was Settings → Autofill, a separate window. This panel is in the
 * browser, beside the Fiverr page, in two steps:
 *   1 WRITE   one line of what he offers → the whole gig (title, tags, description, packages, FAQ, and five buyer questions
 *             that are the work's end-state conditions) → copy any part, or fill the open Fiverr editor. Nothing is
 *             saved or published: Publish stays his click.
 *   2 BUILD   an order comes in → paste the buyer's answers → Send to Idearium: a spec (end state, users, must/never,
 *             how we know it is done, materials) saved as a new repo, ready to build.
 * The markup is in browser.html (#gig-panel); this file is only behaviour (CG2: the HTML holds the structure).
 */
(function () {
  'use strict';
  const cg = window.cg;
  const $ = (id) => document.getElementById(id);
  const panel = $('gig-panel');
  if (!panel || !cg || !cg.autofill) return;
  const agentId = new URLSearchParams(location.search).get('agentId') || 'default';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(`cg.gig.${k}`); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(`cg.gig.${k}`, JSON.stringify(v)); } catch (_) {} } };
  const DEFAULT_Q = ['What must the finished result do or be? (the end state, in your words)', 'Who will use it, and where? (people, devices, platform)',
    'What must it always do — and never do?', 'How will you check it is done? (the test you will run, or what you will look at)', 'What materials, examples, logins or files do I need?'];
  let GIG = store.get('last', null);
  const say = (id, msg, kind = '') => { const el = $(id); el.textContent = msg; el.className = `gig-status ${kind}`; };

  function show(on) { panel.classList.toggle('visible', on); if (on) loadProfiles(); }
  $('btn-gig').addEventListener('click', () => show(!panel.classList.contains('visible')));
  $('gig-close').addEventListener('click', () => show(false));
  for (const t of panel.querySelectorAll('.gig-tab')) t.addEventListener('click', () => step(t.dataset.step));
  function step(n) {
    for (const t of panel.querySelectorAll('.gig-tab')) t.classList.toggle('on', t.dataset.step === n);
    $('gig-step-write').hidden = n !== 'write'; $('gig-step-build').hidden = n !== 'build';
    if (n === 'build') paintQuestions();
  }

  async function loadProfiles() {
    let ps = []; try { ps = await cg.autofill.listProfiles(); } catch (_) {}
    const sel = $('gig-profile'), keep = store.get('profile', null);
    sel.innerHTML = ps.map(p => `<option value="${esc(p.id)}" ${p.id === keep ? 'selected' : ''}>${esc(p.name || p.label || p.id)}</option>`).join('');
    $('gig-no-profile').hidden = ps.length > 0; $('gig-write').disabled = !ps.length;
  }
  $('gig-open-settings').addEventListener('click', () => { try { cg.window.openSettings(); } catch (_) {} });
  $('gig-profile').addEventListener('change', () => store.set('profile', $('gig-profile').value));
  $('gig-offer').value = store.get('offer', '');

  $('gig-write').addEventListener('click', async () => {
    const offer = $('gig-offer').value.trim(); store.set('offer', offer);
    if (offer.length < 8) return say('gig-write-status', 'Say in a line what the gig offers — e.g. "simple websites for small businesses".', 'bad');
    $('gig-write').disabled = true; say('gig-write-status', 'Writing the gig… (the co-pilot drafts it from your profile — nothing invented)');
    let r; try { r = await cg.autofill.gig({ profileId: $('gig-profile').value, offer, extra: $('gig-extra').value.trim(), agentId }); } catch (e) { r = { ok: false, error: e.message }; }
    $('gig-write').disabled = false;
    if (!r || r.ok === false || !r.gig) return say('gig-write-status', `Not written: ${(r && r.error) || 'no answer'}`, 'bad');
    GIG = r.gig; store.set('last', GIG);
    say('gig-write-status', `Written.${(r.warnings || []).length ? ` ${r.warnings.length} note(s): ${r.warnings.slice(0, 2).join(' · ')}` : ''} Copy a part, or fill the Fiverr page.`, 'ok');
    paintGig();
  });

  const LIMIT = { title: 80, description: 1200 };
  function parts(g) {
    const out = [{ label: 'Title', text: g.title, max: LIMIT.title }, { label: 'Tags', text: (g.tags || []).join(', ') }, { label: 'Description', text: g.description, max: LIMIT.description }];
    for (const t of ['basic', 'standard', 'premium']) { const p = (g.packages || {})[t]; if (p) out.push({ label: `${t[0].toUpperCase()}${t.slice(1)} package`, text: `${p.name} — $${p.price} · ${p.deliveryDays} day(s) · ${p.revisions} revision(s)\n${p.description}` }); }
    (g.faq || []).forEach((f, i) => out.push({ label: `FAQ ${i + 1}`, text: `${f.question}\n${f.answer}` }));
    (g.requirements || []).forEach((q, i) => out.push({ label: `Buyer question ${i + 1}`, text: q }));
    return out.filter(p => p.text);
  }
  function paintGig() {
    const box = $('gig-parts');
    if (!GIG) { box.innerHTML = ''; $('gig-actions').hidden = true; return; }
    const ps = parts(GIG);
    box.innerHTML = ps.map((p, i) => `<div class="gig-part"><div class="gig-part-h"><b>${esc(p.label)}</b>${p.max ? `<span class="${String(p.text).length > p.max ? 'bad' : ''}">${String(p.text).length}/${p.max}</span>` : ''}<button class="gig-copy" data-i="${i}">Copy</button></div><div class="gig-part-t">${esc(p.text)}</div></div>`).join('');
    for (const b of box.querySelectorAll('.gig-copy')) b.addEventListener('click', () => copy(ps[+b.dataset.i].text, b));
    $('gig-actions').hidden = false;
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(String(text)); } catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1200); }
  }
  $('gig-copy-all').addEventListener('click', (e) => GIG && copy(parts(GIG).map(p => `${p.label}\n${p.text}`).join('\n\n'), e.currentTarget));
  $('gig-fill').addEventListener('click', async () => {
    if (!GIG) return;
    say('gig-write-status', 'Filling the Fiverr page in this tab…');
    let r; try { r = await cg.autofill.gigFill(GIG, agentId, 'medium'); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || r.ok === false) return say('gig-write-status', `Not filled: ${(r && r.error) || 'no answer'} — open Fiverr's gig editor in this tab first.`, 'bad');
    const n = r.filled ?? (r.results || []).filter(x => x.ok !== false).length;
    say('gig-write-status', `Filled ${n || 0} field(s). Read it on the page, then press Save / Publish on Fiverr yourself.${r.skipped && r.skipped.length ? ` Left for you to paste: ${r.skipped.slice(0, 3).join(', ')}.` : ''}`, 'ok');
  });

  // ── step 2: an order → Idearium ─────────────────────────────────────────
  function questions() { return (GIG && GIG.requirements && GIG.requirements.length ? GIG.requirements : DEFAULT_Q).slice(0, 5); }
  function paintQuestions() {
    const qs = questions(), saved = store.get('answers', []);
    $('gig-questions').innerHTML = qs.map((q, i) => `<label class="gig-q"><span>${i + 1}. ${esc(q)}</span><textarea data-i="${i}" rows="2">${esc(saved[i] || '')}</textarea></label>`).join('');
    for (const t of $('gig-questions').querySelectorAll('textarea')) t.addEventListener('input', () => store.set('answers', answers()));
  }
  const answers = () => [...$('gig-questions').querySelectorAll('textarea')].map(t => t.value.trim());
  // the buyer's whole reply pasted at once: split at "1." / "2)" … into the five answers
  $('gig-split').addEventListener('click', () => {
    const raw = $('gig-reply').value; if (!raw.trim()) return;
    const parts2 = raw.split(/^\s*(?:Q?\d{1,2}[.)\]:-])\s*/m).map(s => s.trim()).filter(Boolean);
    const list = parts2.length >= 2 ? parts2 : raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const ts = [...$('gig-questions').querySelectorAll('textarea')];
    ts.forEach((t, i) => { t.value = list[i] || t.value; });
    store.set('answers', answers());
    say('gig-build-status', `Split into ${Math.min(list.length, ts.length)} answer(s) — check them, then send.`, 'ok');
  });
  $('gig-send').addEventListener('click', async () => {
    const a = answers();
    if (!a.some(Boolean)) return say('gig-build-status', 'Paste or type the buyer\'s answers first.', 'bad');
    $('gig-send').disabled = true; say('gig-build-status', 'Sending to Idearium…');
    let r; try { r = await cg.autofill.gigToIdearium({ gig: GIG || { requirements: questions() }, answers: a, buyer: $('gig-buyer').value.trim(), order: $('gig-order').value.trim() }); } catch (e) { r = { ok: false, error: e.message }; }
    $('gig-send').disabled = false;
    if (!r || !r.ok) return say('gig-build-status', `Not sent: ${(r && r.error) || 'no answer'}`, 'bad');
    say('gig-build-status', `In Idearium: "${r.title}" — a spec and a repo. Open it to plan and build.`, 'ok');
    const link = $('gig-open-idearium'); link.hidden = false; link.dataset.url = r.open;
  });
  $('gig-open-idearium').addEventListener('click', (e) => { const u = e.currentTarget.dataset.url; if (u) window.open(u, '_blank'); });

  paintGig(); step('write');
  window.CgGigPanel = { show, step, parts: () => (GIG ? parts(GIG) : []) };
})();
