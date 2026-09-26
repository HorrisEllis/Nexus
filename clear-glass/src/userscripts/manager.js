'use strict';
/**
 * src/userscripts/manager.js — Clear Glass Userscript Manager
 * UUID: cg-userscript-mgr-v1-0000-0000-000000000023
 *
 * Manages userscripts per agent. Scripts can be:
 *   - Guardian's NCP userscripts (auto-loaded from guardianDir)
 *   - User-created scripts stored in .clear-glass/userscripts/
 *   - Co-pilot injected scripts (ephemeral, stored in session)
 *
 * Each script has: { id, name, source, enabled, agentId|'*', matches[], persistent }
 * 'persistent' means re-inject on every navigation to matching URL.
 * '*' agentId means inject in all agents.
 *
 * Gates: userscript.list, userscript.inject, userscript.toggle,
 *        userscript.create, userscript.delete, userscript.edit
 */

const path = require('path');
const fs   = require('fs');
const yaml = require('js-yaml');
const { randomUUID } = require('crypto');

const SCRIPTS_DIR = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'userscripts'
);

class UserscriptManager {
  constructor({ guardianDir, driver, sse } = {}) {
    this.guardianDir = guardianDir;
    this.driver      = driver;
    this.sse         = sse || { emit: () => {} };
    this._scripts    = new Map(); // id → ScriptDef
    this._injected   = new Map(); // `${agentId}:${scriptId}` → boolean
  }

  async init() {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    await this._loadUserScripts();
    await this._loadGuardianScripts();
    console.log(`[Userscripts] ${this._scripts.size} scripts loaded`);
  }

  // ── Load user scripts from disk ───────────────────────────────────────
  async _loadUserScripts() {
    try {
      const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js'));
      for (const file of files) {
        const id   = file.replace('.js', '');
        const src  = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
        const meta = this._parseMeta(src);
        this._scripts.set(id, {
          id,
          name:       meta.name || file,
          source:     src,
          enabled:    meta.enabled !== false,
          agentId:    meta.agentId || '*',
          matches:    meta.match ? [meta.match] : meta.matches || ['*'],
          persistent: meta.persistent !== false,
          type:       'user',
          path:       path.join(SCRIPTS_DIR, file),
        });
      }
    } catch (_) {}
  }

