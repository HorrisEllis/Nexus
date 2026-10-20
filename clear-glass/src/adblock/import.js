'use strict';
/**
 * clear-glass/src/adblock/import.js — his own lists: files, folders, host lists (AB5, 0.60.184).
 * Spec: clear-glass/spec/adblock.spec MOD-ABK-IMPORT. comp_id: cg.adblock.import
 *
 * James, 2026-10-21: "Needs filters. you'll be able to import folders and host lists. Same with the Snowflake plugin."
 * detectFormat() tells an Adblock Plus / uBlock list, a hosts file and a plain domain list apart; sources() reads the files and folders a
 * person chose (folders two levels deep, list-like files only, capped), naming everything it skips. The service (lists.js) keeps each one as
 * a list of its own. src/net/host-import.js reads host lists for Snowflake's routes with the same hostsOf idea.
 */
const fs = require('fs');
const path = require('path');
const { BARE_HOST } = require('./engine');

const LISTLIKE = new Set(['', '.txt', '.list', '.hosts', '.conf', '.rules', '.abp', '.filters', '.lst']);
const MAX_FILES = 200, MAX_BYTES = 20 * 1024 * 1024, DEPTH = 2;

/** detectFormat(text) → 'abp' | 'hosts' | 'domains' — by its header and what most of its first rule lines look like */
function detectFormat(text) {
  const head = String(text || '').slice(0, 4000);
  if (/^\s*\[(?:Adblock|uBlock)/i.test(head) || /^!\s*(?:Title|Homepage|Expires):/im.test(head)) return 'abp';
  let hosts = 0, bare = 0, abp = 0, n = 0;
  for (const raw of head.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l.startsWith('!') || l.startsWith('#') && !l.startsWith('##')) continue;
    if (++n > 60) break;
    if (/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+\S/.test(l)) hosts++;
    else if (BARE_HOST.test(l)) bare++;
    else abp++;
  }
  if (!n) return 'abp';
  if (hosts >= bare && hosts > abp) return 'hosts';
  if (bare > abp) return 'domains';
  return 'abp';
}

/** sources(paths) → { files: [{ path, name, text }], skipped: [{ path, why }] } — files and folders a person chose */
function sources(paths = [], { fsx = fs } = {}) {
  const files = [], skipped = [];
  const take = (p) => {
    if (files.length >= MAX_FILES) { skipped.push({ path: p, why: `more than ${MAX_FILES} files; the rest not read` }); return; }
    let st; try { st = fsx.statSync(p); } catch (e) { skipped.push({ path: p, why: 'not found' }); return; }
    if (st.size > MAX_BYTES) { skipped.push({ path: p, why: 'larger than 20 MB' }); return; }
    let text; try { text = fsx.readFileSync(p, 'utf8'); } catch (e) { skipped.push({ path: p, why: e.code || e.message }); return; }
    if (text.includes('\u0000')) { skipped.push({ path: p, why: 'not a text file' }); return; }
    files.push({ path: p, name: path.basename(p), text });
  };
  const walk = (dir, depth) => {
    let names; try { names = fsx.readdirSync(dir).sort(); } catch (e) { skipped.push({ path: dir, why: 'cannot read the folder' }); return; }
    for (const n of names) {
      if (n.startsWith('.')) continue;
      const p = path.join(dir, n); let st; try { st = fsx.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) { if (depth < DEPTH) walk(p, depth + 1); else skipped.push({ path: p, why: 'deeper than two folders' }); continue; }
      if (!LISTLIKE.has(path.extname(n).toLowerCase())) { skipped.push({ path: p, why: 'not a list file' }); continue; }
      take(p);
    }
  };
  for (const p of paths) {
    let st; try { st = fsx.statSync(p); } catch (_) { skipped.push({ path: p, why: 'not found' }); continue; }
    if (st.isDirectory()) walk(p, 1); else take(p);
  }
  return { files, skipped };
}

module.exports = { detectFormat, sources, LISTLIKE, MAX_FILES, MAX_BYTES };
