'use strict';
/**
 * loom/scanners/phasemap-map.js — the PHASEMAP layer of loom's self-model
 * comp_id: nexus.loom.scanners.phasemap-map
 * UUID: nexus-loom-scanner-phasemap-v1-0000-2026-0808-001
 *
 * James: "consolidate all the phasemaps, split them by system, add it as an
 * entire section in loom."
 *
 * loom already knows what the system IS:
 *   capability-map — what it can do (served routes)
 *   spec-map       — what it's supposed to be (specs)
 * This adds what the system is BECOMING:
 *   phasemap-map   — the roadmap (docs/*phasemap*.spec), split by system.
 *
 * Reads every phasemap spec, extracts each phase (id, title, done/pending,
 * depends_on), and tags it with the SYSTEM it concerns (parsed from the phase
 * body + reuse lines). So "what is cortex becoming / what's left for guardian"
 * is answerable from loom. §8.6 mirrors the spec-map scanner pattern.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
// §TESTABILITY 2026-09-19 — overridable so the status parser can be tested
// against real fixture phasemaps on disk rather than only against the live
// tree, whose contents change every session. The default is unchanged, so
// no real caller is affected.
const DOCS = process.env.NEXUS_PHASEMAP_DIR || path.join(ROOT, 'docs');

// §0.39.314 SY1 — James: "There is only 15 systems. Not 27. Any system that's in idearium is a system, nothing more."
// This file kept its own 27-entry SYSTEMS list (agent, chunk, raid, gemini, tablet, bridge, cos, warp, emergence,
// economy, nexstore, …: tags, not systems). The one list is Idearium's, lib/nexus-self/systems.js; every tag a phase
// carries — declared or guessed — resolves to one of its 15 through systemFor(): a system's name is itself, a known
// alias goes to its owner, any other tag to the system that owns that directory (lib, cos, warp, docs → core). The tag
// as written is kept on the phase (`tags`). Superseded: EV0 (4)'s list growth (2026-10-02, emerge map addendum).
const NS = require('../../lib/nexus-self/systems.js');
// The words that name a system in prose: each system's name, its loom aliases, its directories. 'core' and
// 'components' are left out of the GUESS — the words are everywhere in prose; core is the fallback, components is
// declared only. 'general' (core's old catch-all tag) is not a word to look for.
const TERMS = (() => {
  const out = new Set();
  for (const s of NS.SYSTEMS) for (const t of [s.name, ...(s.loom || []), ...(s.dirs || [])]) if (t && !['core', 'components', 'general'].includes(t)) out.add(t);
  return [...out];
})();
const SYSTEMS = NS.names();   // the 15, exported for readers that list them

// §FIXED 2026-09-20 (MCO-E) — was /[A-Z]{1,3}\d+_.../, which cannot match a
// hyphenated id like `MCO-A_schemas`, so the overhaul phasemaps' own phases
// MCO-A..MCO-G were invisible to loom's roadmap (and therefore to anything
// built on it). Measured across all phasemap specs in docs/ before changing:
// 529 phases matched before, 543 after; the 14 added are exactly the MCO-A..G
// phases of the two overhaul phasemaps and nothing else. The underscore is still
// load-bearing (the drift-dict guard above): bare `MCO-A:` does not match.
const PHASE_RE = /^\s{2,6}([A-Z]{1,3}(?:\d+|-[A-Z0-9]+)_[A-Za-z0-9_]*):(.*)$/;   // P1_, AP1_, RR1_, SS0_, LP1_, MCO-A_ — the underscore is load-bearing
const PHASEMAP_FILE_RES = [/phase-?map.*\.spec$/, /phase-map\.spec$/];
/** isPhasemapFile(basename) — the one definition of "this file is a phasemap". */
function isPhasemapFile(name) { return PHASEMAP_FILE_RES.some(re => re.test(name)); }
// §BUGFIX 2026-08-08 — same investigation as the _tagSystem fix above. The
// prior regex (`[A-Za-z0-9_]*` — zero-or-more, no underscore required)
// matched copilot-awareness-routing-phasemap.spec's drift_watch dict (bare
// `CA5:`, `CA6:`, `CA7:` entries describing what KIND of drift to watch for,
// not phases) as if they were pending phases, alongside the REAL
// `CA5_intent_routing` etc. a few lines below — inflating every roadmap
// query with fake pending entries. Checked across all 16 phasemap files
// before tightening: every genuine phase declaration has an underscore
// suffix; the drift dict was the only bare match anywhere in the corpus.