  // ── Load Guardian NCP userscripts (read-only entries) ─────────────────
  // §REWRITTEN 2026-09-03 — James: "userscripts yaml, very roomy blocks,
  // each block a component or system." Previously a hand-maintained array
  // here duplicated each script's own real `// @match` header — a second
  // copy of the same facts, and one that had already drifted: it
  // referenced 'userscript-ollama.js' (doesn't exist — only the
  // .deprecated file does, so that entry always silently no-op'd via the
  // existsSync guard below) and never listed userscript-memory.js at all
  // (a real, standalone script — confirmed by reading its own header —
  // that was therefore never loadable through this manager). Both are
  // fixed as part of this rewrite, not left as-is (see guardian/
  // userscripts.yaml's own §FIX notes on those two entries).
  //
  // guardian/userscripts.yaml is now the single real registry. Parse
  // failure or a missing file logs a warning and yields zero guardian
  // scripts rather than silently falling back to the old hardcoded array
  // — an out-of-date manifest should be visible, not masked by a second,
  // hidden source of truth reappearing underneath it.
  async _loadGuardianScripts() {
    if (!this.guardianDir) return;
    const manifestPath = path.join(this.guardianDir, 'userscripts.yaml');
    let manifest;
    try {
      manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.warn(`[Userscripts] guardian/userscripts.yaml not readable (${err.message}) — zero guardian scripts loaded`);
      return;
    }
    const components = (manifest && manifest.components) || {};

    for (const [key, c] of Object.entries(components)) {
      if (c.standalone === false) continue;      // composed into another script (e.g. nexus_wake) — not independently loadable
      if (c.loadable === false) continue;         // real, explicit deprecation — see the manifest's own status field
      const fp = path.join(this.guardianDir, c.file);
      if (!fs.existsSync(fp)) {
        console.warn(`[Userscripts] ${key}: ${c.file} not found on disk (guardian/userscripts.yaml is stale)`);
        continue;
      }
      try {
        const source = fs.readFileSync(fp, 'utf8');
        this._scripts.set(c.id, {
          id:         c.id,
          name:       c.name,
          source,
          enabled:    true,
          agentId:    '*',
          matches:    c.matches || [],
          persistent: true,
          type:       'guardian',
          path:       fp,
          readOnly:   true,
        });
      } catch (_) {}
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────
  list({ agentId, type } = {}) {
    let scripts = [...this._scripts.values()];
    if (agentId) scripts = scripts.filter(s => s.agentId === agentId || s.agentId === '*');
    if (type)    scripts = scripts.filter(s => s.type === type);
    return scripts.map(s => ({
      id: s.id, name: s.name, enabled: s.enabled,
      agentId: s.agentId, matches: s.matches, type: s.type,
      persistent: s.persistent, readOnly: s.readOnly || false,
      injected: this._isInjected(agentId || '*', s.id),
    }));
  }

  create({ name, source, agentId = '*', matches = ['*'], persistent = false }) {
    if (!name) throw new Error('name required');
    if (!source) throw new Error('source required');
    const id = randomUUID();
    const script = {
      id, name, source, enabled: true, agentId, matches, persistent, type: 'user',
      path: path.join(SCRIPTS_DIR, `${id}.js`),
    };
    this._scripts.set(id, script);
    this._saveToDisk(script);
    this.sse.emit('userscript.created', { id, name, agentId });
    return script;
  }

  edit(id, updates) {
    const script = this._scripts.get(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    if (script.readOnly) throw new Error(`Script is read-only (Guardian script): ${id}`);
    Object.assign(script, updates);
    this._saveToDisk(script);
    this.sse.emit('userscript.edited', { id, name: script.name });
    return script;
  }

  toggle(id, enabled) {
    const script = this._scripts.get(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    script.enabled = enabled;
    if (!script.readOnly) this._saveToDisk(script);
    this.sse.emit('userscript.toggled', { id, enabled });
    return { id, enabled };
  }

  delete(id) {
    const script = this._scripts.get(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    if (script.readOnly) throw new Error('Cannot delete Guardian script');
    this._scripts.delete(id);
    try { if (script.path) fs.unlinkSync(script.path); } catch (_) {}
    this.sse.emit('userscript.deleted', { id });
    return { deleted: id };
  }

  getSource(id) {
    const script = this._scripts.get(id);
    if (!script) throw new Error(`Script not found: ${id}`);
    return script.source;
  }

  // ── Injection ───────────────────────────────────────────────────────────
  async inject(agentId, scriptId) {
    const script = this._scripts.get(scriptId);
    if (!script) throw new Error(`Script not found: ${scriptId}`);
    if (!script.enabled) throw new Error(`Script disabled: ${scriptId}`);

    const injectable = this._buildInjectable(script, agentId);
    try {
      await this.driver.exec({ action: 'eval', agentId, code: injectable });
      this._injected.set(`${agentId}:${scriptId}`, true);
      this.sse.emit('userscript.injected', { agentId, scriptId, name: script.name });
      return { ok: true, scriptId, agentId };
    } catch (err) {
      this.sse.emit('userscript.inject.error', { agentId, scriptId, error: err.message });
      throw err;
    }
  }

  // Auto-inject matching scripts when URL loads
  async autoInject(agentId, url) {
    const matching = [...this._scripts.values()].filter(s =>
      s.enabled && this._matchesUrl(s.matches, url)
    );
    for (const script of matching) {
      await this.inject(agentId, script.id).catch(() => {});
    }
    return matching.length;
  }

  // ── Internals ───────────────────────────────────────────────────────────
  _buildInjectable(script, agentId) {
    // §NEW 2026-08-24 — real gap found while building the passwords
    // autofill plugin: an injected script had NO way to know its own
    // agentId, which any script needing to call back into driver.exec
    // (toast, eval, another autofill-style round trip) genuinely needs.
    // Not a passwords-specific fix — every current and future userscript
    // benefits, exposed as window.__cgAgentId, same naming convention as
    // the existing window.__cgScript_<id> idempotency guard below.
    //
    // Idempotency guard — never run twice in same page session
    return `(function(){
  if (window.__cgScript_${script.id.replace(/-/g,'_')}) return;
  window.__cgScript_${script.id.replace(/-/g,'_')} = Date.now();
  window.__cgAgentId = ${JSON.stringify(agentId || null)};
  ${script.source}
})();`;
  }

  _matchesUrl(patterns, url) {
    if (!url) return false;
    return patterns.some(p => {
      if (p === '*') return true;
      const re = new RegExp('^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return re.test(url);
    });
  }

  _isInjected(agentId, scriptId) {
    return this._injected.get(`${agentId}:${scriptId}`) || false;
  }

  _parseMeta(source) {
    const meta = {};
    const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
    if (!block) return meta;
    const lines = block[1].split('\n');
    for (const line of lines) {
      const m = line.match(/\/\/\s+@(\w+)\s+(.+)/);
      if (m) meta[m[1]] = m[2].trim();
    }
    return meta;
  }

  _saveToDisk(script) {
    try {
      if (script.path) fs.writeFileSync(script.path, script.source, 'utf8');
    } catch (_) {}
  }
}

module.exports = UserscriptManager;
