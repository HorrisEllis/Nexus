'use strict';
/**
 * clear-glass/src/main/passwords-wiring.js — pages ↔ the password service ↔ the window (PW3, 0.60.186).
 * Spec: clear-glass/spec/passwords.spec MOD-PW-MAIN. comp_id: cg.main.passwords-wiring
 *
 * James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
 * attach() registers src/preload/passwords.js on every session (so provider tabs and account windows have it too) and answers it:
 *   pw:capture  → service.capture (the origin from the SENDER's URL, never the page's word) → 'passwords:offer' to the window that embeds it
 *   pw:form     → the page's logins; one login + autofill on → pw:fill back; the window told how many ('passwords:available')
 * and the window: passwords:save | dismiss | forPage | fillPage. Dropped, said in the result: the plugin is off (PW-005) or the session is a
 * Snowflake compartment (PW-004).
 */
function attach({ app, ipcMain, service, isActive = () => true, isCompartment = () => false, preloadPath, webContents, log = () => {} } = {}) {
  const svc = () => service();
  const originOf = (wc) => { try { return svc().originOf(wc.getURL()); } catch (_) { return null; } };
  const hostOf = (wc) => (wc && wc.hostWebContents && !wc.hostWebContents.isDestroyed() ? wc.hostWebContents : null);
  const allowed = (wc) => { if (!isActive()) return 'the Password Manager plugin is off'; try { if (isCompartment(wc.session)) return 'a Snowflake window keeps no logins'; } catch (_) {} return null; };
  let registered = 0;

  const register = (ses) => {
    try {
      if (typeof ses.registerPreloadScript === 'function') ses.registerPreloadScript({ type: 'frame', id: 'cg-passwords', filePath: preloadPath });
      else ses.setPreloads([...(ses.getPreloads ? ses.getPreloads() : []), preloadPath]);
      registered++;
    } catch (e) { log(`[passwords] the page script was not added to a session: ${e.message}`); }
  };
  if (app) app.on('session-created', register);

  ipcMain.on('pw:capture', (e, d = {}) => {
    const wc = e.sender; const why = allowed(wc); if (why) return;
    const r = svc().capture(wc.id, { origin: wc.getURL(), username: d.username, password: d.password });
    const host = hostOf(wc);
    if (r.offer && host) host.send('passwords:offer', { wcId: wc.id, ...r.offer });   // never the password (PW-001)
  });
  ipcMain.on('pw:form', (e) => {
    const wc = e.sender; if (allowed(wc)) return;
    const origin = originOf(wc); if (!origin) return;
    const list = svc().logins(origin); const host = hostOf(wc);
    if (host) host.send('passwords:available', { wcId: wc.id, origin, count: list.length, usernames: list.map(l => l.username) });
    if (list.length === 1 && svc().prefs().autofill) { const f = svc().fill(origin, list[0].id); if (f.ok) wc.send('pw:fill', { username: f.username, password: f.password, force: false }); }
  });

  const wcOf = (id) => { const wc = webContents.fromId(Number(id)); if (!wc || wc.isDestroyed()) throw new Error('that page is gone'); return wc; };
  const h = (fn) => async (e, d = {}) => { try { return await fn(d, e); } catch (err) { return { ok: false, error: err.message }; } };
  ipcMain.handle('passwords:save', h((d) => svc().save(Number(d.wcId), d.origin, { username: d.username, accountId: d.accountId || null })));
  ipcMain.handle('passwords:dismiss', h((d) => svc().dismiss(Number(d.wcId), d.origin, { never: !!d.never })));
  ipcMain.handle('passwords:forPage', h((d) => { const wc = wcOf(d.wcId); const origin = originOf(wc); const why = allowed(wc); return { ok: !why, error: why || undefined, origin, logins: origin && !why ? svc().logins(origin) : [] }; }));
  ipcMain.handle('passwords:fillPage', h((d) => {
    const wc = wcOf(d.wcId); const why = allowed(wc); if (why) return { ok: false, error: why };
    const origin = originOf(wc); const f = svc().fill(origin, String(d.id || '')); if (!f.ok) return f;
    wc.send('pw:fill', { username: f.username, password: f.password, force: true }); return { ok: true, username: f.username };
  }));
  return { registered: () => registered, register };
}

module.exports = { attach };