function _phasemapFiles() {
  let out = [];
  try {
    for (const f of fs.readdirSync(DOCS)) {
      if (isPhasemapFile(f)) out.push(path.join(DOCS, f));
    }
  } catch (_) {}
  return out;
}

function _tagSystem(text) {
  // §BUGFIX 2026-08-08 — found while answering "show me every phase left for
  // co-pilot": 'copilot' never matched because this codebase spells it
  // "co-pilot" everywhere in prose (only the file/namespace form is
  // unhyphenated). CA7_constant_autonomy's own does: line says "co-pilot
  // runs CONSTANTLY" and was silently tagged cortex/raid/intelligence/agent
  // instead — a real, done phase invisible to its own system's roadmap.
  // Strip hyphens from both sides of the match so "co-pilot" and "copilot"
  // (and any other system name someone hyphenates in prose) match the same.
  const low = text.toLowerCase().replace(/-/g, '');
  const hits = TERMS.filter(t => low.includes(t.replace(/-/g, '')));
  return hits.length ? [...new Set(hits.map(NS.systemFor))] : ['core'];   // §0.39.314 SY1 — one of the 15; nothing named → core
}

/**
 * _systemsOf(fields, body) → { systems, systemsFrom } — §EV0 (4), invariant E16 ("Declared, not guessed"): a phase's
 * own `systems:` line is read first and taken as written; only a phase without one is guessed from its prose, and the
 * guess is marked as one (systemsFrom: 'guessed'), so a reader can tell what the map said from what loom inferred.
 */
function _systemsOf(fields, body) {
  const declared = _list(fields && fields.systems).map(x => x.toLowerCase());
  // §0.39.314 SY1 — declared tags resolve to the 15; the tags as written are kept for provenance
  if (declared.length) return { systems: [...new Set(declared.map(NS.systemFor))], tags: [...new Set(declared)], systemsFrom: 'declared' };
  const guessed = _tagSystem(body);
  return { systems: guessed, tags: guessed, systemsFrom: 'guessed' };
}

/**
 * parsePhasemapText(text, mapName) — the phases of ONE phasemap's text, exactly
 * as loadAll() reads them (same header regex, same status/depends_on rules).
 * §MCO-E 2026-09-20 — loadAll()'s per-line loop, extracted UNCHANGED so a caller
 * that has the text of a phasemap somewhere other than docs/ (an idearium repo's
 * own roadmap) uses the same parser rather than a second one that could drift.
 */
