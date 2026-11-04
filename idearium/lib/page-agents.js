/**
 * idearium/lib/page-agents.js — his agent for each Idearium page that asks one (AC5).
 * Spec: idearium/spec/agent-control.spec MOD-AC-PAGE-AGENTS · Map: docs/2026-10-31-agent-control-phasemap.spec AC5
 *
 * James, 2026-10-31: "also the idearium settings, so i can change the agemnts for the spacial void and spec workshop." Each page is
 * 'learned' (Copilot's router picks, as before) or his choice { provider, model }; his choice is tried first, and when it is down the
 * router's next is used and the reply says so. Kept in Idearium's own data folder (data-dir.cjs).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const MODULE_ID = 'nexus-idearium-page-agents-v1-0000-2026-1031-jamesbrooks-001';
export const PAGES = Object.freeze({ void: 'the Spatial Void', workshop: 'the Spec Workshop' });
const file = () => require('./data-dir.cjs').resolveIdeariumPath('page-agents.json');

export function get() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (_) {}
  return Object.fromEntries(Object.keys(PAGES).map(p => [p, s[p] && s[p].provider ? s[p] : { mode: 'learned' }]));
}

/** set({ void: 'claude:sonnet' | { provider, model } | 'learned' }, { by, providers }) → the settings, or { error } */
export function set(patch = {}, { by = 'person', providers = null } = {}) {
  const now = get();
  for (const [page, v] of Object.entries(patch || {})) {
    if (!PAGES[page]) return { error: `no page "${page}" — ${Object.keys(PAGES).join(' or ')}` };
    if (v === 'learned' || v == null || (v && v.mode === 'learned')) { now[page] = { mode: 'learned' }; continue; }
    const [provider, model] = typeof v === 'string' ? v.split(':') : [v.provider, v.model];
    if (!provider) return { error: `say a provider for ${PAGES[page]}, or "learned"` };
    if (Array.isArray(providers) && providers.length && !providers.includes(provider)) return { error: `no provider "${provider}" — ${providers.join(', ')}` };
    now[page] = { provider, model: model || null, by, at: Date.now() };
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(now, null, 2));
  return now;
}

/** routeFirst(kind) → his first hop for a page job ('page:void', 'page:workshop'), or null (learned) */
export function routeFirst(kind) {
  const page = String(kind || '').replace(/^page:/, '');
  const c = get()[page];
  return c && c.provider ? { provider: c.provider, model: c.model || null } : null;
}

export default { MODULE_ID, PAGES, get, set, routeFirst };
