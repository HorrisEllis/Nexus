#!/usr/bin/env node
'use strict';
/**
 * scripts/analyze-methodless-routes.js
 * UUID: nexus-analyze-methodless-v1-0000-2026-0709-jamesbrooks-001
 *
 * §WHY — scripts/generate-hooks.js declared 38 of 65 orphaned routes and
 * stopped. The remaining 27 (cortex 24, guardian 3) are written as
 * `if (p === '/x') { ... }` with NO method guard anywhere: not in the
 * conditional, not in the body. A GET to /api/intelligence/adversarial will
 * run the adversarial analysis. A POST to /api/events will return events.
 *
 * That is the real finding, and a fixed-window heuristic got it wrong: with
 * a 700-char window it inferred GET for /api/cli/exec (which executes CLI
 * commands) and POST for /api/intelligence/status. Declaring those in the
 * registry would have written a lie into the contract.
 *
 * This reads each handler's FULL block by brace matching, and reports:
 *   - behavioral method  — readBody(req) => POST-shaped;
 *                          searchParams-only => GET-shaped; both => ambiguous
 *   - methodEnforced     — always false for these routes, by definition
 *
 * It writes nothing. §1.1 — nothing exists until proven. Read the output,
 * then decide: add real method guards to the code (making the contract
 * true), or declare `methodEnforced: false` and accept it.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function handlerBlock(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return src.slice(open);
}

function analyze(file, routes) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = [];
  for (const r of routes) {
    // Only the method-less form: `p === '/x'` or `url.pathname === '/x'`
    // NOT preceded/followed by a method test in the same conditional.
    const re = new RegExp(`(?:p|url\\.pathname)\\s*===?\\s*'${r.replace(/[/]/g, '\\/')}'`, 'g');
    const m = re.exec(src);
    if (!m) { out.push({ route: r, behavioral: '?', note: 'not found' }); continue; }

    // Is there a method test within the same `if (...)` header?
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const headerEnd = src.indexOf('{', m.index);
    const header = src.slice(lineStart, headerEnd < 0 ? m.index + 80 : headerEnd);
    const guarded = /method\s*===?\s*'(GET|POST|PUT|DELETE|PATCH)'/.test(header);

    const block = handlerBlock(src, m.index);
    const readsBody  = /readBody\s*\(\s*req\s*\)/.test(block);
    const readsQuery = /searchParams/.test(block);
    const checksInside = /method\s*===?\s*'(GET|POST|PUT|DELETE|PATCH)'/.test(block);

    let behavioral;
    if (readsBody && readsQuery) behavioral = 'AMBIGUOUS (reads body AND query)';
    else if (readsBody)          behavioral = 'POST-shaped';
    else if (readsQuery)         behavioral = 'GET-shaped';
    else                         behavioral = 'NEITHER (no body, no query)';

    out.push({
      route: r,
      guardedInHeader: guarded,
      checksMethodInside: checksInside,
      behavioral,
      blockLines: block.split('\n').length,
    });
  }
  return out;
}

// 2026-09-19: the intelligence-domain paths (/api/intelligence/*, /api/cortex/query) moved
// to intelligence/routes.js and are 410 tombstones in cortex/boot.js, so they are no longer
// analyzed here. Their hooks now live in hooks/intelligence.hooks.js.
const CORTEX = ['/api/cli/exec','/api/events','/api/failure-modes','/api/friction',
  '/api/health','/api/memory/forget'];

const rows = analyze('cortex/boot.js', CORTEX);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('route', 34), pad('guard?', 8), pad('inside?', 9), 'behavioral');
console.log('-'.repeat(84));
for (const r of rows) {
  console.log(pad(r.route, 34), pad(r.guardedInHeader ? 'yes' : 'NO', 8), pad(r.checksMethodInside ? 'yes' : 'no', 9), r.behavioral);
}
const unenforced = rows.filter(r => !r.guardedInHeader && !r.checksMethodInside).length;
console.log(`\n${unenforced}/${rows.length} routes enforce NO method at all.`);
console.log('A GET to a POST-shaped route runs the handler with an empty body.');
