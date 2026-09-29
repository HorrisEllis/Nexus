#!/usr/bin/env node
'use strict';
/**
 * cli/opportunity.js — the opportunity pipeline from a terminal. 0.39.272.
 * comp_id: nexus.cli.opportunity
 *
 *   node cli/opportunity.js status
 *   node cli/opportunity.js profile show
 *   node cli/opportunity.js profile set skills=node,react,electron roles="full stack,backend" remoteOnly=true minSalary=90000
 *   node cli/opportunity.js profile set contact.firstName=James contact.email=you@example.com eligibility.workAuthorization=true
 *   node cli/opportunity.js profile import ~/resume.pdf
 *   node cli/opportunity.js sources                      (types you can add to profile.sources)
 *   node cli/opportunity.js source add greenhouse board=gitlab        |  source add rss url=<feed> name=wwr
 *   node cli/opportunity.js cycle [--draft 3]
 *   node cli/opportunity.js list [STAGE[,STAGE]] [--q text]
 *   node cli/opportunity.js show <id>
 *   node cli/opportunity.js draft <id> [cover_letter|proposal|fiverr_reply|follow_up|screening_answer|gig_description]
 *   node cli/opportunity.js edit-draft <id> <kind> <file>
 *   node cli/opportunity.js approve <id> | dismiss <id>
 *   node cli/opportunity.js prepare <id> [--force]       (Clear Glass opens + fills; stops before submit)
 *   node cli/opportunity.js reply <id>                   (Fiverr/Upwork: types the approved reply; stops before send)
 *   node cli/opportunity.js submit <id>
 *   node cli/opportunity.js mark <id> RESPONDED|INTERVIEW|OFFER|REJECTED|ARCHIVED
 *   node cli/opportunity.js capture [agentId]            (the page open in Clear Glass → pipeline)
 *   node cli/opportunity.js followups
 *   node cli/opportunity.js answers [add "<question>" "<answer>" | approve <id> | rm <id>]
 *   node cli/opportunity.js templates [show <id> | set <id> <file> | reset <id>]
 *   node cli/opportunity.js policy <platform|default> mode=approve|auto|manual [acknowledgeTos=true] [autoApproveAbove=80]
 *   node cli/opportunity.js recipe <host> replySelector=<css> submitSelector=<css>
 *   node cli/opportunity.js watch --every 60              (cycle on an interval, in this terminal)
 * Everything you do here is by:'user' — this is James's own terminal.
 */

