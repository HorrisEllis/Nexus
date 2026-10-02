#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Idearium CLI — idearium/cli/index.js                                  ║
 * ║  UUID:    idearium-cli-v1-0000-4000-0000-000000000003                  ║
 * ║  Version: pre-release                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The CLI is the truth layer. Every feature has a CLI command.
 * Commands call IdeaOS directly — no HTTP round-trip.
 * API and UI are projections of this same logic.
 *
 * §3.1  Foundation before UI. CLI is the foundation interface.
 * §1.2  Nothing silently fails. Every error exits with code 1.
 * §5.1  Everything has a UUID.
 * §M1   Nothing is ever deleted. Archive only.
 *
 * Usage:
 *   node cli/index.js <command> [args] [--flags]
 *   idearium idea add "my idea text" [--tags tag1,tag2] [--compartment nexus]
 *   idearium idea list [--phase seed] [--sort tension] [--limit 20]
 *   idearium idea show <uuid>
 *   idearium idea phase <uuid> expanding
 *   idearium idea link <uuid-a> <uuid-b> [--type resonance]
 *   idearium idea tension <uuid>
 *   idearium idea archive <uuid> --reason "..."
 *   idearium idea search <term>
 *   idearium idea tree
 *   idearium spec new <idea-uuid> [--name "..."]
 *   idearium spec show <uuid>
 *   idearium spec check <uuid>
 *   idearium spec list [--phase seed]
 *   idearium spec export <uuid>
 *   idearium gap list [--status open] [--severity high]
 *   idearium gap show <uuid>
 *   idearium gap open --description "..." [--type unresolved] [--severity medium] [--idea <uuid>]
 *   idearium gap resolve <uuid> [--resolution "..."]
 *   idearium gap ignore <uuid> [--reason "..."]
 *   idearium repo plan <repo> <spec path> [--derive] [--replan] [--dry]   (0.39.284 W2)
 *   idearium repo phases <repo> <spec path>
 *   idearium repo build <repo> <spec path> [--phase <id>]
 *   idearium routing [show]                       (0.39.286 RG2) the routing policy, breakers, the route per block
 *   idearium routing plan [--block id] [--agent a]  the route one chunk would take
 *   idearium routing set <key> <value>            mode|chain|ollama_models|learn_min_records|fallback_on|max_hops|attempts_per_hop|breaker_threshold|breaker_cooldown_ms|skip_open
 *   idearium routing learned [--type build:api]   (0.39.287) what each provider:model has done per chunk type
 *   idearium verify <repo>                        (0.39.291 PV1) do the repo's files work? parses · resolves · its own tests in COS
 *   idearium prove <repo> [--rounds 3] [--cancel] (0.39.291 PV3) build → verify → send failures back → again, until proven
 *   idearium spec-library import <zip> [--dry-run] (0.39.290 IL1) a zip of specs → ideas + specs (duplicates folded, programs refused)
 *   idearium spec-library [--family product]      what the library holds
 *   idearium spec-library to-repo <title|sha>     (0.39.292 IL2) a library spec → a repo in the pipeline, with spec/<slug>.spec
 *   idearium workshop [new|show|write|ambition|feed|accept|dismiss|save]   (0.39.294 SW1) the spec workshop
 *   idearium push [--message "..."] [--branch main]
 *   idearium log [--n 20]
 *   idearium status
 *   idearium snr
 *   idearium events [--n 50]
 *   idearium start  — start HTTP API server
 */

import { getIdeaOS, VERSION, IDEA_PHASES } from '../core/index.js';
// §BUILT 2026-09-03 — spec-engine/repo commands (below) call these
// directly, no HTTP — matches this file's own §3.1 law for everything
// except speceng.build (see that command's own header note).
import * as se from '../spec-engine/index.js';
import { RepoLayer } from '../repo/index.js';
import http from 'http';

let _repoLayer = null;
function repoLayer() {
  if (!_repoLayer) _repoLayer = new RepoLayer({ specEngine: se });
  return _repoLayer;
}

// §BUG FOUND BY RUNNING IT 2026-09-03 — short() slices the first 8 chars,
// right for a plain UUID but repo uuids are `nexus-id-repo-<8hex>` (repo/
// index.js's own format) — the distinguishing part is the LAST segment,
// not the first. short() on a real repo uuid printed "nexus-id" for
// every single repo in the list, identical, useless. shortRepo() takes
// the real distinguishing suffix instead.
function _findRepo(prefix) {
  const repos = repoLayer().list({ includeArchived: true });
  const repo = repos.find(r => r.uuid === prefix) || repos.find(r => r.uuid.startsWith(prefix)) || repos.find(r => r.uuid.endsWith(prefix))
    || repos.find(r => r.name === prefix);
  if (!repo) die(`repo not found: ${prefix}`);
  return repo;
}
function shortRepo(uuid) { return uuid?.split('-repo-')[1] || short(uuid); }

// §BUG FOUND BY RUNNING IT 2026-09-03 — every other command in this file
// resolves a short uuid prefix (short(uuid) is literally what printSpec/
// printIdea/etc. print back at you to copy). se.loadSpec() does an exact
// directory lookup, no prefix match — `speceng show 30ed9da7` on the real
// tesr spec from this session's own screenshots failed with "not found"
// on first real run. Same convention as the legacy commands, applied here.
function _resolveSpecUuid(prefix) {
  if (!prefix) return null;
  const specs = se.listSpecs({ includeDeleted: true });
  const exact = specs.find(s => s.uuid === prefix);
  if (exact) return exact.uuid;
  const match = specs.find(s => s.uuid.startsWith(prefix));
  return match ? match.uuid : prefix; // fall through — let the real call give the real error if truly not found
}

// §HONEST LIMIT — real HTTP to the local idearium server, the one
// deliberate exception to "no HTTP round-trip" in this file (speceng.build
// only). Not abstracted further than this — a single small helper, not a
// second API client.
const IDEARIUM_PORT = parseInt(process.env.IDEARIUM_PORT || '4800');
async function _routingLocal() {
  const { createRequire } = await import('module');
  const PR = createRequire(import.meta.url)('../../lib/pipeline-routing.js');
  const cfg = await import('../lib/config.js');
  return { PR, policy: PR.policyFrom((cfg.getConfig() || {}).routing || {}), blocks: se.SPEC_SECTIONS };
}

// §0.39.290 — a raw upload (a zip) to the running idearium; long timeout (a big library converts for a while)
function _localUpload(path, buf) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: IDEARIUM_PORT, path, method: 'PUT',
      headers: { 'Content-Type': 'application/zip', 'Content-Length': buf.length }, timeout: 600000 }, (res) => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => { try { const p = JSON.parse(data); res.statusCode >= 400 ? reject(new Error(p.error || `HTTP ${res.statusCode}`)) : resolve(p); } catch (e) { reject(new Error(`unparseable response: ${e.message}`)); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end(buf);
  });
}

function _verdictTag(v) { return v === 'proven' ? mint('PROVEN') : v === 'parses' ? amber('PARSES — not proven') : v === 'stalled' ? coral('STALLED') : v ? coral(String(v).toUpperCase()) : gray('…'); }
function _printVerify(repo, r) {
  header(`verify ${repo.name} — ${r.files} file(s) · ${Math.round((r.ms || 0) / 100) / 10} s`);
  const c = r.checks || {};
  const line = (k, x) => console.log(`  ${k.padEnd(9)} ${!x ? gray('—') : x.ran === false ? gray(`not run — ${x.why}`) : x.failed ? coral(`${x.failed} failed`) : mint('ok')}${x && x.ran !== false && x.checked != null ? dim(` (${x.checked} checked)`) : ''}`);
  line('syntax', c.syntax); line('data', c.data); line('python', c.python);
  console.log(`  ${'imports'.padEnd(9)} ${!c.deps ? gray('—') : c.deps.ran === false ? gray(`not run — ${c.deps.why}`) : (c.deps.missing || c.deps.brokenRelative) ? coral(`${c.deps.brokenRelative} broken · ${c.deps.missing} missing`) : mint('ok')}`);
  console.log(`  ${'tests'.padEnd(9)} ${!c.tests ? gray('—') : c.tests.ran === false ? gray(`not run — ${c.tests.why}`) : c.tests.failed ? coral(`${c.tests.failed} of ${c.tests.runs} failed`) : mint(`${c.tests.passed} passed`)}`);
  for (const f of (r.failures || []).slice(0, 20)) console.log(`    ${coral(f.kind.padEnd(10))} ${f.file || '(project)'}${f.line ? `:${f.line}` : ''}  ${gray(String(f.error).slice(0, 120))}`);
  console.log(`
  ${_verdictTag(r.verdict)}  ${r.why}
`);
}

