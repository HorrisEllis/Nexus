/* ERAVOS kernel intake — every imported file becomes an AssetSeam (Layer 11)
 * and zips follow the kernel_install_sequence of eravos.pack.format.spec (steps 1–15).
 * Domain-free routing: zip → install pack · json → intake:file (claimed by whoever understands it) ·
 * anything else → the first file handler a domain registered with Intake.defineHandler that matches
 * (only handlers whose domain is installed in this universe). Pack types beyond the core set come from
 * domains too (Intake.definePackType). Drops on organism windows are handled by that organism's UI
 * (stopPropagation) — intake only sees canvas-level drops (F-14). */
(function (global) {
  'use strict';
  const MANIFEST_REQUIRED = ['manifest_version', 'pack_id', 'pack_type', 'kernel_target', 'author', 'permissions', 'contents'];
  const PACK_TYPES = new Map([['domain', {}], ['organism', {}], ['organism_pack', {}], ['workspace', {}], ['ecosystem', {}], ['behavior', {}], ['theme', {}], ['recipe', {}], ['asset_pack', {}]]);
  const handlers = [];   // { id, domain?, match(name, mime, head:Uint8Array) → bool, handle({K, name, bytes, mime, pos, asset, pack?}) → result }
  const installed = new Map();
  function handlerFor(K, name, mime, bytes) {
    const head = new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength));
    return handlers.find(h => (!h.domain || K.domains.has(h.domain)) && h.match(name, mime || '', head)) || null;
  }

  // ---------------------------------------------------------------- zip (store + deflate via DecompressionStream)
  async function unzip(ab) {
    const dv = new DataView(ab), bytes = new Uint8Array(ab);
    let eocd = -1;
    for (let i = ab.byteLength - 22; i >= Math.max(0, ab.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('zip: end of central directory not found');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    const td = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip: bad central header');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const lnlen = dv.getUint16(lho + 26, true), lxlen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      const raw = bytes.slice(start, start + csize);
      files.set(name, { method, usize, raw, async data() {
        if (method === 0) return raw.buffer;
        if (method !== 8) throw new Error(`zip: method ${method} unsupported (${name})`);
        const ds = new DecompressionStream('deflate-raw');
        return await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
      } });
    }
    // strip a single top-level folder if manifest lives inside it
    if (!files.has('manifest.json')) {
      const m = Array.from(files.keys()).find(k => /^[^/]+\/manifest\.json$/.test(k));
      if (m) { const pre = m.slice(0, m.indexOf('/') + 1); const f2 = new Map(); files.forEach((v, k) => { if (k.startsWith(pre)) f2.set(k.slice(pre.length), v); }); return f2; }
    }
    return files;
  }

  function validateManifest(m, K) {
    const errs = [];
    if (!m || typeof m !== 'object') return ['manifest is not an object'];
    MANIFEST_REQUIRED.forEach(k => { if (m[k] === undefined) errs.push(`missing ${k}`); });
    if (m.manifest_version && m.manifest_version !== '1.0.0') errs.push(`manifest_version ${m.manifest_version} ≠ 1.0.0`);
    if (m.pack_id && !/^[a-z][a-z0-9-.]+$/.test(m.pack_id)) errs.push('pack_id pattern');
    if (m.pack_type && !PACK_TYPES.has(m.pack_type)) errs.push(`pack_type ${m.pack_type}`);
    const known = K ? K.permissions.known() : null;
    if (m.permissions && (!Array.isArray(m.permissions) || (known && m.permissions.some(p => !known.includes(p))))) errs.push('permissions invalid');
    if (m.contents && typeof m.contents !== 'object') errs.push('contents must be object');
    return errs;
  }

  function create(K, o) {
    o = o || {};
    const bus = K.bus;
    const I = { installed };
    const confirmPerms = o.confirm || ((m) => global.confirm ? global.confirm(`Install "${m.label || m.pack_id}" ${m.pack_version || ''}?\n\n${m.permissions.length ? 'It asks for:\n  • ' + m.permissions.join('\n  • ') : 'It asks for no special permissions.'}`) : true);

    async function readFile(file) { return await file.arrayBuffer(); }
    function isZip(ab) { const b = new Uint8Array(ab, 0, Math.min(4, ab.byteLength)); return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; }

    I.files = async function (fileList, pos) {
      const results = [];
      let k = 0;
      for (const f of Array.from(fileList)) {
        const p = pos ? { x: pos.x + k * 24, y: pos.y + k * 20 } : undefined; k++;
        try { results.push(await I.file(f.name, await readFile(f), f.type, p)); }
        catch (e) { K.fault('ASSET_001', { message: `${f.name}: ${e.message}` }); }
      }
      return results;
    };

    I.file = async function (name, ab, mime, pos) {
      if (isZip(ab)) return I.installZip(ab, name, pos);
      if (/\.json$/i.test(name) || /json/.test(mime || '')) {
        let json = null;
        try { json = JSON.parse(new TextDecoder().decode(ab)); } catch (e) { K.fault('ASSET_001', { message: `${name}: invalid JSON` }); return null; }
        const ev = { name, mime: 'application/json', arrayBuffer: ab, json, claimed: false };
        bus.publish('intake:file', ev);
        if (!ev.claimed) K.fault('ASSET_004', { message: `${name}: no organism claims this JSON (not a workspace)` });
        return { kind: 'json', claimed: ev.claimed };
      }
      const h = handlerFor(K, name, mime, ab);
      if (h) {
        K.domains.prepare();
        const asset = K.assets.register(ab, { name, mime: mime || undefined, asset_type: h.asset_type });
        return await h.handle({ K, name, bytes: ab, mime, pos, asset });
      }
      K.fault('ASSET_004', { message: `${name}: no installed domain handles this file type` });
      return null;
    };

    // kernel_install_sequence
    I.installZip = async function (ab, name, pos) {
      const step = (n, label) => K.ledger.write('pack_install_step', { step: n, name: label, source: name });
      step(1, 'detect');
      let files;
      try { files = await unzip(ab); } catch (e) { K.fault('ASSET_001', { message: `${name}: ${e.message}` }); return null; }
      step(2, 'extract_manifest');
      const mf = files.get('manifest.json');
      if (!mf) { K.fault('MOUNT_005', { message: `${name}: manifest.json missing` }); return null; }
      let m;
      try { m = JSON.parse(new TextDecoder().decode(await mf.data())); } catch (e) { K.fault('MOUNT_005', { message: `${name}: manifest.json unparseable` }); return null; }
      step(3, 'validate_manifest');
      const errs = validateManifest(m, K);
      if (errs.length) { K.fault('MOUNT_005', { message: `${name}: ${errs.join('; ')}` }); return null; }
      step(4, 'check_kernel_target');
      if (K.semver.gt(m.kernel_target, K.version)) { K.fault('MOUNT_004', { message: `${m.pack_id} needs kernel ${m.kernel_target}, running ${K.version}` }); return null; }
      step(5, 'check_conflicts');
      const conflict = (m.conflicts || []).find(c => installed.has(c) || K.registry.byOrganism(c).length);
      if (conflict) { K.fault('MOUNT_006', { message: `${m.pack_id} conflicts with mounted ${conflict}` }); return null; }
      step(6, 'present_permissions');
      if (!(await confirmPerms(m))) { K.fault('MOUNT_003', { message: `${m.pack_id}: permissions denied by user` }); return null; }
      K.permissions.grant(m.permissions);
      step(7, 'check_requires');
      if (m.requires && m.requires.length) {
        K.domains.prepare();
        const miss = m.requires.filter(c => !K.registry.hasCapability(c));
        if (miss.length) { K.fault('MOUNT_002', { message: `${m.pack_id}: missing ${miss.join(', ')}` }); return null; }
      }
      step(8, 'check_dependencies');
      const deps = (m.dependencies || []).filter(d => !installed.has(d) && !global.OrganismFactory.def(d));
      if (deps.length) { K.fault('MOUNT_001', { message: `${m.pack_id}: dependencies missing ${deps.join(', ')}` }); return null; }
      step(9, 'resolve_order');
      step(10, 'register_assets');
      const c = m.contents || {};
      const assets = [];
      for (const a of (c.assets || [])) {
        const f = files.get(a.path);
        if (!f) { K.fault('ASSET_001', { message: `${m.pack_id}: asset ${a.path} missing from zip` }); continue; }
        const data = await f.data();
        const rec = K.assets.register(data, { name: a.path.split('/').pop(), mime: a.mime, hash: a.hash });
        assets.push(Object.assign({}, a, { hash: rec.hash, data }));
      }
      step(11, 'mount_organisms');
      // pack stylesheets (P13): contents.styles {name: path.css} → one <style data-pack> each, before the pack's code runs
      for (const sp of Object.values(c.styles || {}).filter(p => typeof p === 'string' && /\.css$/.test(p))) {
        const f = files.get(sp);
        if (!f) { K.fault('MOUNT_005', { message: `${m.pack_id}: ${sp} listed but missing` }); continue; }
        if (global.document) { const st = global.document.createElement('style'); st.dataset.pack = m.pack_id; st.dataset.src = sp; st.textContent = new TextDecoder().decode(await f.data()); global.document.head.appendChild(st); }
      }
      // organism code: every .js file listed in any contents map (engines, ui, and domain-specific maps)
      const scripts = [].concat(...Object.values(c).filter(v => v && typeof v === 'object' && !Array.isArray(v)).map(v => Object.values(v))).filter(p => typeof p === 'string' && /\.js$/.test(p));
      for (const sp of scripts) {
        const f = files.get(sp);
        if (!f) { K.fault('MOUNT_005', { message: `${m.pack_id}: ${sp} listed but missing` }); continue; }
        await evalScript(await f.data(), sp);
      }
      const spawned = [];
      let k = 0;
      (m.auto_mount || []).forEach(id => { const inst = global.OrganismFactory.spawn(id, pos ? { x: pos.x + k * 30, y: pos.y + k * 30 } : {}); k++; if (inst) spawned.push(inst); });
      step(12, 'apply_mutations');
      step(13, 'mount_behaviors');
      // install_behavior for asset packs
      const ib = m.install_behavior || {};
      // each pack asset goes through the matching file handler when the manifest (or its pack type) asks for it
      if (ib.on_asset_drop || (PACK_TYPES.get(m.pack_type) || {}).spawnAssets) {
        const off = ib.cascade_offset || { x: 24, y: 20 };
        const base = pos || { x: 60, y: 60 };
        let i = 0;
        for (const a of assets) {
          const nm = a.path.split('/').pop(), h = handlerFor(K, nm, a.mime, a.data);
          if (!h) continue;
          const r = await h.handle({ K, name: nm, bytes: a.data, mime: a.mime, asset: K.assets.get(a.hash), pack: m, pos: { x: base.x + i * off.x, y: base.y + i * off.y } });
          i++;
          if (r && r.instanceId) spawned.push(r.instanceId);
        }
      }
      step(14, 'load_workspace');
      if (m.starter_workspace && files.get(m.starter_workspace)) {
        try { await global.Workspace.restore(JSON.parse(new TextDecoder().decode(await files.get(m.starter_workspace).data()))); }
        catch (e) { K.fault('MOUNT_005', { message: `${m.pack_id}: starter workspace invalid` }); }
      }
      step(15, 'publish_installed');
      installed.set(m.pack_id, { manifest: m, installed_at: new Date().toISOString(), assets: assets.map(a => a.hash) });
      K.ledger.write('pack_installed', { pack_id: m.pack_id, pack_version: m.pack_version, assets: assets.length, spawned: spawned.length });
      bus.publish('kernel:pack-installed', { pack_id: m.pack_id, pack_type: m.pack_type, assets: assets.map(a => ({ hash: a.hash, name: a.path })), spawned });
      return { kind: 'pack', pack_id: m.pack_id, spawned, assets };
    };

    function evalScript(ab, name) {
      return new Promise((res) => {
        const url = URL.createObjectURL(new Blob([ab], { type: 'application/javascript' }));
        const s = document.createElement('script'); s.src = url;
        s.onload = () => { URL.revokeObjectURL(url); res(true); };
        s.onerror = () => { K.fault('MOUNT_005', { message: `script ${name} failed to load` }); res(false); };
        document.head.appendChild(s);
      });
    }

    // DOM wiring: canvas-level drops only
    I.attach = function (el) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dropping'); });
      el.addEventListener('dragleave', (e) => { if (e.target === el) el.classList.remove('dropping'); });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); el.classList.remove('dropping');
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        const pos = global.CanvasWM ? global.CanvasWM.toWorld(e.clientX, e.clientY) : null;
        I.files(e.dataTransfer.files, pos);
      });
    };
    return I;
  }

  global.Intake = {
    create, unzip, validateManifest,
    defineHandler(h) { if (h && h.id && typeof h.match === 'function' && typeof h.handle === 'function' && !handlers.some(x => x.id === h.id)) handlers.push(h); },
    definePackType(type, o) { if (!PACK_TYPES.has(type)) PACK_TYPES.set(type, o || {}); },
    handlers: () => handlers.map(h => ({ id: h.id, domain: h.domain || null })),
  };
})(typeof window !== 'undefined' ? window : globalThis);