const fs = require('fs');
const O = require('../lib/opportunity');

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => { const i = argv.indexOf(`--${name}`); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const fail = (msg) => { console.error(`✗ ${msg}`); process.exitCode = 1; };

function parseValue(v) {
  if (v === 'true') return true; if (v === 'false') return false; if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return +v;
  if (/^[[{]/.test(v)) { try { return JSON.parse(v); } catch (_) {} }
  return v;
}
function kvToPatch(pairs) {
  const patch = {};
  for (const kv of pairs) {
    const i = kv.indexOf('=');
    if (i < 0) throw new Error(`expected key=value, got "${kv}"`);
    const keys = kv.slice(0, i).split('.'); let v = parseValue(kv.slice(i + 1));
    if (['skills', 'roles', 'mustHave', 'avoid', 'excludeCompanies', 'locations', 'kinds'].includes(keys[0]) && typeof v === 'string') v = v.split(',').map(s => s.trim()).filter(Boolean);
    let o = patch; for (let k = 0; k < keys.length - 1; k++) o = o[keys[k]] = o[keys[k]] || {};
    o[keys[keys.length - 1]] = v;
  }
  return patch;
}
function table(items) {
  if (!items.length) return '(none)';
  return items.map(i => `${String(i.id).slice(0, 8)}  ${String(i.stage).padEnd(13)} ${String(i.score ?? '').padStart(3)}  ${(i.kind || '').padEnd(5)} ${String(i.title || '').slice(0, 50).padEnd(50)} ${String(i.company || '').slice(0, 24)}`).join('\n');
}

async function main() {
  const [verb, ...rest] = argv;
  switch (verb) {
    case undefined: case 'help': case '--help':
      return out(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith(' *   node')).map(l => l.slice(3)).join('\n'));
    case 'status': {
      const s = O.status();
      out(`${s.total} tracked · ${Object.entries(s.byStage).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || 'empty'}`);
      if (s.needsYou.length) out('\nWaiting on you:\n' + s.needsYou.map(x => `  ${x.id.slice(0, 8)} ${x.stage.padEnd(13)} ${x.score ?? ''}  ${x.title} — ${x.company || ''}${x.why ? `  (${x.why})` : ''}`).join('\n'));
      return;
    }
    case 'profile': {
      const [sub, ...kv] = rest;
      if (!sub || sub === 'show') return out(O.getProfile());
      if (sub === 'set') { const r = O.setProfile(kvToPatch(kv)); return r.ok ? out('✓ profile updated') : fail(r.errors.join('; ')); }
      if (sub === 'import') { const r = await O.importResume(kv[0]); return r.ok ? out(r) : fail(r.error); }
      return fail(`profile ${sub}? show | set k=v… | import <file>`);
    }
    case 'sources': return out(Object.entries(O.sources.TYPES).map(([k, v]) => `${k.padEnd(11)} ${v.needs.length ? `needs ${v.needs.join(',')}  ` : ''}${v.describe}`).join('\n') + '\n\nconfigured:\n' + JSON.stringify(O.getProfile().sources, null, 2));
    case 'source': {
      const [sub, type, ...kv] = rest;
      const p = O.getProfile();
      if (sub === 'add') { const r = O.setProfile({ sources: [...p.sources, { type, enabled: true, ...kvToPatch(kv) }] }); return r.ok ? out('✓ source added') : fail(r.errors.join('; ')); }
      if (sub === 'off' || sub === 'on') { const i = +type; if (!p.sources[i]) return fail(`no source #${i}`); p.sources[i].enabled = sub === 'on'; const r = O.setProfile({ sources: p.sources }); return r.ok ? out(`✓ source #${i} ${sub}`) : fail(r.errors.join('; ')); }
      if (sub === 'rm') { const i = +type; const r = O.setProfile({ sources: p.sources.filter((_, j) => j !== i) }); return r.ok ? out('✓ removed') : fail(r.errors.join('; ')); }
      return fail('source add <type> k=v… | on <n> | off <n> | rm <n>');
    }
    case 'policy': {
      const [key, ...kv] = rest;
      if (!key) return out(O.getProfile().policy);
      const r = O.setProfile({ policy: { [key]: kvToPatch(kv) } });
      return r.ok ? out(O.getProfile().policy) : fail(r.errors.join('; '));
    }
    case 'cycle': { const d = flag('draft'); const r = await O.cycle({ draft: d === null ? null : +d }); const { status: st, ...rep } = r; out(rep); return; }
    case 'list': { const q = flag('q'); return out(table(O.list({ stage: rest[0] || null, q, limit: 100 }))); }
    case 'show': { const r = O.show(rest[0]); return r.ok ? out(r) : fail(r.error); }
    case 'draft': { const r = await O.draftFor(rest[0], { kind: rest[1] || null }); return r.ok ? out(r.text) : fail(r.error); }
    case 'edit-draft': { const [id, kind, file] = rest; const r = O.editDraft(id, kind, fs.readFileSync(file, 'utf8')); return r.ok ? out('✓ draft replaced') : fail(r.error); }
    case 'approve': { const r = O.approve(rest[0], { by: 'user' }); return r.ok ? out(`✓ approved — next: prepare ${rest[0]}`) : fail(r.error); }
    case 'dismiss': { const r = O.dismiss(rest[0], { by: 'user' }); return r.ok ? out('✓ dismissed') : fail(r.error); }
    case 'prepare': { const r = await O.prepare(rest[0], { force: !!flag('force') }); return r.ok === false ? fail(r.error) : out(r.fillReport ? { stage: r.stage || (r.opp && r.opp.stage), tab: r.agentId, ...r.fillReport } : r); }
    case 'reply': { const r = await O.prepareReply(rest[0]); return r.ok === false ? fail(r.error) : out(r); }
    case 'submit': { const r = await O.submit(rest[0], { by: 'user' }); return r.ok === false ? fail(r.error) : out(`✓ ${r.opp ? r.opp.stage : 'submitted'}${r.opp && r.opp.submitConfirmed === false ? ' — no confirmation text seen; check the tab' : ''}`); }
    case 'mark': { const r = O.markResponse(rest[0], rest[1], { by: 'user', note: rest.slice(2).join(' ') || null }); return r.ok ? out(`✓ ${rest[1]}`) : fail(r.error); }
    case 'capture': { const r = await O.capture({ agentId: rest[0] || 'default' }); return r.ok ? out(r) : fail(r.error); }
    case 'followups': return out(await O.followups());
    case 'rescore': return out(O.rescore());
    case 'answers': {
      const [sub, a, b] = rest;
      if (!sub) return out(O.answers.list().map(r => `${r.id.slice(0, 8)} ${r.approvedBy === 'user' ? '✓' : '?'} ${r.question}\n          → ${String(r.answer).slice(0, 160)}`).join('\n') || '(empty)');
      if (sub === 'add') { const r = O.answers.add({ question: a, answer: b, by: 'user' }); return r.ok ? out('✓ saved') : fail(r.error); }
      if (sub === 'approve') { const row = O.answers.list().find(r => r.id.startsWith(a)); if (!row) return fail(`no answer ${a}`); return out(O.answers.approve(row.id, 'user')); }
      if (sub === 'rm') { const row = O.answers.list().find(r => r.id.startsWith(a)); if (!row) return fail(`no answer ${a}`); return out(O.answers.remove(row.id)); }
      return fail('answers [add "<q>" "<a>" | approve <id> | rm <id>]');
    }
    case 'templates': {
      const [sub, id, file] = rest;
      if (!sub) return out(O.drafting.listTemplates().map(t => `${t.id}${t.edited ? ' (edited)' : ''}`).join('\n'));
      if (sub === 'show') return out(O.drafting.getTemplate(id).text);
      if (sub === 'set') { const r = O.drafting.setTemplate(id, fs.readFileSync(file, 'utf8')); return r.ok ? out('✓ template saved') : fail(r.error); }
      if (sub === 'reset') { const r = O.drafting.resetTemplate(id); return r.ok ? out('✓ reset to default') : fail(r.error); }
      return fail('templates [show <id> | set <id> <file> | reset <id>]');
    }
    case 'recipe': { const [host, ...kv] = rest; const r = O.setRecipe(host, kvToPatch(kv)); return r.ok ? out(r.recipe) : fail(r.error); }
    case 'watch': {
      const every = Math.max(15, +flag('every', 60));
      out(`cycling every ${every} min — Ctrl-C to stop`);
      const run = async () => { try { const r = await O.cycle({}); out(`[${new Date().toLocaleTimeString()}] ${r.ok ? `${r.created} new · ${r.shortlisted} shortlisted · ${r.drafted} drafted${r.problems.length ? ` · problems: ${r.problems.join(' | ')}` : ''}` : r.error}`); } catch (e) { fail(e.message); } };
      await run(); setInterval(async () => { await run(); try { require('../cortex/memory/jaa-db.js').jaaDB._store().flushAll(); } catch (_) {} }, every * 60000);
      return new Promise(() => {});
    }
    default: return fail(`unknown verb "${verb}" — run with no arguments for help`);
  }
}

// JAA writes are debounced (guardian/jaa-store.js _schedule, 1.5s); process.exit() would drop them. Found in the first
// smoke run: `profile set` printed ✓ and the next command read an empty profile. Flush, then exit.
function flushAndExit(code) {
  try { require('../cortex/memory/jaa-db.js').jaaDB._store().flushAll(); } catch (e) { console.error(`✗ could not flush the store: ${e.message}`); code = code || 1; }
  process.exit(code);
}
main().then(() => { if (verbIsWatch()) return; flushAndExit(process.exitCode || 0); }).catch(e => { fail(e.stack || e.message); flushAndExit(1); });
function verbIsWatch() { return process.argv[2] === 'watch'; }