/** §0.39.294 SW1 — the workshop through the running idearium; a stopped idearium is said, with what to do */
async function _wsApi(method, path, body = null, timeoutMs = 30000) {
  try { const r = await _localApi(method, path, body, timeoutMs); return r.data || r; }
  catch (e) { die(`${e.message}${/ECONNREFUSED/.test(e.message) ? ' — start idearium first (the workshop is served by it)' : ''}`); }
}
/** an idea by its uuid or the first 8 characters of it, as `idearium void` prints them */
async function _voidId(key) {
  if (!key) die('name the idea (its id, or the first 8 characters of it)');
  const r = await _wsApi('GET', '/api/void');
  const hit = r.ideas.filter(i => i.uuid === key || i.uuid.startsWith(key));
  if (hit.length !== 1) die(hit.length ? `${hit.length} ideas start with ${key}` : `no idea ${key}`);
  return hit[0].uuid;
}
function _wsPrint(w, full = false) {
  header(`${w.title} — workshop ${w.uuid}`);
  console.log(`  from ${w.source.kind}${w.source.title ? ': ' + w.source.title : ''} · ambition ${w.ambition} · ${w.specPath ? 'saved to ' + w.specPath : 'not saved to a repo yet'}`);
  for (const s of w.sections) console.log(`  ${bold(s.id.padEnd(22))} ${String(s.title).slice(0, 40).padEnd(40)} ${dim(`${String(s.body || '').length} chars`)}${full && s.body ? '\n' + String(s.body).split('\n').map(l => '      ' + l).join('\n') : ''}`);
  const open = w.proposals.filter(p => p.status === 'open');
  if (open.length) { console.log(`\n  open proposals (${open.length})`); for (const p of open.slice(-12)) console.log(`  ${dim(p.uuid)}  ${p.kind.padEnd(13)} ${String(p.text).split('\n')[0].slice(0, 90)}`); }
  console.log('');
}
function _localApi(method, path, body = null, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: IDEARIUM_PORT, path, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      timeout: timeoutMs,
    }, (res) => {
      let data = ''; res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          else resolve(parsed);
        } catch (e) { reject(new Error(`unparseable response: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Colour helpers ──────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  sky:    '\x1b[96m',
  mint:   '\x1b[92m',
  amber:  '\x1b[93m',
  coral:  '\x1b[91m',
  violet: '\x1b[95m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};

const sky    = s => `${C.sky}${s}${C.reset}`;
const mint   = s => `${C.mint}${s}${C.reset}`;
const amber  = s => `${C.amber}${s}${C.reset}`;
const coral  = s => `${C.coral}${s}${C.reset}`;
const violet = s => `${C.violet}${s}${C.reset}`;
const bold   = s => `${C.bold}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;
const gray   = s => `${C.gray}${s}${C.reset}`;

function phaseColor(phase) {
  return { seed:sky, expanding:mint, tensioned:amber, specced:violet, building:amber, complete:mint, archived:gray }[phase]?.(phase) ?? phase;
}

function tensionColor(t) {
  if (t > 0.7) return coral(`${pct(t)}`);
  if (t > 0.4) return amber(`${pct(t)}`);
  return mint(`${pct(t)}`);
}

function bar(v, w=20) {
  const filled = Math.round(v * w);
  return '[' + '█'.repeat(filled) + '░'.repeat(w - filled) + ']';
}

function pct(v) { return `${Math.round(v*100)}%`; }
function ts(ms) { return new Date(ms).toLocaleString(); }
function short(uuid) { return uuid?.slice(0,8) ?? '—'; }

function severityColor(s) {
  return { fatal:coral, high:coral, medium:amber, low:gray }[s]?.(s) ?? s;
}

// ─── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i+1];
      if (next && !next.startsWith('--')) { flags[key] = next; i += 2; }
      else { flags[key] = true; i++; }
    } else {
      positional.push(a);
      i++;
    }
  }
  return { positional, flags };
}

// ─── Output helpers ──────────────────────────────────────────────────────────

function die(msg) {
  console.error(coral(`✗ ${msg}`));
  process.exit(1);
}

function header(title) {
  const line = '─'.repeat(64);
  console.log(`\n${sky(line)}`);
  console.log(`  ${bold(sky(title))}`);
  console.log(`${sky(line)}`);
}

function section(label) {
  console.log(`\n${dim('┄')} ${gray(label.toUpperCase())}`);
}

// ─── Idea display ─────────────────────────────────────────────────────────────