function parsePhasemapText(text, name) {
  const lines = String(text).split('\n');
  const out = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(PHASE_RE);
      if (!m) continue;
      const id = m[1];
      const rest = m[2] || '';
      // §FIXED 2026-09-19 (same pass as the two inversions below) — `near`
      // was a fixed [rest, i+1, i+2] window, so a phase whose `status:` key
      // sits on its THIRD line or later had its status read from lines that
      // do not contain it. Found live: MCO1_graph_layer, written
      //     MCO1_graph_layer:
      //       depends_on: [MCO0]
      //       status: >
      //         DONE 2026-09-19 ...
      // reported 'pending' with the word DONE sitting right there, because
      // `status:` is line 3 and the value line 4. This is the SAME fixed-
      // window fragility the 2026-08-23 bugfix below already found and fixed
      // for depends_on — it was simply never applied to the status read.
      // Real fix, same shape as that one: find the phase's ACTUAL boundary
      // first, locate its REAL status: key inside that, and read the value
      // from there (including a block scalar, whose value begins on the
      // following line) rather than from an arbitrary offset.
      let bodyEnd = i + 1;
      while (bodyEnd < lines.length && bodyEnd < i + 60 && !PHASE_RE.test(lines[bodyEnd])) bodyEnd++;
      const phaseLines = lines.slice(i, bodyEnd);
      const sIdx = phaseLines.findIndex(l => /^\s+status:/.test(l));
      const near = sIdx === -1
        ? [rest, lines[i + 1] || '', lines[i + 2] || ''].join(' ')   // no status: key — fall back
        : phaseLines.slice(sIdx, sIdx + 4).join(' ');
      // §FIXED 2026-09-19 — TWO measured inversions, both of which pointed
      // the wrong way for deciding what to work on. Counted across all 528
      // real phases in docs/*phasemap*.spec before touching this:
      //
      //   23 phases whose status LITERALLY READS "NOT STARTED" were
      //      reported 'in-progress', because /STARTED/i matches inside
      //      "NOT STARTED". Unstarted work looked started, so it gets
      //      skipped.
      //    8 phases whose status value BEGINS with a bare "DONE" (the
      //      ordinary convention in these files — `status: "DONE
      //      2026-09-15."`) were reported 'pending', because the 2026-08-13
      //      fix below only accepts DONE when a glyph or # precedes it.
      //      Finished work looked pending, so it gets redone.
      //
      // Found live this session: this scanner reported MCO1_graph_layer as
      // 'in-progress' while the file it was reading said "NOT STARTED".
      // The status VOCABULARY was then counted rather than guessed at —
      // DONE(10), NOT(23), OPEN(10), ✓(4), PARTIAL(3), DRAFT(3) — and only
      // the two genuinely broken cases are changed here. OPEN/DRAFT already
      // fall through to pending correctly and are left alone (§16.4 — no
      // generalizing past what was measured).
      //
      // §FIXED 2026-08-13 — this test was /←\s*DONE|COMPLETE|✓\s*DONE/i:
      // case-INSENSITIVE and unanchored, so the ordinary word "complete" or
      // "completely" appearing anywhere in a phase's first three lines marked
      // that phase DONE. Found the moment three genuinely-pending phases were
      // added whose `why:` quoted the instruction "completely break down and
      // rebuild" — all three reported as shipped. A status parser that reads
      // prose as a completion marker will mark pending work done and nobody
      // will see it (§1.2). Real markers in these files are uppercase and
      // carry a glyph or a comment prefix, so match them case-SENSITIVELY as
      // markers rather than as words. That reasoning still holds and is why
      // the DONE case added above is anchored to the START of the status
      // VALUE rather than allowed to match DONE anywhere in prose.
      const status =
        // "NOT STARTED" is pending, and must be tested before STARTED.
        /\bNOT STARTED\b/i.test(near) ? 'pending'
        : /←\s*DONE\b|✓\s*DONE\b|#\s*DONE\b|\bCOMPLETE\b/.test(near) ? 'done'
        // a status value that OPENS with DONE — `status: "DONE ..."`,
        // `status: >` then DONE — not the word DONE loose in prose.
        : /status:\s*[>|]?-?\s*["']?\s*DONE\b/.test(near) ? 'done'
        : /IN PROGRESS|STARTED|\bpartial\b/i.test(near) ? 'in-progress'
        : 'pending';

      // gather the phase's REAL full body for system tagging + depends_on —
      // §BUGFIX 2026-08-23, found while asking "what's next" against a
      // real phasemap whose status: blocks run well past 8 lines (this
      // session's own evidence-heavy documentation style, not unusual
      // prose): a fixed lines.slice(i, i+8) window silently truncated
      // BEFORE reaching a real depends_on: line that existed at line 13,
      // reporting a real, written dependency as if it were absent —
      // "what's next" would have recommended a phase whose own real
      // prerequisite hadn't actually finished. Real fix: scan forward to
      // the ACTUAL next phase header (or end of file), not an arbitrary
      // line count — matches how a person reading the file would find
      // the real boundary. Capped at 60 lines as an honest safety limit
      // (a single phase entry this long is itself worth a real look, not
      // silently unbounded scanning) rather than removed entirely.
      // bodyEnd is computed above, where the status read now also needs it —
      // one boundary calculation, not two that could drift apart (§10.3).
      const body = phaseLines.join(' ');
      // §FIXED 2026-08-13 — the regex below stops at a newline ([^\]\n]+),
      // which was correct, but `body` above joins with a SPACE, so there were
      // no newlines left to stop at and the match ran on greedily through the
      // rest of the phase body. Measured on the real tree: the longest
      // dependsOn was 566 characters of swallowed `does:`/`reuse:` YAML. The
      // dependency graph this feeds was reading whole paragraphs as dependency
      // names. Match against a newline-preserving join; `body` keeps its
      // space-join because _tagSystem() genuinely wants one flat string.
      const bodyLines = phaseLines.join('\n');
      const dep = (bodyLines.match(/depends_on:\s*\[?([^\]\n]+)/) || [])[1] || '';
      // §0.39.271 P1 — the fields a phases manager shows. Read at the phase's own
      // field indent only (a nested `closes:` inside a `does:` block is not the phase's).
      const f = _fields(phaseLines.slice(1), _indent(lines[i]) + 2);
      const sys = _systemsOf(f, body);
      out.push({
        id, map: name,
        title: id.replace(/_/g, ' '),
        status,
        systems: sys.systems, tags: sys.tags, systemsFrom: sys.systemsFrom,
        dependsOn: dep.trim().replace(/[\[\]]/g, '') || null,
        // location, for callers that EDIT a phase (idearium/repo/roadmap.js):
        // header line, the `status:` key's line (-1 if it has none) and the
        // first line of the next phase. Not part of loadAll()'s output.
        line: i, statusLine: sIdx === -1 ? -1 : i + sIdx, bodyEnd,
        name: f.name || f.does || null, closes: _list(f.closes), files: _list(f.files), blocks: _blocks(f), form: 'key',
      });
    }
  // §0.39.271 P1 — the LIST form. Since 0.39.260 phasemaps are also written as
  //     phases:
  //       - id: T1
  //         name: tar disk
  //         status: built
  //         depends_on: [T3]
  // and none of those phases were visible to loom's roadmap or Idearium's Roadmap
  // tab (PHASE_RE needs `  X1_slug:`). Same output shape; key-form ids win if a file
  // somehow has both. Status: the same markers as above first, then the plain words
  // these files use (built / built-before-mapped / done → done; active / building /
  // in progress / partial → in-progress; anything else → pending).
  // Only entries of a `phases:` list are phases — an `- id:` in any other list (a
  // drift log's `entries:`, a registry) is not. Found on the real tree: SESSION1, an
  // `entries:` row of the observability map, read as a phase and given a status.
  const inPhases = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*phases:\s*$/.test(lines[i])) continue;
    const at = _indent(lines[i]);
    for (let k = i + 1; k < lines.length; k++) {
      if (lines[k].trim() !== '' && _indent(lines[k]) <= at) break;
      inPhases[k] = true;
    }
  }
  const seen = new Set(out.map(p => p.id));
  for (let i = 0; i < lines.length; i++) {
    const m = inPhases[i] && lines[i].match(LIST_ID_RE);
    if (!m) continue;
    const id = m[2].replace(/^["']|["']$/g, '');
    if (seen.has(id)) continue;
    const ind = m[1].length;
    let bodyEnd = i + 1;
    while (bodyEnd < lines.length && bodyEnd < i + 80) {
      const l = lines[bodyEnd];
      if (l.trim() !== '' && _indent(l) <= ind) break;
      bodyEnd++;
    }
    const phaseLines = lines.slice(i, bodyEnd);
    const f = _fields(phaseLines.slice(1), ind + 2);
    const sIdx = phaseLines.findIndex((l, k) => k > 0 && _indent(l) === ind + 2 && /^\s*status:/.test(l));
    const sv = sIdx === -1 ? '' : phaseLines.slice(sIdx, sIdx + 4).join(' ');
    const word = String(f.status || '').trim().replace(/^["']/, '').toLowerCase();
    const status = /\bNOT STARTED\b/i.test(sv) ? 'pending'
      : /←\s*DONE\b|✓\s*DONE\b|#\s*DONE\b|\bCOMPLETE\b/.test(sv) ? 'done'
      : /status:\s*[>|]?-?\s*["']?\s*DONE\b/.test(sv) ? 'done'
      : /^(built|done|complete|completed|shipped|closed)\b/.test(word) ? 'done'
      : /IN PROGRESS/.test(sv) || /^(active|building|in[- ]progress|partial|started|wip)\b/.test(word) ? 'in-progress'
      : 'pending';
    const deps = _list(f.depends_on);
    out.push({
      id, map: name,
      title: f.name ? `${id} ${String(f.name).replace(/\s+/g, ' ').trim()}` : id,
      status,
      ...(() => { const sys = _systemsOf(f, phaseLines.join(' ')); return { systems: sys.systems, tags: sys.tags, systemsFrom: sys.systemsFrom }; })(),
      dependsOn: deps.length ? deps.join(', ') : null,
      line: i, statusLine: sIdx === -1 ? -1 : i + sIdx, bodyEnd,
      name: f.name || null, closes: _list(f.closes), files: _list(f.files), blocks: _blocks(f), form: 'list',
    });
    seen.add(id);
  }
  return out;
}

// ── §0.39.271 P1 helpers ────────────────────────────────────────────────────
const LIST_ID_RE = /^(\s*)-\s+id:\s*(\S+)\s*$/;
function _indent(l) { return (/^(\s*)/.exec(l) || ['', ''])[1].length; }
/** _fields(lines, at) — the `key: value` fields at exactly indent `at`; a value runs
 *  over the lines indented deeper than its key (block scalars and wrapped flow lists). */
function _fields(lines, at) {
  const out = {};
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (_indent(l) !== at) continue;
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const parts = [m[2].replace(/^[>|][-+]?\s*$/, '')];
    let e = k + 1;
    while (e < lines.length && (lines[e].trim() === '' || _indent(lines[e]) > at)) { parts.push(lines[e].trim()); e++; }
    const v = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!(m[1] in out)) out[m[1]] = v;
    k = e - 1;
  }
  return out;
}
// §RS9 0.49.0 — the spec blocks a phase was planned from (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec): its
// `blocks:` (block ids, lib/spec-document.js), else the derived map's `sections:`. [] = no link to its spec.
function _blocks(f) { return _list(f.blocks != null ? f.blocks : f.sections).map(x => String(x).replace(/^['"]|['"]$/g, '')).filter(Boolean); }
/** _list("[A, B]" | "A, B" | "- A - B") -> ['A','B'] (empty for nothing). */
function _list(v) {
  if (v == null) return [];
  let raw = String(v).trim();
  // §FIXED 2026-09-28 — a flow list ends at its own `]`; what follows is a YAML comment, not another
  // item. `depends_on: [S3, C1]  # why` was read as the items `S3` and `C1] # why`, so the edge to C1
  // was lost and the phase could read as ready while C1 was still open (staging-self-heal S4). A block
  // or bare list has no `]`, so only a ` # …` tail is cut there.
  if (raw.startsWith('[')) { const close = raw.indexOf(']'); if (close !== -1) raw = raw.slice(0, close + 1); }
  else raw = raw.replace(/\s+#.*$/, '');
  const s = raw.replace(/^\[|\]$/g, '');
  if (!s) return [];
  const items = s.startsWith('- ') ? s.split(/\s+-\s+/).map(x => x.replace(/^-\s*/, '')) : s.split(',');
  return items.map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

/**
 * loadAll() — every phase across every phasemap, tagged + status'd.
 * @returns { phases:[{id,title,map,status,systems,dependsOn}], maps, bySystem }
 */
function loadAll() {
  const phases = [];
  const maps = [];
  for (const file of _phasemapFiles()) {
    const name = path.basename(file, '.spec');
    maps.push(name);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const p of parsePhasemapText(text, name)) {
      phases.push({ id: p.id, map: p.map, title: p.title, status: p.status, systems: p.systems, tags: p.tags, systemsFrom: p.systemsFrom, dependsOn: p.dependsOn });
    }
  }
  // group by system (LP2 — split by system).
  const bySystem = {};
  for (const p of phases) for (const s of p.systems) (bySystem[s] = bySystem[s] || []).push({ id: p.id, map: p.map, status: p.status });
  return { phases, maps, bySystem, total: phases.length };
}

/**
 * forSystem(system) — the roadmap for one system: what's done, what's pending.
 */
function forSystem(system) {
  const all = loadAll();
  // §0.39.314 SY1 — a tag is answered for its system (forSystem('raid') is cortex's roadmap); a name that is neither a
  // system nor a tag of one answers empty rather than core's, so a typo never reads as a roadmap
  const known = NS.names().includes(String(system).toLowerCase()) || NS.SYSTEMS.some(s => (s.loom || []).includes(String(system).toLowerCase()));
  const sys = known ? NS.systemFor(system) : String(system);
  const list = all.bySystem[sys] || [];
  return {
    system: sys, asked: system,
    total: list.length,
    done: list.filter(p => p.status === 'done').length,
    pending: list.filter(p => p.status === 'pending').length,
    phases: list,
  };
}

/**
 * summary() — the whole roadmap at a glance (for the loom section UI/API).
 */
function summary() {
  const all = loadAll();
  const done = all.phases.filter(p => p.status === 'done').length;
  const inprog = all.phases.filter(p => p.status === 'in-progress').length;
  return {
    maps: all.maps.length,
    phases: all.total,
    done, inProgress: inprog, pending: all.total - done - inprog,
    systems: Object.keys(all.bySystem).length,
    text: `${all.total} phases across ${all.maps.length} phasemaps, ${Object.keys(all.bySystem).length} systems: ${done} done, ${inprog} in progress, ${all.total - done - inprog} pending.`,
  };
}

/**
 * persistHistory(opts) — R0 (docs/repair-contract-and-loom-hub-phasemap.spec).
 * James: "loom should already have a phasemap system? i want all this
 * logged into loom, maybe using cortex to log the phase maps."
 *
 * loadAll() is a live file scan — real, but stateless: no record of WHEN a
 * phase actually flipped pending->done, nothing queryable about what the
 * phasemap said yesterday. This writes a real, append-only row to cortex's
 * phasemap_history table, but ONLY for phases whose status actually
 * CHANGED since the last recorded snapshot — a diff, not a re-dump of
 * everything on every call, same discipline gap-field's dedup already
 * established (reused, not reinvented, per this phase's own gate).
 *
 * Each transition row also carries the version that holds it, where one can
 * be found (James: "utilizes the git commit history?"). §0.39.263 — James:
 * "loom depends on the .git i want versionium to hold the history for each
 * repo." The version is no longer a git commit: it is the VERSIONIUM commit
 * whose copy of the owning .spec file has exactly the bytes on disk now
 * (GET /api/versionium/files/versions — the nexus repos commit every system's
 * files to versionium on each sync). No .git is read. Best-effort: a phase
 * changed by an edit versionium has not recorded yet still gets logged, with
 * versionCommit null and the reason (§1.2 — a missing correlation is stated,
 * not hidden behind a fabricated one).
 *
 * persistHistory() is async (it asks versionium over the API, never by reading
 * versionium's files): await it for { ok, written, total }.
 */
const TABLE = 'phasemap_history';
function _jaa() { try { return require('../../cortex/memory/jaa-db').jaaDB; } catch (_) { return null; } }
// the version of one .spec file: the newest versionium commit whose copy has these exact bytes
async function _versionFor(specFile, { client } = {}) {
  const full = path.join(DOCS, specFile + '.spec');
  let sha;
  try { sha = require('crypto').createHash('sha256').update(fs.readFileSync(full)).digest('hex'); }
  catch (e) { return { versionCommit: null, versionReason: `spec not readable: ${e.code || e.message}` }; }
  const rel = path.relative(ROOT, full).split(path.sep).join('/');
  let r;
  try { r = await (client || require('../../lib/nexus-client')).get('versionium', `/api/versionium/files/versions?path=${encodeURIComponent(rel)}`, { timeout: 4000 }); }
  catch (e) { return { versionCommit: null, versionReason: `versionium unreachable: ${String(e.message).slice(0, 120)}` }; }
  const hit = (r && r.versions || []).find(v => v.sha256 === sha);
  if (!hit) return { versionCommit: null, versionReason: (r && r.versions || []).length ? 'this content is not recorded in versionium yet' : 'versionium holds no version of this file yet' };
  return { versionCommit: hit.commitId, versionRepository: hit.repository, versionAt: hit.wall || null };
}

let _persisting = null;   // single flight: two overlapping calls must not both write the same transition
function persistHistory(opts = {}) {
  if (_persisting) return _persisting;
  _persisting = _persistHistory(opts).finally(() => { _persisting = null; });
  return _persisting;
}
async function _persistHistory(opts = {}) {
  // one versionium question per .spec file per run (a map holds many phases); once
  // versionium is unreachable, every later file gets the same stated reason, not a timeout each
  const vcache = new Map(); let down = null;
  const versionOf = async (map) => {
    if (down) return { versionCommit: null, versionReason: down };
    if (!vcache.has(map)) {
      const v = await _versionFor(map, { client: opts.client });
      if (/^versionium unreachable/.test(v.versionReason || '')) down = v.versionReason;
      vcache.set(map, v);
    }
    return vcache.get(map);
  };
  const jaa = opts.jaa || _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable' };

  const current = loadAll();
  const currentByKey = new Map(current.phases.map(p => [`${p.map}::${p.id}`, p]));

  let lastByKey = new Map();
  try {
    const rows = jaa.query(TABLE, () => true, 100000) || [];
    // most recent row per (map,phaseId) — the last known status before this scan
    const sorted = rows.slice().sort((a, b) => (a.recordedAt || 0) - (b.recordedAt || 0));
    for (const r of sorted) lastByKey.set(`${r.map}::${r.phaseId}`, r.status);
  } catch (_) { /* first run — nothing to diff against, every phase is a new record */ }

  let written = 0;
  for (const [key, p] of currentByKey) {
    const priorStatus = lastByKey.get(key);
    if (priorStatus === p.status) continue;   // no change — nothing to log
    try {
      // §BUGFIX 2026-08-12 — `id` was the row's field name for the phase's
      // own identifier, but jaaDB's store treats `id` as ITS OWN reserved
      // primary key (seen elsewhere tonight: a settings row's `id` becomes
      // its own dedup key). Many phasemaps reuse generic phase-ids like
      // P5/P6 across DIFFERENT files (raid-warp-verification-phasemap and
      // raid-verification-spine-phasemap both have a P6) — every insert
      // was silently colliding on bare `id` and overwriting a DIFFERENT
      // phase's row, regardless of `map`. Found live: two real phases kept
      // re-appearing as "changed" on every call because their writes never
      // actually landed. Renamed to `phaseId`, verified fixed below before
      // this shipped, not assumed fixed from reading the diff.
      jaa.insert(TABLE, {
        map: p.map, phaseId: p.id, title: p.title,
        status: p.status, priorStatus: priorStatus || null,
        systems: p.systems, dependsOn: p.dependsOn || null,
        ...(await versionOf(p.map)),   // 0.39.263 — versionium, not git
        recordedAt: Date.now(),
      });
      written++;
    } catch (_) { /* §1.2 — one bad row must not stop the rest of the diff */ }
  }
  return { ok: true, checked: currentByKey.size, changed: written };
}

/** historyFor(map, id, opts) — every recorded transition for one phase, oldest first. */
function historyFor(map, id, opts = {}) {
  const jaa = opts.jaa || _jaa();
  if (!jaa) return [];
  try {
    return (jaa.query(TABLE, r => r.map === map && r.phaseId === id, 1000) || [])
      .sort((a, b) => (a.recordedAt || 0) - (b.recordedAt || 0));
  } catch (_) { return []; }
}

module.exports = { loadAll, parsePhasemapText, isPhasemapFile, forSystem, summary, persistHistory, _versionFor, historyFor, TABLE, MODULE_ID: 'loom-phasemap-map', VERSION: '1.0.0' };
