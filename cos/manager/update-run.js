'use strict';
/**
 * cos/manager/update-run.js — the update's git work, in its own process, so a slow fetch or npm install never stops the supervisor (§5.15 rule 3).
 * CE2, 0.60.376 (docs/2026-11-02-cos-enterprise-phasemap.spec). James, 2026-11-02: "i want toasts in cos ui for gibhub updates with a update
 * tool. so i can update nexus automatically. per system"
 *   node cos/manager/update-run.js <check|apply|keep-local> <root> '<json opts>'   → one JSON line on stdout: the kernel's own answer
 * The update logic is the kernel's (lib/nexus-update.js: check, applyBacked, keepLocalBacked; a backup asked of Idearium first, UP13).
 */
const [op, root, raw] = process.argv.slice(2);
const opts = (() => { try { return JSON.parse(raw || '{}'); } catch (_) { return {}; } })();
const U = require('../../lib/nexus-update.js');
// the backup every update needs first (UP13) is Idearium's (the kernel's default asks it); COS_UPDATE_BACKUP_URL names another endpoint that
// answers the same POST { by, why } → { ok, snapshot } (a stand-in in a test, or another backup service)
const BACKUP_URL = process.env.COS_UPDATE_BACKUP_URL || null;
const backupFn = BACKUP_URL ? (body) => new Promise((resolve) => {
  const u = new URL(BACKUP_URL), data = JSON.stringify(body);
  const req = require(u.protocol === 'https:' ? 'https' : 'http').request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', timeout: 300000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    (res) => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve({ ok: false, error: `the backup answered ${res.statusCode} with no JSON` }); } }); });
  req.on('error', (e) => resolve({ ok: false, error: `the backup at ${BACKUP_URL} did not answer (${e.code || e.message})` }));
  req.write(data); req.end();
}) : null;
(async () => {
  let r;
  try {
    if (op === 'check') r = U.check({ root, fetch: opts.fetch !== false });
    else if (op === 'apply') r = await U.applyBacked({ root, confirm: opts.confirm === true, by: opts.by || 'person', backupFn });
    else if (op === 'keep-local') r = await U.keepLocalBacked({ root, confirm: opts.confirm === true, by: opts.by || 'person', backupFn });
    else if (op === 'rollback') r = U.rollback({ root, confirm: opts.confirm === true, by: opts.by || 'person' });   // SC7
    else r = { ok: false, error: `unknown op "${op}" (check, apply, keep-local, rollback)` };
  } catch (e) { r = { ok: false, error: e.message }; }
  process.stdout.write(JSON.stringify(r) + '\n');
})();