function printIdea(idea, os, verbose = false) {
  const t      = idea.tension || 0;
  const tColor = t > 0.7 ? coral : t > 0.4 ? amber : mint;
  const phase  = phaseColor(idea.phase);
  const openG  = os.gaps({ status:'open' }).filter(g=>(g.between||[]).includes(idea.uuid)||g.ideaUuid===idea.uuid);

  console.log(`\n  ${bold(idea.text)}`);
  console.log(`  ${dim('uuid')}  ${gray(idea.uuid)}`);
  console.log(`  ${dim('phase')} ${phase}  ${dim('tension')} ${tColor(bar(t,16))} ${tColor(pct(t))}`);
  if ((idea.tags||[]).length) console.log(`  ${dim('tags')}  ${idea.tags.map(t=>sky(`#${t}`)).join(' ')}`);
  if (idea.compartment)       console.log(`  ${dim('comp')}  ${violet(idea.compartment)}`);
  if (openG.length)           console.log(`  ${dim('gaps')}  ${coral(`◆ ${openG.length} open`)}`);
  if (idea.linkedSpec)        console.log(`  ${dim('spec')}  ${mint(short(idea.linkedSpec))}`);

  if (verbose) {
    if ((idea.resonanceWith||[]).length) console.log(`  ${dim('resonance')} ${idea.resonanceWith.map(short).join(', ')}`);
    if ((idea.tensionWith||[]).length)   console.log(`  ${dim('tension↕')}  ${idea.tensionWith.map(short).join(', ')}`);
    console.log(`  ${dim('created')} ${gray(ts(idea.createdAt))}  ${dim('updated')} ${gray(ts(idea.updatedAt))}`);
    if (idea.causedBy) console.log(`  ${dim('causedBy')} ${gray(idea.causedBy)}`);
    if (idea.archiveReason) console.log(`  ${dim('archived')} ${coral(idea.archiveReason)}`);
  }
}

function printGap(gap) {
  const sev = severityColor(gap.severity);
  const stat = gap.status === 'open' ? coral('open') : gap.status === 'resolved' ? mint('resolved') : gray(gap.status);
  console.log(`\n  ${bold(gap.description)}`);
  console.log(`  ${dim('id')}     ${gray(gap.uuid)}`);
  console.log(`  ${dim('type')}   ${sky(gap.type)}  ${dim('severity')} ${sev}  ${dim('status')} ${stat}`);
  if (gap.ideaUuid) console.log(`  ${dim('idea')}   ${gray(short(gap.ideaUuid))}`);
  if (gap.resolution) console.log(`  ${dim('resolution')} ${mint(gap.resolution)}`);
  if (gap.ignoreReason) console.log(`  ${dim('ignored')} ${gray(gap.ignoreReason)}`);
  console.log(`  ${dim('created')} ${gray(ts(gap.createdAt))}`);
}

function printSpec(spec) {
  const phase = phaseColor(spec.phase);
  const done  = spec.sections.filter(s=>s.complete).length;
  const total = spec.sections.length;
  console.log(`\n  ${bold(spec.name)}`);
  console.log(`  ${dim('uuid')}     ${gray(spec.uuid)}`);
  console.log(`  ${dim('phase')}    ${phase}  ${dim('version')} ${sky(spec.version)}`);
  console.log(`  ${dim('sections')} ${mint(`${done}/${total}`)} complete`);
  if (spec.ideaUuid) console.log(`  ${dim('idea')}     ${gray(short(spec.ideaUuid))}`);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function _manifest(verb, { positional, flags }) {
  const { dispatch } = await import('../spec-engine/manifest/commands.js');
  const r = dispatch([verb, ...positional], flags);
  if (r.json) console.log(JSON.stringify(r.json, null, 2));
  for (const l of r.out || []) console.log(r.code ? coral(l) : l);
  if (r.code) process.exit(r.code);
}

const COMMANDS = {

  // ── idearium idea ──────────────────────────────────────────────────────────

  async 'idea.add'(os, { positional, flags }) {
    const text = positional[0];
    if (!text) die('usage: idearium idea add "text" [--tags tag1,tag2] [--compartment nexus]');
    const tags = flags.tags ? flags.tags.split(',').map(t=>t.trim()).filter(Boolean) : [];
    os.emit('idearium.idea.create', { text, tags, compartment: flags.compartment||null, source:'cli' });
    const idea = os.db.ideas[os.db.ideas.length - 1];
    console.log(mint(`✓ idea created`));
    printIdea(idea, os);
  },

  async 'idea.list'(os, { positional, flags }) {
    const ideas = os.ideas({ phase: flags.phase, tag: flags.tag, sort: flags.sort||'tension', limit: flags.limit, search: flags.search });
    if (!ideas.length) { console.log(gray('  no ideas found')); return; }
    header(`Ideas (${ideas.length})`);
    for (const idea of ideas) printIdea(idea, os);
    console.log('');
  },

  async 'idea.show'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium idea show <uuid>');
    const idea = os.db.ideas.find(i=>i.uuid===uuid||i.uuid.startsWith(uuid));
    if (!idea) die(`idea not found: ${uuid}`);
    // Recompute tension first
    os.emit('idearium.idea.tension', { uuid: idea.uuid });
    const updated = os.idea(idea.uuid);
    header(`Idea: ${updated.text.slice(0,50)}`);
    printIdea(updated, os, true);
    const links = os.db.links.filter(l=>l.fromUuid===idea.uuid||l.toUuid===idea.uuid);
    if (links.length) {
      section('links');
      for (const l of links) {
        const other = os.db.ideas.find(i=>i.uuid===(l.fromUuid===idea.uuid?l.toUuid:l.fromUuid));
        console.log(`  ${sky(l.linkType.padEnd(10))} ${other?.text?.slice(0,50)??'—'} ${gray(short(l.fromUuid===idea.uuid?l.toUuid:l.fromUuid))}`);
      }
    }
    const gaps = os.gaps({ status:'open' }).filter(g=>(g.between||[]).includes(idea.uuid)||g.ideaUuid===idea.uuid);
    if (gaps.length) {
      section('open gaps');
      for (const g of gaps) printGap(g);
    }
    console.log('');
  },

  async 'idea.tension'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium idea tension <uuid>');
    const idea = os.db.ideas.find(i=>i.uuid===uuid||i.uuid.startsWith(uuid));
    if (!idea) die(`idea not found: ${uuid}`);
    os.emit('idearium.idea.tension', { uuid: idea.uuid });
    const updated = os.idea(idea.uuid);
    const t = updated.tension;
    const tColor = t > 0.7 ? coral : t > 0.4 ? amber : mint;
    console.log(mint(`✓ tension computed`));
    console.log(`  ${tColor(bar(t,30))} ${bold(tColor(pct(t)))}`);
    const comps = os.computeTension(updated).components;
    for (const [k,v] of Object.entries(comps)) {
      if (v > 0) console.log(`  ${dim(k.padEnd(20))} ${amber(pct(v))}`);
    }
  },

  async 'idea.phase'(os, { positional }) {
    const [uuid, phase] = positional;
    if (!uuid||!phase) die('usage: idearium idea phase <uuid> <phase>');
    if (!IDEA_PHASES.includes(phase)) die(`invalid phase: ${phase}\nValid: ${IDEA_PHASES.join(', ')}`);
    const idea = os.db.ideas.find(i=>i.uuid===uuid||i.uuid.startsWith(uuid));
    if (!idea) die(`idea not found: ${uuid}`);
    os.emit('idearium.idea.phase', { uuid: idea.uuid, phase, source:'cli' });
    console.log(mint(`✓ ${short(idea.uuid)} → ${phaseColor(phase)}`));
  },

  async 'idea.link'(os, { positional, flags }) {
    const [uuidA, uuidB] = positional;
    if (!uuidA||!uuidB) die('usage: idearium idea link <uuid-a> <uuid-b> [--type resonance]');
    const a = os.db.ideas.find(i=>i.uuid===uuidA||i.uuid.startsWith(uuidA));
    const b = os.db.ideas.find(i=>i.uuid===uuidB||i.uuid.startsWith(uuidB));
    if (!a) die(`idea not found: ${uuidA}`);
    if (!b) die(`idea not found: ${uuidB}`);
    os.emit('idearium.idea.link', { fromUuid: a.uuid, toUuid: b.uuid, linkType: flags.type||'resonance', source:'cli' });
    console.log(mint(`✓ linked: ${short(a.uuid)} ${sky(flags.type||'resonance')} ${short(b.uuid)}`));
  },

  async 'idea.archive'(os, { positional, flags }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium idea archive <uuid> --reason "..."');
    if (!flags.reason) die('--reason required (§M1 — nothing deleted, archive only)');
    const idea = os.db.ideas.find(i=>i.uuid===uuid||i.uuid.startsWith(uuid));
    if (!idea) die(`idea not found: ${uuid}`);
    os.emit('idearium.idea.archive', { uuid: idea.uuid, reason: flags.reason, source:'cli' });
    console.log(mint(`✓ archived: ${short(idea.uuid)}`));
  },

  async 'idea.search'(os, { positional }) {
    const term = positional[0];
    if (!term) die('usage: idearium idea search <term>');
    const ideas = os.ideas({ search: term });
    if (!ideas.length) { console.log(gray(`  no ideas matching "${term}"`)); return; }
    header(`Search: "${term}" (${ideas.length})`);
    for (const idea of ideas) printIdea(idea, os);
    console.log('');
  },

  async 'idea.tree'(os) {
    const ideas = os.db.ideas.filter(i=>i.phase!=='archived'&&!i.parentIdea);
    if (!ideas.length) { console.log(gray('  no ideas')); return; }
    header('Idea Tree');
    for (const idea of ideas) {
      const t = idea.tension||0;
      const tc = t>0.7?coral:t>0.4?amber:mint;
      console.log(`  ${tc('◆')} ${bold(idea.text.slice(0,60))} ${dim(short(idea.uuid))} ${phaseColor(idea.phase)}`);
      const links = os.db.links.filter(l=>l.fromUuid===idea.uuid);
      for (const l of links) {
        const other = os.db.ideas.find(i=>i.uuid===l.toUuid);
        if (other) console.log(`    ${gray('└─')} ${sky(l.linkType)} ${dim(other.text.slice(0,50))}`);
      }
    }
    console.log('');
  },

  // ── idearium spec ──────────────────────────────────────────────────────────

  async 'spec.new'(os, { positional, flags }) {
    const ideaUuid = positional[0];
    if (!ideaUuid) die('usage: idearium spec new <idea-uuid> [--name "..."]');
    const idea = os.db.ideas.find(i=>i.uuid===ideaUuid||i.uuid.startsWith(ideaUuid));
    if (!idea) die(`idea not found: ${ideaUuid}`);
    const name = flags.name || `Spec: ${idea.text.slice(0,40)}`;
    os.emit('idearium.spec.create', { name, ideaUuid: idea.uuid, source:'cli' });
    const spec = os.db.specs[os.db.specs.length-1];
    console.log(mint(`✓ spec created`));
    printSpec(spec);
    section('next steps');
    console.log(`  ${dim('fill sections:')} idearium spec section ${short(spec.uuid)} intent`);
    console.log(`  ${dim('check:')}         idearium spec check ${short(spec.uuid)}`);
    console.log('');
  },

  async 'spec.show'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium spec show <uuid>');
    const spec = os.db.specs.find(s=>s.uuid===uuid||s.uuid.startsWith(uuid));
    if (!spec) die(`spec not found: ${uuid}`);
    header(`Spec: ${spec.name}`);
    printSpec(spec);
    section('sections');
    for (const s of spec.sections) {
      const done = s.complete ? mint('✓') : (s.required ? coral('✗') : dim('○'));
      console.log(`  ${done} ${s.id.padEnd(20)} ${dim(s.content?s.content.slice(0,50):'—')}`);
    }
    console.log('');
  },

  async 'spec.list'(os, { flags }) {
    const specs = os.specs(flags);
    if (!specs.length) { console.log(gray('  no specs')); return; }
    header(`Specs (${specs.length})`);
    for (const s of specs) printSpec(s);
    console.log('');
  },

  async 'spec.check'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium spec check <uuid>');
    const spec = os.db.specs.find(s=>s.uuid===uuid||s.uuid.startsWith(uuid));
    if (!spec) die(`spec not found: ${uuid}`);
    os.emit('idearium.spec.check', { uuid: spec.uuid });
    const updated = os.spec(spec.uuid);
    const fail = updated.sections.filter(s=>s.required&&!s.complete);
    if (!fail.length) console.log(mint(`✓ spec passes — phase: ${phaseColor(updated.phase)}`));
    else {
      console.log(coral(`✗ ${fail.length} required sections incomplete:`));
      for (const s of fail) console.log(`  ${coral('✗')} ${s.id}`);
    }
  },

  async 'spec.export'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium spec export <uuid>');
    const spec = os.db.specs.find(s=>s.uuid===uuid||s.uuid.startsWith(uuid));
    if (!spec) die(`spec not found: ${uuid}`);
    let md = `# ${spec.name}\n\n**Version:** ${spec.version}  **Phase:** ${spec.phase}\n\n`;
    for (const s of spec.sections) {
      md += `## ${s.title}\n\n${s.content || '_not yet written_'}\n\n`;
    }
    process.stdout.write(md);
  },

  // ── idearium speceng ─────────────────────────────────────────────────────────
  // §BUILT 2026-09-03 — spec-engine (spec-engine/index.js) has been the
  // real, actively-built chunk/agent-routing system this whole session and
  // had ZERO CLI commands. This file's own header claims "every feature
  // has a CLI command" — that was false for the single largest feature in
  // idearium. Separate namespace from `spec` (above) deliberately: `spec`
  // already means the legacy os.specs system; overloading it would make
  // one command name resolve to two genuinely different data stores
  // depending on which uuid you gave it — real ambiguity, not saved
  // typing. `speceng` matches the internal action-name convention already
  // used everywhere on the wire (api/index.js's `speceng.build`,
  // `speceng.chunk.setAgent`, etc.) — same vocabulary, CLI to HTTP.
  //
  // list/show/chunk-agent call spec-engine's own functions directly — no
  // HTTP round-trip, same law every other command here follows. `build`
  // is the one deliberate exception: the real dispatch orchestration
  // (agent-suite → WARP → guardian, verification, RAID observability) is
  // ~150 lines of handler-embedded logic in api/index.js, not exported as
  // a reusable function anywhere. Duplicating it here would violate §
  // no-repetition worse than one honest HTTP call to the running server
  // does — named as a real, current limitation, not hidden.

  async 'speceng.list'(os, { flags }) {
    const specs = se.listSpecs({ includeDeleted: !!flags.all }).filter(s => flags.all || !s.deleted);
    if (!specs.length) { console.log(gray('  no spec-engine specs')); return; }
    header(`spec-engine specs (${specs.length})`);
    for (const s of specs) {
      console.log(`\n  ${bold(s.name)}  ${dim(short(s.uuid))}`);
      console.log(`  ${dim('status')} ${s.status === 'complete' ? mint(s.status) : sky(s.status)}  ${dim('progress')} ${mint(`${s.doneChunks}/${s.totalChunks}`)}  ${dim('agent')} ${violet(s.agent)}`);
    }
    console.log('');
  },

  async 'speceng.show'(os, { positional }) {
    const uuid = _resolveSpecUuid(positional[0]);
    if (!uuid) die('usage: idearium speceng show <uuid>');
    let manifest;
    try { manifest = se.loadSpec(uuid); } catch (e) { die(e.message); }
    header(`spec-engine: ${manifest.name}`);
    console.log(`  ${dim('uuid')}     ${gray(manifest.uuid)}`);
    console.log(`  ${dim('status')}   ${sky(manifest.status)}  ${dim('progress')} ${mint(pct(manifest.progress/100))}  ${dim('agent')} ${violet(manifest.agent)}`);
    section('chunks');
    for (const c of manifest.chunks.slice().sort((a,b)=>a.chunkIdx-b.chunkIdx)) {
      const statusMark = c.status === 'complete' ? mint('✓') : c.status === 'building' ? amber('…') : c.status === 'failed' || c.status === 'escalated' ? coral('✗') : gray('○');
      const inFlight = c.status === 'building' ? (c.jobId ? gray(` job:${String(c.jobId).slice(0,10)}`) : gray(' local')) : '';
      console.log(`  ${statusMark} ${c.sectionId.padEnd(16)} ${violet(String(c.agent).padEnd(10))} ${gray(short(c.uuid))}${inFlight}`);
    }
    console.log('');
  },

  async 'speceng.chunk-agent'(os, { positional }) {
    const specUuid = _resolveSpecUuid(positional[0]);
    const [, chunkPrefix, agent] = positional;
    if (!specUuid || !chunkPrefix || !agent) die('usage: idearium speceng chunk-agent <spec-uuid> <chunk-uuid> <agent>');
    let manifest;
    try { manifest = se.loadSpec(specUuid); } catch (e) { die(e.message); }
    const chunk0 = manifest.chunks.find(c => c.uuid === chunkPrefix) || manifest.chunks.find(c => c.uuid.startsWith(chunkPrefix));
    if (!chunk0) die(`chunk not found in spec: ${chunkPrefix}`);
    try {
      const chunk = se.setChunkAgent(specUuid, chunk0.uuid, agent);
      console.log(mint(`✓ ${chunk.sectionId} → ${chunk.agent}`));
    } catch (e) { die(e.message); }
  },

  async 'speceng.build'(os, { positional }) {
    const uuid = _resolveSpecUuid(positional[0]);
    if (!uuid) die('usage: idearium speceng build <uuid>');
    // §HONEST LIMIT — see header note above this command group. Real HTTP
    // call to the running idearium server, not a direct spec-engine call —
    // the dispatch orchestration only exists inline in api/index.js today.
    try {
      const res = await _localApi('POST', `/api/spec-engine/specs/${uuid}/build`);
      if (res.done) { console.log(mint('✓ all chunks complete')); return; }
      if (res.reused) { console.log(mint(`✓ ${res.sectionId} reused from prior spec — 0 tokens`)); return; }
      console.log(sky(`→ dispatched ${res.sectionTitle || res.sectionId} to ${violet(res.agent)} (${res.status})`));
    } catch (e) { die(`build dispatch failed (is idearium running on :4800?): ${e.message}`); }
  },

  // ── idearium repo ────────────────────────────────────────────────────────────
  // Same direct-call law as speceng.list/show above — RepoLayer resolves
  // live off spec-engine, no HTTP needed for read-only listing.

  async 'repo.list'(os, { flags }) {
    const repos = repoLayer().list({ includeArchived: !!flags.all });
    if (!repos.length) { console.log(gray('  no repos')); return; }
    header(`repos (${repos.length})`);
    for (const r of repos) {
      console.log(`\n  ${bold(r.name)}  ${dim(shortRepo(r.uuid))}`);
      console.log(`  ${dim('source')} ${sky(r.source)}  ${dim('files')} ${mint(r.fileCount)}  ${dim('spec')} ${gray(short(r.specUuid))}`);
    }
    console.log('');
  },

  async 'repo.show'(os, { positional }) {
    const prefix = positional[0];
    if (!prefix) die('usage: idearium repo show <uuid>');
    const repos = repoLayer().list({ includeArchived: true });
    // matches either the full uuid, a prefix of it, OR the suffix
    // shortRepo() actually prints in `repo list` — a user copying what
    // they were just shown needs the suffix to work, not just a prefix.
    const repo = repos.find(r => r.uuid === prefix) || repos.find(r => r.uuid.startsWith(prefix)) || repos.find(r => r.uuid.endsWith(prefix));
    if (!repo) die(`repo not found: ${prefix}`);
    header(`repo: ${repo.name}`);
    console.log(`  ${dim('uuid')}    ${gray(repo.uuid)}`);
    console.log(`  ${dim('source')}  ${sky(repo.source)}  ${dim('spec')} ${gray(short(repo.specUuid))}`);
    if (repo.filesError) console.log(`  ${coral('files unreadable: ' + repo.filesError)}`);
    section('files');
    for (const f of repo.files) {
      const done = f.status === 'complete' ? mint('✓') : gray('○');
      console.log(`  ${done} ${f.path.padEnd(30)} ${dim(`${f.bytes}b`)}`);
    }
    console.log('');
  },

  // §BUILT 2026-09-15 — the API has had DELETE /api/repos/:uuid → repo.archive
  // since the v2 redesign, but there was never a CLI path to it — only the
  // UI could reach it, and until this same change the UI didn't either.
  // Soft-delete, consistent with §7.4 and the same archive/restore pattern
  // spec-engine's deleteSpec/restoreSpec already use: sets status='archived'
  // (repo/index.js's archive()), filtered out of `repo list` by default,
  // still visible with --all, nothing on disk touched or destroyed.
  async 'repo.archive'(os, { positional }) {
    const prefix = positional[0];
    if (!prefix) die('usage: idearium repo archive <uuid>');
    const repos = repoLayer().list({ includeArchived: true });
    const repo = repos.find(r => r.uuid === prefix) || repos.find(r => r.uuid.startsWith(prefix)) || repos.find(r => r.uuid.endsWith(prefix));
    if (!repo) die(`repo not found: ${prefix}`);
    if (repo.status === 'archived') { console.log(gray(`  already archived: ${repo.name}`)); return; }
    const result = repoLayer().archive(repo.uuid);
    if (result.error) die(result.error);
    console.log(`${mint('✓')} archived ${bold(repo.name)}  ${dim(shortRepo(repo.uuid))}`);
  },

  // ── §0.39.284 W2 — plan a spec, see its phases, build the next one ────────────
  // James: "remember its alwasy cli and api first" · "get it coding the projects". The same routes the Spec tab and
  // the Plan panel use (POST /api/repos/:uuid/spec/plan, GET …/spec/plan, POST …/spec/build). --dry derives the plan
  // from the spec here, with no server and nothing written.
  async 'repo.plan'(os, { positional, flags }) {
    const [prefix, specPath0] = positional;
    // --dry --file <spec>: plan a spec file on disk (no repo, no server) — e.g. before importing it
    if (flags.dry && typeof flags.file === 'string') {
      const fs = await import('fs');
      if (!fs.existsSync(flags.file)) die(`no such file: ${flags.file}`);
      const SP = await import('../repo/spec-plan.js');
      const d = SP.derivePlan({ specPath: flags.file.replace(/\\/g, '/'), specText: fs.readFileSync(flags.file, 'utf8'), reason: 'idearium repo plan --dry --file' });
      if (!d.ok) die(`not plannable: ${(d.problems || []).join('; ')}`);
      header(`plan of ${flags.file} — derived from ${d.sections} section(s), not written (--dry)`);
      for (const ph of SP.orderPhases(d.phases)) console.log(`  ${dim(ph.layer.padEnd(10))} ${bold(ph.id)}  ${gray(ph.depends_on.join(', ') || '—')}`);
      console.log('');
      return;
    }
    const specPath = specPath0;
    if (!prefix || !specPath) die('usage: idearium repo plan <repo> <spec path> [--derive] [--replan] [--dry] [--provider <p>]  |  repo plan --dry --file <spec file>');
    const repo = _findRepo(prefix);
    if (flags.dry) {
      const SP = await import('../repo/spec-plan.js');
      const r = repoLayer().readTextFile(repo.uuid, specPath);
      if (!r || r.error || typeof r.content !== 'string') die(`no spec ${specPath} in ${repo.name}`);
      const d = SP.derivePlan({ specPath, specText: r.content, reason: 'idearium repo plan --dry' });
      if (!d.ok) die(`not plannable: ${(d.problems || []).join('; ')}`);
      header(`plan of ${specPath} — derived from ${d.sections} section(s), not written (--dry)`);
      for (const ph of SP.orderPhases(d.phases)) console.log(`  ${dim(ph.layer.padEnd(10))} ${bold(ph.id)}  ${gray(ph.depends_on.join(', ') || '—')}`);
      console.log('');
      return;
    }
    try {
      const res = await _localApi('POST', `/api/repos/${repo.uuid}/spec/plan`, { path: specPath, derive: !!flags.derive, replan: !!flags.replan, provider: flags.provider || null });
      const d = res.data || res;
      if (d.plannedBy === 'derived') console.log(`${mint('✓')} ${d.mapPath} written — ${d.phases} phase(s), derived from the spec`);
      else console.log(`${sky('→')} the agent is planning ${specPath} (${d.runId}); it lands in ${d.mapPath} — from the agent, its reply, or derived from the spec. ${dim(`idearium repo phases ${shortRepo(repo.uuid)} ${specPath}`)}`);
    } catch (e) { die(`plan failed (is idearium running on :${IDEARIUM_PORT}?): ${e.message}`); }
  },

  async 'repo.phases'(os, { positional }) {
    const [prefix, specPath] = positional;
    if (!prefix || !specPath) die('usage: idearium repo phases <repo> <spec path>');
    const repo = _findRepo(prefix);
    try {
      const res = await _localApi('GET', `/api/repos/${repo.uuid}/spec/plan?path=${encodeURIComponent(specPath)}`);
      const d = res.data || res;
      if (!d.exists) { console.log(gray(`  no plan yet — idearium repo plan ${shortRepo(repo.uuid)} ${specPath}`)); return; }
      header(`${d.mapPath} — ${d.phases.length} phase(s)${d.valid ? '' : coral(' (not valid)')}`);
      for (const ph of d.phases) console.log(`  ${ph.id === d.next ? mint('◌') : (ph.status === 'done' || ph.status === 'complete') ? mint('✓') : gray('○')} ${dim(ph.layer.padEnd(10))} ${bold(ph.id)}`);
      if (d.next) console.log(`\n  next: ${bold(d.next)} — ${dim(`idearium repo build ${shortRepo(repo.uuid)} ${specPath}`)}`);
      console.log('');
    } catch (e) { die(`could not read the plan (is idearium running on :${IDEARIUM_PORT}?): ${e.message}`); }
  },

  async 'repo.build'(os, { positional, flags }) {
    const [prefix, specPath] = positional;
    if (!prefix || !specPath) die('usage: idearium repo build <repo> <spec path> [--phase <id>] [--provider <p>]');
    const repo = _findRepo(prefix);
    try {
      const res = await _localApi('POST', `/api/repos/${repo.uuid}/spec/build`, { path: specPath, phase: flags.phase || null, provider: flags.provider || null });
      const d = res.data || res;
      console.log(`${sky('→')} building ${bold(d.phase)} (${d.layer}) of ${d.mapPath}${d.runId ? ` — run ${d.runId}` : ''}`);
    } catch (e) { die(`build failed (is idearium running on :${IDEARIUM_PORT}?): ${e.message}`); }
  },

  // ── idearium routing (0.39.286 RG2) ────────────────────────────────────────
  // The policy is read straight from idearium's config and lib/pipeline-routing.js (no server needed); the breakers live
  // in the running server, so they are read from it when it answers.
  async 'routing'(os, args) { return COMMANDS['routing.show'](os, args); },
  async 'routing.show'(os, { flags }) {
    const { policy, PR, blocks } = await _routingLocal();
    if (flags.json) { console.log(JSON.stringify({ policy, blocks: blocks.map(b => ({ id: b.id, ...PR.plan({ block: b, policy }) })) }, null, 2)); return; }
    header(`routing — ${policy.mode} · up to ${policy.maxHops} hop(s) · ${policy.attemptsPerHop} attempt(s) per hop`);
    console.log(`  chain        ${policy.chain.join(' → ')}`);
    console.log(`  fallback on  ${policy.fallbackOn.join(', ')}  ${dim('(login never — it needs you)')}`);
    console.log(`  breaker      opens after ${policy.breakerThreshold} failure(s) in a row, for ${Math.round(policy.breakerCooldownMs / 1000)} s; open providers ${policy.skipOpen ? 'skipped' : 'still tried'}`);
    try {
      const r = await _localApi('GET', '/api/routing');
      const br = ((r.data || r).breakers || []).filter(b => b.fails || b.open);
      console.log(`  breakers     ${br.length ? br.map(b => `${b.provider}${b.open ? coral(' OPEN') : ''} (${b.fails} fail, last ${b.lastClass})`).join(' · ') : mint('all closed')}`);
    } catch (_) { console.log(`  breakers     ${gray('idearium is not running — breakers live in the server')}`); }
    console.log('');
    for (const b of blocks) {
      const pl = PR.plan({ block: b, policy });
      console.log(`  ${dim(b.id.padEnd(14))} ${pl.route.map(r => bold(r.provider)).join(gray(' → '))}${pl.skipped.length ? gray(`   skipped: ${pl.skipped.map(x => x.provider).join(', ')}`) : ''}`);
    }
    console.log(`\n  ${dim('idearium routing set mode economy · idearium routing set chain ollama,gemini,claude')}\n`);
  },
  async 'routing.plan'(os, { flags }) {
    const { policy, PR, blocks } = await _routingLocal();
    const block = flags.block ? blocks.find(b => b.id === flags.block) : null;
    if (flags.block && !block) die(`no block '${flags.block}' — one of: ${blocks.map(b => b.id).join(', ')}`);
    const pl = PR.plan({ preferAgent: flags.agent || null, block, policy });
    header(`route${block ? ` for ${block.id}` : ''} (${pl.mode})`);
    pl.route.forEach((r, i) => console.log(`  ${i + 1}. ${bold(r.provider)}  ${dim(r.why)}`));
    for (const x of pl.skipped) console.log(`  ${gray('–')} ${x.provider}  ${gray(x.why)}`);
    if (pl.beyond.length) console.log(`  ${gray(`beyond max_hops: ${pl.beyond.join(', ')}`)}`);
    console.log('');
  },
  async 'routing.learned'(os, { flags }) {
    const { PR } = await _routingLocal();
    const L = PR.learned({ jobType: flags.type || null });
    const keys = Object.keys(L).sort();
    if (!keys.length) { console.log(gray('\n  nothing learned yet — every chunk build records its outcome; learned mode uses them from routing.learn_min_records on\n')); return; }
    header('learned — per chunk type, best first');
    for (const k of keys) {
      console.log(`  ${bold(k)}`);
      for (const r of L[k]) console.log(`    ${(r.success >= 0.5 ? mint : coral)(`${Math.round(r.success * 100)}%`.padStart(4))}  ${r.provider.padEnd(34)} ${dim(`${r.ok} ok · ${r.failed} failed${r.medianMs ? ` · ${Math.round(r.medianMs / 1000)}s` : ''}`)}`);
    }
    console.log('');
  },
  async 'routing.set'(os, { positional }) {
    const [key, ...v] = positional;
    if (!key || !v.length) die('usage: idearium routing set <key> <value>');
    const cfg = await import('../lib/config.js');
    const raw = v.join(' ');
    const value = /^(true|false)$/.test(raw) ? raw === 'true' : (/^\d+$/.test(raw) ? Number(raw) : raw);
    cfg.setConfig(`routing.${key}`, value, { actor: 'cli' });
    console.log(`${mint('✓')} routing.${key} = ${JSON.stringify(value)}`);
  },

  // ── idearium verify / prove (0.39.291 PV1–PV4) ─────────────────────────────────
  // James: "Conrinue it first. Make sure it's enterprise grade." Through the running idearium (the builds need its agents).
  async 'verify'(os, { positional }) {
    if (!positional[0]) die('usage: idearium verify <repo>');
    const repo = _findRepo(positional[0]);
    // its tests run inside this call — a long wait
    let r; try { r = await _localApi('POST', `/api/repos/${repo.uuid}/verify`, {}, 600000); } catch (e) { die(`${e.message}${/ECONNREFUSED/.test(e.message) ? ' — start idearium first (verification runs in its COS)' : ''}`); }
    _printVerify(repo, r);
    process.exitCode = r.verdict === 'failed' ? 1 : 0;
  },
  async 'prove'(os, { positional, flags }) {
    if (!positional[0]) die('usage: idearium prove <repo> [--rounds 3] [--cancel]');
    const repo = _findRepo(positional[0]);
    try {
      if (flags.cancel) { const c = await _localApi('POST', `/api/repos/${repo.uuid}/prove/cancel`, {}); console.log(`${mint('✓')} cancelling ${c.run.uuid}`); return; }
      const s = await _localApi('POST', `/api/repos/${repo.uuid}/prove`, { rounds: flags.rounds ? Number(flags.rounds) : 3 });
      header(`prove ${repo.name} — ${s.alreadyRunning ? 'following the run already working' : `up to ${s.run.maxRounds} round(s)`}`);
      let shown = 0, last = '';
      for (;;) {
        await new Promise(r => setTimeout(r, 2000));
        const g = await _localApi('GET', `/api/repos/${repo.uuid}/prove`);
        const run = g.run; if (!run) die('the run disappeared');
        for (; shown < run.rounds.length; shown++) {
          const rr = run.rounds[shown];
          if (rr.verdict === null && run.state === 'running') break;   // not finished yet
          console.log(`  round ${rr.round}  ${_verdictTag(rr.verdict)}  ${dim(`${rr.built} built · ${rr.reused} reused${rr.repaired && rr.repaired.length ? ` · sent back: ${rr.repaired.join(', ')}` : ''}`)}`);
          for (const f of (rr.failures || []).slice(0, 8)) console.log(`    ${coral(f.kind.padEnd(10))} ${f.file || '(project)'}${f.line ? `:${f.line}` : ''}  ${gray(String(f.error).slice(0, 110))}`);
        }
        const cur = run.rounds[run.rounds.length - 1];
        const now = run.state === 'running' && cur ? `  round ${cur.round} — ${cur.current ? `building ${cur.current}` : 'verifying'} (${cur.built} built)` : '';
        if (now && now !== last) { console.log(gray(now)); last = now; }
        if (run.state !== 'running') {
          console.log(`
  ${_verdictTag(run.verdict)}  ${run.why}
`);
          process.exitCode = run.verdict === 'proven' ? 0 : 1;
          return;
        }
      }
    } catch (e) { die(`${e.message}${/ECONNREFUSED/.test(e.message) ? ' — start idearium first (the build uses its agents)' : ''}`); }
  },

  // ── idearium void (0.39.295) ──────────────────────────────────────────────────────
  // James: "Just have the spacial void, with a slider …" · "the ideas come from me though not agents". Through the
  // running idearium. --creativity / --stability 0..4 (normal…outlier / stable…unstable).
  async 'void'(os, args) { return COMMANDS['void.list'](os, args); },
  async 'void.list'(os, { flags }) {
    const r = await _wsApi('GET', '/api/void');
    const C = r.creativity, S = r.stability;
    header(`the void — ${r.ideas.length} idea(s)${r.sparks.length ? `, ${r.sparks.length} spark(s)` : ''}`);
    const rows = r.ideas.slice().sort((a, b) => b.glow - a.glow).slice(0, flags.all ? 1000 : 40);
    for (const i of rows) {
      const v = i.void, born = v && v.born ? `${C[v.born.creativity]} · ${S[v.born.stability]}` : 'before the void';
      console.log(`  ${'●'.padStart(1)} ${dim(i.uuid.slice(0, 8))}  ${String(i.text).split('\n')[0].slice(0, 60).padEnd(60)} ${dim(`${born}${i.echoes ? ` · ${i.echoes} echo` : ''}${i.drift > .4 ? ' · fading' : ''}`)}`);
    }
    if (r.ideas.length > rows.length) console.log(dim(`  … ${r.ideas.length - rows.length} more (--all)`));
    console.log('');
  },
  async 'void.add'(os, { positional, flags }) {
    const text = positional.join(' ').trim(); if (!text) die('usage: idearium void add "<your idea>" [--creativity 0-4] [--stability 0-4]');
    const r = await _wsApi('POST', '/api/void/idea', { text, creativity: Number(flags.creativity || 0), stability: Number(flags.stability ?? flags.creativity ?? 0) });
    console.log(`  into the void: ${bold(r.idea.uuid)}`);
  },
  async 'void.echo'(os, { positional, flags }) {
    const id = await _voidId(positional[0]); const kind = flags.kind || 'echo';
    console.log(gray(`  the void is answering — ${kind}…`));
    const body = { kind }; if (flags.creativity != null) body.creativity = Number(flags.creativity); if (flags.stability != null) body.stability = Number(flags.stability);
    const r = await _wsApi('POST', `/api/void/idea/${id}/echo`, body, 330000);
    console.log(`  ${bold(r.echo.voice)}${r.echo.domain ? dim(`  rolled ${r.echo.roll}: ${r.echo.domain}`) : ''}  ${dim(r.echo.uuid)}`);
    for (const l of r.echo.lines) console.log(`    ${l}`);
    console.log(dim(`\n  keep a part, in your words: idearium void take ${r.echo.uuid} "<your words>"\n`));
  },
  async 'void.collide'(os, { positional }) {
    const a = await _voidId(positional[0]), b = await _voidId(positional[1]);
    const r = await _wsApi('POST', '/api/void/collide', { a, b }, 330000);
    for (const l of r.echo.lines) console.log(`    ${l}`);
  },
  async 'void.take'(os, { positional }) {
    const [echo, ...words] = positional; if (!echo || !words.length) die('usage: idearium void take <echo> "<what you keep, in your words>"');
    const r = await _wsApi('POST', `/api/void/echo/${encodeURIComponent(echo)}`, { action: 'take', words: words.join(' ') });
    console.log(`  kept. your idea now:\n${String(r.idea.text).split('\n').map(l => '    ' + l).join('\n')}`);
  },

  // ── idearium workshop (0.39.294 SW1) ─────────────────────────────────────────────
  // James: "need the spec workshop … the workshop and maybe it hooks into the spec field". Through the running idearium
  // (one writer of the sessions and the repos); the agent only proposes — accept puts a proposal into the spec.
  async 'workshop'(os, args) {
    const [sub, ...rest] = args.positional || [];
    const go = (name) => COMMANDS[`workshop.${name}`](os, { ...args, positional: rest });
    if (!sub || sub === 'list') return go('list');
    if (['new', 'show', 'feed', 'accept', 'dismiss', 'save', 'ambition', 'write'].includes(sub)) return go(sub);
    die('usage: idearium workshop [list | new | show <id> | write <id> <section> <text> | ambition <id> <1-5> | feed <id> <kind> | accept <id> <proposal> | dismiss <id> <proposal> | save <id>]');
  },
  async 'workshop.list'() {
    const r = await _wsApi('GET', '/api/workshop');
    if (!r.workshops.length) { console.log(gray('\n  no workshops yet — idearium workshop new --from idea:<uuid> | library:<title> | repo:<uuid> | blank --title "…"\n')); return; }
    header(`spec workshop — ${r.count} session(s)`);
    for (const w of r.workshops) console.log(`  ${bold(w.uuid)}  ${String(w.title).slice(0, 48).padEnd(48)} ${dim(`${w.source.kind} · ${w.sections} sections · ${w.open} open · ${w.specPath ? 'saved ' + w.specPath : 'not saved'}`)}`);
    console.log('');
  },
  async 'workshop.new'(os, { flags }) {
    const f = String(flags.from || 'blank');
    const m = /^(idea|library|repo):(.+)$/.exec(f);
    if (!m && f !== 'blank') die('--from idea:<uuid> | library:<title or sha> | repo:<uuid> | blank');
    const r = await _wsApi('POST', '/api/workshop', { from: m ? { kind: m[1], id: m[2] } : { kind: 'blank' }, title: flags.title || (m ? null : 'Untitled spec'), ambition: flags.ambition ? Number(flags.ambition) : 3 });
    _wsPrint(r.workshop);
  },
  async 'workshop.show'(os, { positional }) { if (!positional[0]) die('usage: idearium workshop show <id>'); _wsPrint((await _wsApi('GET', `/api/workshop/${encodeURIComponent(positional[0])}`)).workshop, true); },
  async 'workshop.write'(os, { positional, flags }) {
    const [id, section, ...text] = positional;
    if (!id || !section) die('usage: idearium workshop write <id> <section id | new> <text…> [--title "…"]');
    const body = section === 'new' ? { sections: [{ add: true, title: flags.title || 'New section', body: text.join(' ') }] } : { sections: [{ id: section, body: text.join(' '), ...(flags.title ? { title: flags.title } : {}) }] };
    _wsPrint((await _wsApi('POST', `/api/workshop/${encodeURIComponent(id)}`, body)).workshop);
  },
  async 'workshop.ambition'(os, { positional }) {
    if (!positional[0] || !positional[1]) die('usage: idearium workshop ambition <id> <1-5>');
    const w = (await _wsApi('POST', `/api/workshop/${encodeURIComponent(positional[0])}`, { ambition: Number(positional[1]) })).workshop;
    console.log(`  ambition ${w.ambition}`);
  },
  async 'workshop.feed'(os, { positional, flags }) {
    const [id, kind] = positional;
    if (!id || !kind) die('usage: idearium workshop feed <id> <open-loops | questions | what-ifs | d20 | reverse-chain | inspiration | section> [--section <id>]');
    console.log(gray(`  asking the agent — ${kind}…`));
    const r = await _wsApi('POST', `/api/workshop/${encodeURIComponent(id)}/feed`, { kind, sectionId: flags.section || null }, 330000);
    if (r.meta && r.meta.domain) console.log(`  d20 rolled ${bold(r.meta.roll)}: ${r.meta.domain} — ${dim(r.meta.mechanism)}`);
    for (const p of r.added) console.log(`  ${bold(p.uuid)}  ${p.text.split('\n').join('\n' + ' '.repeat(26))}`);
    console.log(dim(`\n  accept one: idearium workshop accept ${id} <proposal> [--into <section> | --new "<title>" | --replace]\n`));
  },
  async 'workshop.accept'(os, { positional, flags }) {
    const [id, pid] = positional; if (!id || !pid) die('usage: idearium workshop accept <id> <proposal> [--into <section> | --new "<title>" | --replace]');
    const body = flags.new ? { action: 'accept', mode: 'new', title: String(flags.new) } : { action: 'accept', mode: flags.replace ? 'replace' : 'append', sectionId: flags.into || null };
    const r = await _wsApi('POST', `/api/workshop/${encodeURIComponent(id)}/proposal/${encodeURIComponent(pid)}`, body);
    console.log(`  accepted into ${bold(r.section.title)}`);
  },
  async 'workshop.dismiss'(os, { positional }) {
    const [id, pid] = positional; if (!id || !pid) die('usage: idearium workshop dismiss <id> <proposal>');
    await _wsApi('POST', `/api/workshop/${encodeURIComponent(id)}/proposal/${encodeURIComponent(pid)}`, { action: 'dismiss' });
    console.log('  dismissed');
  },
  async 'workshop.save'(os, { positional }) {
    if (!positional[0]) die('usage: idearium workshop save <id>');
    const r = await _wsApi('POST', `/api/workshop/${encodeURIComponent(positional[0])}/save`, {}, 120000);
    console.log(`  saved to ${bold(r.specPath)} in repo ${bold(r.repoUuid)}${r.madeRepo ? dim(` (${r.madeRepo === 'new' ? 'a new repo' : 'its library document\'s repo'})`) : ''}`);
  },

  // ── idearium spec-library (0.39.290 IL1) ─────────────────────────────────────
  // James: "need a way to import these and convert them." Through the running idearium when it is up (one writer of
  // the ideas); without it, the same import runs here.
  async 'spec-library'(os, args) {
    if ((args.positional || [])[0] === 'import') return COMMANDS['spec-library.import'](os, { ...args, positional: args.positional.slice(1) });
    if ((args.positional || [])[0] === 'to-repo') return COMMANDS['spec-library.to-repo'](os, { ...args, positional: args.positional.slice(1) });
    return COMMANDS['spec-library.list'](os, args);
  },
  async 'spec-library.import'(os, { positional, flags }) {
    const file = positional[0];
    if (!file) die('usage: idearium spec-library import <zip> [--dry-run]');
    const fsm = await import('fs'); const pathm = await import('path');
    if (!fsm.existsSync(file)) die(`not found: ${file}`);
    const buf = fsm.readFileSync(file);
    const dry = !!(flags['dry-run'] || flags.dryRun);
    let r;
    try { r = await _localUpload(`/api/spec-library/import?name=${encodeURIComponent(pathm.basename(file))}${dry ? '&dryRun=1' : ''}`, buf); }
    catch (e) {
      if (!/ECONNREFUSED|timeout/.test(e.message)) die(e.message);
      console.log(gray('  idearium is not running — importing here'));
      const { importLibrary } = await import('../lib/spec-library-import.js');
      const se = await import('../spec-engine/index.js');
      r = await importLibrary({ buf, name: pathm.basename(file), dryRun: dry, se, os });
      if (!r.ok) die(r.error);
      r.added = r.added.map(x => ({ title: x.title, family: x.family, kind: x.kind, dialect: x.dialect, sections: x.sections }));
    }
    header(`spec library — ${dry ? 'dry run' : 'imported'} · ${r.stats.files} files read · ${r.stats.unique} unique · ${r.stats.duplicates} duplicates folded`);
    const by = {}; for (const a of r.added) (by[a.family] = by[a.family] || []).push(a);
    for (const [fam, list] of Object.entries(by)) {
      console.log(`  ${bold(fam)} ${dim(`(${list.length})`)}`);
      for (const a of list.slice(0, 40)) console.log(`    ${a.kind.padEnd(8)} ${String(a.title).slice(0, 70).padEnd(70)} ${dim(a.dialect + (a.sections ? ` · ${a.sections} sections` : ''))}`);
      if (list.length > 40) console.log(dim(`    … ${list.length - 40} more`));
    }
    for (const s of r.skipped || []) console.log(`  ${coral('skipped')} ${s.path} ${dim('— ' + s.why)}`);
    for (const f of r.failed || []) console.log(`  ${coral('failed')}  ${f.title} ${dim('— ' + f.error)}`);
    if ((r.merged || []).length) console.log(dim(`  ${r.merged.length} already in the library gained new paths`));
    if (!r.added.length && !dry) console.log(gray('  nothing new — every document is already in the library'));
    console.log('');
  },
  // §0.39.292 IL2 — James: "how can i import into the pipeline. the specs also need to convert into actual spec files."
  // Through the running idearium only: the repo layer and the ideas have one writer.
  async 'spec-library.to-repo'(os, { positional, flags }) {
    const key = positional.join(' ').trim();
    if (!key) die('usage: idearium spec-library to-repo <title|sha> [--emerge]');
    let res;
    try { res = await _localApi('POST', `/api/spec-library/${encodeURIComponent(key)}/to-repo`, { mode: flags.emerge ? 'emerge' : 'manual' }, flags.emerge ? 600000 : 60000); }
    catch (e) { die(`${e.message}${/ECONNREFUSED/.test(e.message) ? ' — start idearium first (the repo is made by it)' : ''}`); }
    const r = res.data || res;
    header(`${r.title} → ${r.existing ? 'already in the pipeline' : 'in the pipeline'}`);
    console.log(`  repo      ${bold(r.repoUuid)}`);
    if (r.specFile) console.log(`  spec file ${r.specFile}`);
    if (r.original) console.log(`  original  ${r.original}`);
    console.log(dim(`  next: idearium prove ${r.repoUuid}  ·  or open it in Idearium › Build`));
    console.log('');
  },
  async 'spec-library.list'(os, { flags }) {
    const { listLibrary } = await import('../lib/spec-library-import.js');
    const rows = listLibrary({ family: flags.family || null, kind: flags.kind || null });
    if (!rows.length) { console.log(gray('\n  the spec library is empty — idearium spec-library import <zip>\n')); return; }
    header(`spec library — ${rows.length} document(s)`);
    for (const r of rows.sort((a, b) => (a.family + a.title).localeCompare(b.family + b.title)))
      console.log(`  ${r.family.padEnd(9)} ${r.kind.padEnd(8)} ${String(r.title).slice(0, 64).padEnd(64)} ${dim(r.specUuid ? `${r.sections} sections` : r.kind)}${r.repoUuid ? ' ' + dim('→ ' + r.repoUuid) : ''}`);
    console.log('');
  },

  // ── idearium gap ───────────────────────────────────────────────────────────

  async 'gap.list'(os, { flags }) {
    const gaps = os.gaps({ status: flags.status||'open', severity: flags.severity, type: flags.type });
    if (!gaps.length) { console.log(gray(`  no gaps (status=${flags.status||'open'})`)); return; }
    header(`Gaps (${gaps.length})`);
    for (const g of gaps) printGap(g);
    console.log('');
  },

  async 'gap.show'(os, { positional }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium gap show <uuid>');
    const gap = os.db.gaps.find(g=>g.uuid===uuid||g.uuid.startsWith(uuid));
    if (!gap) die(`gap not found: ${uuid}`);
    header(`Gap: ${gap.uuid.slice(0,8)}`);
    printGap(gap);
    console.log('');
  },

  async 'gap.open'(os, { flags }) {
    if (!flags.description) die('--description required');
    os.emit('idearium.gap.open', {
      description: flags.description,
      type: flags.type||'unresolved',
      severity: flags.severity||'medium',
      ideaUuid: flags.idea||null,
      source: 'cli',
    });
    const gap = os.db.gaps[os.db.gaps.length-1];
    console.log(mint(`✓ gap opened: ${short(gap.uuid)}`));
    printGap(gap);
  },

  async 'gap.resolve'(os, { positional, flags }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium gap resolve <uuid> [--resolution "..."]');
    const gap = os.db.gaps.find(g=>g.uuid===uuid||g.uuid.startsWith(uuid));
    if (!gap) die(`gap not found: ${uuid}`);
    os.emit('idearium.gap.resolve', { uuid: gap.uuid, resolution: flags.resolution||'' });
    console.log(mint(`✓ gap resolved: ${short(gap.uuid)}`));
  },

  async 'gap.ignore'(os, { positional, flags }) {
    const uuid = positional[0];
    if (!uuid) die('usage: idearium gap ignore <uuid> [--reason "..."]');
    const gap = os.db.gaps.find(g=>g.uuid===uuid||g.uuid.startsWith(uuid));
    if (!gap) die(`gap not found: ${uuid}`);
    os.emit('idearium.gap.ignore', { uuid: gap.uuid, reason: flags.reason||'' });
    console.log(mint(`✓ gap ignored: ${short(gap.uuid)}`));
  },

  // ── idearium push / vortex ─────────────────────────────────────────────────

  // §SNAPSHOTGATE MERGE 2026-09-01 — now a real network round trip to
  // cortex/versionium (via idearium's commitSnapshot()), not a local,
  // synchronous write. Errors are real now too (cortex unreachable, etc.) —
  // reported, not swallowed.
  async 'push'(os, { flags }) {
    const message = flags.message || 'snapshot';
    const branch  = flags.branch  || 'main';
    const snap = await os.commitSnapshot({ message, branch, author:'cli' });
    if (snap?.error) { die(`push failed: ${snap.error}`); return; }
    console.log(mint(`✓ pushed: ${bold(snap.commitId)}`));
    console.log(`  ${dim('message')} ${snap.message}`);
    console.log(`  ${dim('ideas')}   ${snap.ideasCount}  ${dim('gaps')} ${snap.gapCount}  ${dim('snr')} ${sky(snap.snr)}`);
  },

  async 'log'(os, { flags }) {
    const result = await os.snapshots(parseInt(flags.n)||20);
    if (result?.error) { die(`log failed: ${result.error}`); return; }
    const snaps = result;
    if (!snaps.length) { console.log(gray('  no snapshots yet')); return; }
    header('Vortex Log');
    for (const s of snaps) {
      const snrColor = s.snr > 0.6 ? mint : s.snr > 0.3 ? amber : coral;
      const delta = s.snrDelta > 0 ? mint(`+${s.snrDelta}`) : s.snrDelta < 0 ? coral(`${s.snrDelta}`) : gray('0');
      console.log(`\n  ${bold(sky(s.commitId))}  ${dim(ts(s.ts))}`);
      console.log(`  ${bold(s.message)}`);
      console.log(`  ${dim('snr')} ${snrColor(s.snr)} (${delta})  ${dim('ideas')} ${s.ideasCount}  ${dim('gaps')} ${s.gapCount}`);
      if (s.phaseMap) {
        const phases = Object.entries(s.phaseMap).filter(([,n])=>n>0).map(([p,n])=>`${phaseColor(p)}:${n}`).join('  ');
        if (phases) console.log(`  ${phases}`);
      }
    }
    console.log('');
  },

  async 'status'(os) {
    const st = os.stats();
    header('Idearium Status');
    console.log(`\n  ${dim('version')}  ${sky(st.version)}`);
    console.log(`  ${dim('snr')}      ${st.snr > 0.6 ? mint(st.snr) : st.snr > 0.3 ? amber(st.snr) : coral(st.snr)}  ${dim('window 50 events')}`);
    console.log(`\n  ${dim('ideas')}    ${bold(st.ideasTotal)}`);
    for (const [p,n] of Object.entries(st.phaseMap)) {
      if (n > 0) console.log(`           ${phaseColor(p).padEnd(20)} ${n}`);
    }
    console.log(`\n  ${dim('gaps')}     ${coral(st.openGaps)} open  ${dim(st.totalGaps + ' total')}`);
    console.log(`  ${dim('specs')}    ${st.specs}`);
    console.log(`  ${dim('snapshots')} ${st.snapshots}`);
    console.log(`  ${dim('events')}   ${st.events}`);
    if (st.savedAt) console.log(`\n  ${dim('saved')}    ${gray(ts(st.savedAt))}`);
    console.log('');
  },

  async 'snr'(os) {
    const samples = os.snrHistory(50);
    const snr = os.snr;
    const color = snr > 0.6 ? mint : snr > 0.3 ? amber : coral;
    console.log(`\n  SNR  ${bold(color(snr))}  ${color(bar(snr, 40))}`);
    if (samples.length > 1) {
      const recent = samples.slice(-10).map(s => {
        const c = s.snrValue > 0.6 ? mint : s.snrValue > 0.3 ? amber : coral;
        return c('▪');
      }).join('');
      console.log(`  ${dim('recent')} ${recent}`);
    }
    console.log('');
  },

  async 'events'(os, { flags }) {
    const evts = os.eventLog(parseInt(flags.n)||50);
    if (!evts.length) { console.log(gray('  no events')); return; }
    header(`Event Log (last ${evts.length})`);
    for (const e of evts) {
      const tColor = e.type.includes('error') ? coral : e.type.includes('created') ? mint : e.type.includes('resolved') ? mint : sky;
      const short_t = e.type.replace('idearium.','');
      console.log(`  ${gray(ts(e.ts))}  ${tColor(short_t.padEnd(30))}  ${dim(e.uuid.slice(0,8))}`);
    }
    console.log('');
  },

  // ── manifest (phase 1: file list → registry + wiring, no LLM) ────────────
  // §BUILT 2026-09-25 — logic lives once in spec-engine/manifest/commands.js;
  // this is the idearium door. The pure door (no store loaded, clean JSON):
  //   node idearium/spec-engine/manifest/cli.js check|generate|context …
  async 'manifest.check'(os, a)    { await _manifest('check', a); },
  async 'manifest.generate'(os, a) { await _manifest('generate', a); },
  async 'manifest.context'(os, a)  { await _manifest('context', a); },

  // ── start API server ───────────────────────────────────────────────────────

  async 'start'() {
    console.log(sky(`[Idearium] Starting API server...`));
    const { startAPI } = await import('../api/index.js');
    startAPI();
    // Keep alive
    process.on('SIGINT', () => { console.log(coral('\n[Idearium] Shutting down.')); process.exit(0); });
  },

};

