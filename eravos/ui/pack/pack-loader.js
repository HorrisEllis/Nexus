/* ═══════════════════════════════════════════════════════════
   ERAVOS PACK LOADER  v1.0.0
   pack/pack-loader.js

   Responsible for taking a zip ArrayBuffer and turning it
   into a live mounted mod.

   API:
     PackLoader.install(arrayBuffer, opts)
       opts: { pos, autoSpawn, onPermissionRequest, source }
       Returns Promise<{ ok, manifest, entry } | null>

     PackLoader.installFromUrl(url, opts)
       Fetch + install in one call.

   Pipeline:
     1. Unzip → read manifest.json
     2. Validate manifest (kernel_target, required fields)
     3. Request permissions (calls opts.onPermissionRequest)
     4. Check requires (capabilities)
     5. Evaluate engine.js into window scope
     6. CatalogRegistry.register() → mod available in catalog
     7. ModFactory.register() → mod spawnable
     8. If opts.autoSpawn → ModFactory.spawn()
     9. Emit kernel:pack-installed

   Called by:
     NexusBridge          — when NEXUS delivers a built zip
     index.html drop zone — when user drops a zip file
     CLI (future)         — node nexus-cli.js install-mod <zip>
   ═══════════════════════════════════════════════════════════ */

window.PackLoader = (() => {
'use strict';

const KERNEL_VERSION = '3.0.0';

async function install(arrayBuffer, opts = {}) {
  const {
    pos               = { x: 80 + Math.random() * 400, y: 80 + Math.random() * 200 },
    autoSpawn         = true,
    source            = 'pack',
    onPermissionRequest = () => Promise.resolve(true),
  } = opts;

  if (!window.JSZip) {
    console.error('[PackLoader] JSZip not available');
    _fault('ASSET_001', 'JSZip required for zip installation');
    return null;
  }

  // 1. Unzip
  let zip, manifest, files = {};
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch(e) {
    _fault('ASSET_001', `zip read failed: ${e.message}`);
    return null;
  }

  // 2. Read and validate manifest
  const mfFile = zip.file('manifest.json');
  if (!mfFile) {
    _fault('MOUNT_005', 'manifest.json not found in zip');
    return null;
  }
  try {
    manifest = JSON.parse(await mfFile.async('string'));
  } catch(e) {
    _fault('MOUNT_005', `manifest.json parse failed: ${e.message}`);
    return null;
  }

  const required = ['manifest_version', 'pack_id', 'pack_type', 'permissions', 'contents'];
  for (const f of required) {
    if (!manifest[f]) {
      _fault('MOUNT_005', `manifest missing required field: ${f}`);
      return null;
    }
  }

  if (manifest.kernel_target && manifest.kernel_target > KERNEL_VERSION) {
    _fault('MOUNT_004', `requires kernel ${manifest.kernel_target}, running ${KERNEL_VERSION}`);
    return null;
  }

  // 3. Read declared files
  const contents = manifest.contents || {};
  for (const [role, filePath] of Object.entries(contents)) {
    if (typeof filePath !== 'string') continue;
    const f = zip.file(filePath);
    if (f) files[role] = await f.async('string');
  }

  // 4. Request permissions
  const perms = manifest.permissions || [];
  if (perms.length) {
    const granted = await onPermissionRequest(manifest.pack_id, manifest.label, perms);
    if (!granted) {
      _fault('MOUNT_003', `user denied permissions for ${manifest.pack_id}`);
      return null;
    }
  }

  // 5. Check requires
  if (manifest.requires?.length && typeof KERNEL !== 'undefined') {
    const { ok, missing } = KERNEL.registry.checkRequires(manifest.requires);
    if (!ok) {
      _fault('MOUNT_002', `missing capabilities: ${missing.join(', ')}`);
      return null;
    }
  }

  // 6. Evaluate engine.js
  const engineSrc = files['engine'] || files[contents.engine];
  if (engineSrc) {
    try {
      const script = document.createElement('script');
      script.textContent = engineSrc;
      document.head.appendChild(script);
    } catch(e) {
      _fault('MOUNT_006', `engine eval failed: ${e.message}`);
      return null;
    }
  }

  // 7. Build definition for registries
  const id           = manifest.pack_id;
  const label        = manifest.label || id;
  const icon         = manifest.icon  || '◆';
  const accent       = manifest.accent|| null;
  const category     = manifest.domains?.[0] || manifest.category || 'Custom';
  const summary      = manifest.description || manifest.summary || '';
  const needs        = manifest.needs || [];
  const engineGlobal = manifest.engine_global; // e.g. 'MyModEngine'

  const def = {
    id, label, icon, accent, category, summary, needs,
    source,
    tags: manifest.tags || [],
    mountEngine(instanceId, intakeResult, sBus, userConfig = {}) {
      if (engineGlobal && window[engineGlobal]?.mount) {
        window[engineGlobal].mount(instanceId, sBus, KERNEL.audio, userConfig);
      }
    },
    buildUI(content, intakeResult, instanceId, sBus, _pub) {
      if (engineGlobal && window[engineGlobal]?.buildUI) {
        window[engineGlobal].buildUI(content, intakeResult, instanceId, sBus, _pub);
      } else {
        content.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:16px;font-family:var(--mono);font-size:9px;color:var(--dim2);';
        content.innerHTML = `<div style="font-size:28px">${icon}</div><div>${label}</div><div style="font-size:7px;opacity:.5">${id}</div>`;
      }
    },
  };

  // 8. Register in CatalogRegistry + ModFactory
  if (typeof CatalogRegistry !== 'undefined') {
    CatalogRegistry.register({ ...def, _def: def });
  }
  if (typeof ModFactory !== 'undefined') {
    ModFactory.register(id, def);
  }

  // 9. Write to KERNEL ledger
  if (typeof KERNEL !== 'undefined') {
    KERNEL.ledger._write({ type: 'pack_installed', packId: id, label, source });
    KERNEL.bus.publish('kernel:pack-installed', { packId: id, manifest, files, pos, source });
  }

  // 10. Auto-spawn
  if (autoSpawn && typeof ModFactory !== 'undefined') {
    if (typeof bootAudio === 'function') bootAudio();
    ModFactory.spawn(id, pos);
  }

  console.log(`[PackLoader] installed: ${label} (${id}) from ${source}`);
  return { ok: true, manifest, entry: def };
}

async function installFromUrl(url, opts = {}) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    return await install(buf, opts);
  } catch(e) {
    console.error(`[PackLoader] installFromUrl failed: ${e.message}`);
    return null;
  }
}

function _fault(code, message) {
  console.error(`[PackLoader] FAULT ${code}: ${message}`);
  if (typeof KERNEL !== 'undefined') {
    KERNEL.bus.publish('kernel:fault', { code, message, source: 'PackLoader' });
  }
}

return { install, installFromUrl };
})();
