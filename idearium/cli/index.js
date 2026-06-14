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
 *   idearium push [--message "..."] [--branch main]
 *   idearium log [--n 20]
 *   idearium status
 *   idearium snr
 *   idearium events [--n 50]
 *   idearium start  — start HTTP API server
 */

import { getIdeaOS, VERSION, IDEA_PHASES } from '../core/index.js';

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

  async 'push'(os, { flags }) {
    const message = flags.message || 'snapshot';
    const branch  = flags.branch  || 'main';
    os.emit('idearium.snapshot.commit', { message, branch, author:'cli' });
    const snap = os.snapshots()[0];
    console.log(mint(`✓ pushed: ${bold(snap.commitId)}`));
    console.log(`  ${dim('message')} ${snap.message}`);
    console.log(`  ${dim('ideas')}   ${snap.ideasCount}  ${dim('gaps')} ${snap.gapCount}  ${dim('snr')} ${sky(snap.snr)}`);
  },

  async 'log'(os, { flags }) {
    const snaps = os.snapshots().slice(0, parseInt(flags.n)||20);
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
    console.log(`  ${sky('gap')}    list | show | open | resolve | ignore`);
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

  const os       = getIdeaOS();
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