// ─── Dispatch ────────────────────────────────────────────────────────────────

async function main() {
  const argv   = process.argv.slice(2);
  const parsed = parseArgs(argv);
  const [cmd, sub, ...rest] = parsed.positional;

  if (!cmd || cmd === 'help') {
    console.log(`\n${bold(sky('IDEARIUM'))} ${dim(`v${VERSION}`)}\n`);
    console.log(`  ${sky('idea')}   add | list | show | phase | link | tension | archive | search | tree`);
    console.log(`  ${sky('spec')}   new | show | list | check | export`);
    console.log(`  ${sky('speceng')} list | show <uuid> | build <uuid> | chunk-agent <spec> <chunk> <agent>`);
    console.log(`  ${sky('manifest')} check <file> [--warnings] | generate <file> [--out dir] | context <file> <id>`);
    console.log(`  ${sky('repo')}   list [--all] | show <uuid> | archive <uuid> | plan <repo> <spec> [--derive|--dry] | phases <repo> <spec> | build <repo> <spec> [--phase id]`);
    console.log(`  ${sky('void')}   [list] | add "<idea>" [--creativity 0-4 --stability 0-4] | echo <idea> [--kind d20|reverse|ground] | collide <a> <b> | take <echo> "<words>"`);
    console.log(`  ${sky('workshop')} list | new --from idea:<uuid>|library:<title>|repo:<uuid>|blank | show <id> | write <id> <section> <text> | ambition <id> <1-5> | feed <id> <kind> | accept <id> <proposal> | dismiss | save <id>`);
    console.log(`  ${sky('gap')}    list | show | open | resolve | ignore`);
    console.log(`  ${sky('routing')} [show] | plan [--block id] [--agent a] | learned | set <key> <value>`);
    console.log(`  ${sky('push')}   [--message "..."] [--branch main]`);
    console.log(`  ${sky('log')}    [--n 20]`);
    console.log(`  ${sky('status')}`);
    console.log(`  ${sky('snr')}`);
    console.log(`  ${sky('events')} [--n 50]`);
    console.log(`  ${sky('start')}  — start HTTP API on :4800\n`);
    process.exit(0);
  }

  // Build key: cmd alone or cmd.sub
  const key = sub ? `${cmd}.${sub}` : cmd;
  const handler = COMMANDS[key];

  if (!handler) die(`unknown command: ${key}\nRun: idearium help`);

  const os       = cmd === 'manifest' ? null : getIdeaOS(); // manifest is pure — no store needed
  const argParsed = parseArgs(sub ? rest : parsed.positional.slice(1));
  // For sub-commands, positional[0] is the first arg after the sub command
  const finalArgs = {
    positional: sub ? rest.filter(a=>!a.startsWith('--')) : argParsed.positional,
    flags:      parsed.flags,
  };

  try {
    await handler(os, finalArgs);
  } catch (e) {
    die(e.message);
  }
}

main();
