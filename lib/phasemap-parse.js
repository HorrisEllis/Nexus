'use strict';
/**
 * lib/phasemap-parse.js — the phasemap parser: a phasemap's text in, its phases out (no disk, no store)
 * comp_id: nexus.lib.phasemap-parse
 *
 * 0.60.242 SV0 — moved here verbatim from loom/scanners/phasemap-map.js. Core's phase DAG (lib/phase-dag.js) and Idearium's roadmap
 * import (idearium/repo/roadmap-import.js) used only this parser, and reached into loom's folder for it: two crossings the ratchet had
 * flagged since 0.60.170 and 0.60.199, never designed out. A parser several systems need is a primitive, and primitives are core's
 * (DB0a). James, 2026-10-24: "i want to get each system soveriegn and inside a cos compartment".
 * loom's scanner re-exports it unchanged, so every caller of loom's parsePhasemapText keeps working.
 */
// §0.39.314 SY1 — James: "There is only 15 systems. Not 27. Any system that's in idearium is a system, nothing more."
// This file kept its own 27-entry SYSTEMS list (agent, chunk, raid, gemini, tablet, bridge, cos, warp, emergence,
// economy, nexstore, …: tags, not systems). The one list is Idearium's, lib/nexus-self/systems.js; every tag a phase
// carries — declared or guessed — resolves to one of its 15 through systemFor(): a system's name is itself, a known
// alias goes to its owner, any other tag to the system that owns that directory (lib, cos, warp, docs → core). The tag
// as written is kept on the phase (`tags`). Superseded: EV0 (4)'s list growth (2026-10-02, emerge map addendum).
const NS = require('./nexus-self/systems.js');
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
// 0.60.188 CNS1 — up to five capitals and a letter after the digit: COSA1_… (8 phases of the cos-app map) and MR3b_… were silently not
// phases (§1.2) because the prefix stopped at three letters and the number at its digits. The census found them.
const PHASE_RE = /^\s{2,6}([A-Z]{1,5}(?:\d+[a-z]?|-[A-Z0-9]+)_[A-Za-z0-9_]*):(.*)$/;   // P1_, AP1_, RR1_, SS0_, LP1_, MCO-A_, COSA1_, MR3b_ — the underscore is load-bearing
const PHASEMAP_FILE_RES = [/phase-?map.*\.spec$/, /phase-map\.spec$/];
/** isPhasemapFile(basename) — the one definition of "this file is a phasemap". */
function isPhasemapFile(name) { return PHASEMAP_FILE_RES.some(re => re.test(name)); }

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
  // §0.60.64 PT2 — James: "phases tags by system/nested repo". A phase is also tagged with the system (nested repo) that
  // owns each file it names (lib/nexus-self/systems.js ownerOf — the one owner of every path), so a phase that edits
  // guardian/ shows in guardian's repo even when its `systems:` line forgot it. Files are evidence, not a guess.
  const owners = [...new Set(_list(fields && fields.files).map(f => String(f).replace(/\s*\(new\)\s*$/, '').trim())
    .filter(f => /[\/.]/.test(f) && !/[*\s]/.test(f)).map(NS.ownerOf))];
  // §0.39.314 SY1 — declared tags resolve to the 15; the tags as written are kept for provenance
  if (declared.length) {
    const sys = [...new Set(declared.map(NS.systemFor))];
    const added = owners.filter(o => !sys.includes(o));
    return { systems: [...sys, ...added], tags: [...new Set([...declared, ...added])], systemsFrom: added.length ? 'declared+files' : 'declared', ...(added.length ? { systemsFromFiles: added } : {}) };
  }
  if (owners.length) return { systems: owners, tags: owners, systemsFrom: 'files' };
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
  // §CV6 0.60.82 — an entry under a top-level `open_decisions:` / `decisions:` block is a DECISION, not a phase (the
  // code-tab map's CE0 and CV0 were listed as pending phases). Still returned (no count changes), marked kind: 'decision';
  // a decision whose status reads DECIDED is done.
  let section = null;
    for (let i = 0; i < lines.length; i++) {
      // 0.60.188 — a map nested under `spec:` keeps its blocks at indent 2 (`  decisions:`, `  phases:`); a lowercase key there is a section too
      const top = lines[i].match(/^([A-Za-z_][\w-]*):/) || lines[i].match(/^ {2}([a-z_][\w-]*):\s*$/); if (top) section = top[1];
      const m = lines[i].match(PHASE_RE);
      if (!m) continue;
      // §0.60.227 SL3 — measured: decisions also sit under decisions_needed:, decisions_recorded:, open_decision:, his_decisions:,
      // decisions_added:, decisions_applied_by_default_his_to_change: (12 entries) and were offered as buildable phases. Any section
      // whose name says decision holds decisions.
      const isDecision = !!section && /decision/.test(section);
      // §0.60.225 NF1 — an entry under `root_findings:` is a FINDING the phases cite, not a phase (the 09-05 map says so: "Not
      // phases"). RF2 was offered as a phase and sent to Gemini, which had nothing to build and wrote a spec instead. Still
      // returned (no count changes), marked kind: 'finding'; the build refuses it (idearium _phaseBuild NOT_A_PHASE).
      const isFinding = section === 'root_findings';
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
      // §0.60.227 SL3 — the status VALUE only: its key line and the lines indented under it (a block scalar). A fixed 4-line window
      // read a sibling key as part of it: MCO4's `status_before: "NOT STARTED"` sat right under `status:`, so the 'active' the build
      // writes read back as pending and the writer refused it (ROUNDTRIP_FAILED; test-moce-roadmap, red on main).
      let sEnd = sIdx + 1;
      if (sIdx !== -1) { const si = _indent(phaseLines[sIdx]); while (sEnd < phaseLines.length && sEnd < sIdx + 12 && (!phaseLines[sEnd].trim() || _indent(phaseLines[sEnd]) > si)) sEnd++; }
      const near = sIdx === -1
        ? [rest, lines[i + 1] || '', lines[i + 2] || ''].join(' ')   // no status: key — fall back
        : phaseLines.slice(sIdx, sEnd).join(' ');
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
      let status =
        // "NOT STARTED" is pending, and must be tested before STARTED.
        /\bNOT STARTED\b/i.test(near) ? 'pending'
        : /←\s*DONE\b|✓\s*DONE\b|#\s*DONE\b|\bCOMPLETE\b/.test(near) ? 'done'
        // a status value that OPENS with DONE — `status: "DONE ..."`,
        // `status: >` then DONE — not the word DONE loose in prose.
        : /status:\s*[>|]?-?\s*["']?\s*DONE\b/.test(near) ? 'done'
        : /IN PROGRESS|STARTED|\bpartial\b/i.test(near) ? 'in-progress'
        : 'pending';
      // §0.60.155 — a phase written inline (`PE3: {status: BUILT-0.60.75, …}`) has no status: line of its own, so its status was
      // never read and 6 built phases (PE1-PE4, MB1, MB5) showed pending (found by the gating census, docs/2026-10-18-gating-census-phasemap.spec).
      const ans = sIdx === -1 && !/\{\s*status:/.test(rest) ? null : _answerOf(near);   // §OR1 — the value's first word
      if (ans && ((status === 'pending' && !/\bNOT STARTED\b/i.test(near)) || ans.closedAs || ans.shelf)) status = ans.status;   // NOT STARTED still wins (the 2026-09-19 rule)
      if (isDecision && /status:\s*["']?\s*DECIDED\b/.test(near)) status = 'done';   // §CV6

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
        id, map: name, ...(isDecision ? { kind: 'decision' } : isFinding ? { kind: 'finding' } : {}),
        title: id.replace(/_/g, ' '),
        status, ...(ans && ans.closedAs ? { closedAs: ans.closedAs } : {}), ...(ans && ans.shelf ? { shelf: true } : {}),
        systems: sys.systems, tags: sys.tags, systemsFrom: sys.systemsFrom, ...(sys.systemsFromFiles ? { systemsFromFiles: sys.systemsFromFiles } : {}),
        dependsOn: dep.trim().replace(/[\[\]]/g, '') || null,
        // location, for callers that EDIT a phase (idearium/repo/roadmap.js):
        // header line, the `status:` key's line (-1 if it has none) and the
        // first line of the next phase. Not part of loadAll()'s output.
        line: i, statusLine: sIdx === -1 ? -1 : i + sIdx, bodyEnd,
        name: f.name || f.does || null, closes: _list(f.closes), files: _list(f.files), specs: _list(f.specs), blocks: _blocks(f), form: 'key',   // 0.60.63 PT1 — James: "i want the specs to tagged per phase"
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
    const ans2 = sIdx === -1 ? null : _answerOf(sv);   // §OR1 — closed and shelf answers, same reader as the keyed form
    const st2 = ans2 && ((status === 'pending' && !/\bNOT STARTED\b/i.test(sv)) || ans2.closedAs || ans2.shelf) ? ans2.status : status;
    const deps = _list(f.depends_on);
    out.push({
      id, map: name,
      title: f.name ? `${id} ${String(f.name).replace(/\s+/g, ' ').trim()}` : id,
      status: st2, ...(ans2 && ans2.closedAs ? { closedAs: ans2.closedAs } : {}), ...(ans2 && ans2.shelf ? { shelf: true } : {}),
      ...(() => { const sys = _systemsOf(f, phaseLines.join(' ')); return { systems: sys.systems, tags: sys.tags, systemsFrom: sys.systemsFrom }; })(),
      dependsOn: deps.length ? deps.join(', ') : null,
      line: i, statusLine: sIdx === -1 ? -1 : i + sIdx, bodyEnd,
      name: f.name || null, closes: _list(f.closes), files: _list(f.files), specs: _list(f.specs), blocks: _blocks(f), form: 'list',
    });
    seen.add(id);
  }
  // §OR3 0.53.1 — a whole map answered at once (docs/2026-10-09-one-roadmap-phasemap.spec): a top-level
  //   roadmap: later — reason          every phase not done goes on the shelf
  //   roadmap: folded into <map> — why  every phase not done is closed, folded into that map
  // in the map's meta. One line, reversible; the phases' own statuses are untouched.
  const rm = String(text).match(/^\s{2,4}roadmap:\s*["']?(later|folded)\b(?:\s+into\s+([\w.-]+))?/im);
  if (rm) for (const p of out) {
    if (p.status === 'done') continue;
    if (rm[1].toLowerCase() === 'later') { p.status = 'pending'; p.shelf = true; }
    else { p.status = 'done'; p.closedAs = 'folded'; p.foldedInto = rm[2] || null; }
  }
  return out;
}

// ── §0.39.271 P1 helpers ────────────────────────────────────────────────────
const LIST_ID_RE = /^(\s*)-\s+id:\s*(\S+)\s*$/;
// §OR1 0.52.1 (docs/2026-10-09-one-roadmap-phasemap.spec) — James: "we also need to declutter the roadmap." The status
// VALUE's first word, read the same way by both readers. Measured 2026-10-09: 25 phases whose own map says BUILT,
// CLOSED or DONE (0.x) at the start of the value were counted open (the keyed-form reader knew only DONE — HG6). The
// declutter's answers: SUPERSEDED · RETRACTED · RETIRED · FOLDED · DONE-ELSEWHERE close a phase (status 'done',
// closedAs says how); LATER puts it on the shelf (still 'pending', shelf:true, not the roadmap). Only the value's
// FIRST word counts — never a word loose in prose (the 2026-08-13 rule).
const _CLOSED_AS = /^(superseded|retracted|retired|folded|done-elsewhere)\b/i;
const _DONE_AS = /^(done|built|built-before-mapped|shipped|closed|met|landed|fixed|resolved|complete|completed)\b/i;
const _PROG_AS = /^(partial|partially|mostly|substantially|in-progress|started|active|building|wip)\b/i;
function _answerOf(sv) {
  const m = String(sv || '').match(/status:\s*[>|]?-?\s*["']?\s*([A-Za-z][A-Za-z-]*)/);
  const w = m ? m[1] : '';
  if (!w || /^not$/i.test(w)) return null;
  if (_CLOSED_AS.test(w)) return { status: 'done', closedAs: w.toLowerCase() };
  if (/^later$/i.test(w)) return { status: 'pending', shelf: true };
  if (_DONE_AS.test(w)) return { status: 'done' };
  if (_PROG_AS.test(w)) return { status: 'in-progress' };
  return null;
}

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

module.exports = { parsePhasemapText, isPhasemapFile, PHASE_RE, PHASEMAP_FILE_RES, SYSTEMS, TERMS, NS, _tagSystem, _systemsOf, _answerOf, _fields, _list, _blocks, _indent, LIST_ID_RE };
