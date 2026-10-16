/* ERAVOS runtime — desktop bridge (spec eravos.phase12-desktop). Inert unless the page runs inside ERAVOS.exe
 * (window.eravosDesktop comes from the app's preload). Domain-free: files from the library folder go through the same
 * intake as a canvas drop; packs dropped on the canvas are kept in the packs folder so they load every start. */
(function (global) {
  'use strict';
  const D = global.eravosDesktop; if (!D) return;
  global.ERAVOS_DESKTOP = true;
  // the shell shows its start screen when the packs folder has loaded (tools + recipes exist by then); 20 s safety net
  let packsReady; global.ERAVOS_PACKS_READY = new Promise((res) => { packsReady = res; setTimeout(res, 20000); });
  async function manifestOf(ab) {
    try { const files = await global.Intake.unzip(ab); const mf = files.get('manifest.json'); return mf ? JSON.parse(new TextDecoder().decode(await mf.data())) : null; } catch (e) { return null; }
  }
  function dependencyOrder(items) { // Kahn's algorithm over pack_id → dependencies; unknown deps are left to the installer to judge
    const byId = new Map(items.filter(i => i.m && i.m.pack_id).map(i => [i.m.pack_id, i])), out = [], seen = new Set(), temp = new Set();
    const visit = (i) => { if (seen.has(i)) return; if (temp.has(i)) return; temp.add(i); ((i.m && i.m.dependencies) || []).forEach(d => { const x = byId.get(d); if (x) visit(x); }); temp.delete(i); seen.add(i); out.push(i); };
    items.forEach(visit); return out;
  }
  function whenShell(fn) { const t = setInterval(() => { if (global.ShellIntake && global.Shell) { clearInterval(t); fn(global.ShellIntake, global.Shell); } }, 50); }
  function viewCentre() {
    const c = global.document.getElementById('canvas'); if (!c || !global.CanvasWM) return undefined;
    const r = c.getBoundingClientRect(); return global.CanvasWM.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }
  whenShell((intake, S) => {
    // packs dropped on the canvas (or into the drop folder) persist: keep a copy in packs/
    const orig = intake.file.bind(intake); let fromFolder = 0;
    intake.file = async function (name, ab, mime, pos) {
      const r = await orig(name, ab, mime, pos);
      if (r && r.kind === 'pack' && !fromFolder) { try { const k = await D.keepPack(name, new Uint8Array(ab)); if (k && k.kept) S.toast(`Kept “${name}” in ERAVOS › packs — it loads every start`, 'good', 4000); } catch (e) {} }
      return r;
    };
    // installing from the packs folder: putting the pack there is the consent — no install prompt every start
    const confirm0 = global.confirm;
    let n = 0;
    D.onFile(async (f) => {
      const ab = f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength);
      let ok = false;
      const pack = f.source === 'pack';
      if (pack) { fromFolder++; global.confirm = (msg) => /^Install "/.test(String(msg)) ? true : confirm0.call(global, msg); }
      try {
        const c = viewCentre(); const pos = c ? { x: c.x - 200 + (n % 5) * 30, y: c.y - 150 + (n % 5) * 24 } : undefined; n++;
        const r = await intake.file(f.name, ab, '', pos);
        ok = !!r;
        if (!pack) S.toast(ok ? `Took in “${f.name}” from the drop folder` : `Couldn’t open “${f.name}” from the drop folder — it may be damaged or a kind of file nothing installed can open. Details: the red dot, top right.`, ok ? 'good' : 'bad', 3500);
        if (!pack && ok && r.kind === 'pack') { try { await D.keepPack(f.name, new Uint8Array(ab)); } catch (e) {} }
      } catch (e) { S.K.fault('ASSET_001', { message: `${f.name}: ${e.message}` }); }
      finally { if (pack) { fromFolder--; if (!fromFolder) global.confirm = confirm0; } D.fileDone(f.id, ok); }
    });
    // packs folder: one batch, dependency-ordered, no prompt (placing a pack there is the consent), then the start screen
    D.onPacks(async (list) => {
      let ok = 0; const failed = [];
      try {
        const items = await Promise.all((list || []).map(async (p) => { const ab = p.data.buffer.slice(p.data.byteOffset, p.data.byteOffset + p.data.byteLength); return { name: p.name, ab, m: await manifestOf(ab) }; }));
        fromFolder++; global.confirm = (msg) => /^Install "/.test(String(msg)) ? true : confirm0.call(global, msg);
        for (const it of dependencyOrder(items)) {
          if (it.m && global.Intake && intake.installed && intake.installed.has(it.m.pack_id)) { ok++; continue; }
          const r = await intake.file(it.name, it.ab, 'application/zip');
          if (r && r.kind === 'pack') ok++; else failed.push(it.name);
        }
      } catch (e) { S.K.fault('MOUNT_005', { message: 'packs folder: ' + e.message, quiet: true }); S.toast('The packs in ERAVOS › packs couldn’t be read. Extra tools from packs may be missing — check the folder is there and not open in another program.', 'bad', 9000); }
      finally { fromFolder--; if (!fromFolder) global.confirm = confirm0; }
      if (failed.length) S.toast(`${failed.length} pack${failed.length > 1 ? 's' : ''} in ERAVOS › packs didn’t load (${failed.join(', ')}). The rest work. Details: the red dot, top right.`, 'bad', 9000);
      global.ERAVOS_PACKS_LOADED = { ok, failed };
      packsReady(); D.packsDone();
    });
    D.onSaved((s) => S.toast(s.ok ? `Saved to ERAVOS › ${s.folder} › ${s.name}` : `Saving ${s.name} failed`, s.ok ? 'good' : 'bad', 4000));
    // toolbar: open the ERAVOS folder
    const bar = global.document.querySelector('#topbar, .topbar, header');
    const b = global.document.createElement('button'); b.className = 'tb-btn'; b.textContent = '📁 Folder';
    b.title = 'Open the ERAVOS folder — put sounds, packs or projects in “drop”'; b.onclick = () => D.openLibrary();
    if (S.slot) { try { (S.slot('options') || S.slot('bar')).appendChild(b); } catch (e) { if (bar) bar.appendChild(b); } } else if (bar) bar.appendChild(b);
    D.ready();
  });
})(typeof window !== 'undefined' ? window : globalThis);
