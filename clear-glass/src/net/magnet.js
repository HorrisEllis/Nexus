'use strict';
/**
 * clear-glass/src/net/magnet.js — a magnet link, parsed (CD1, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec MOD-CDL-MAGNET.
 * comp_id: cg.net.magnet
 *
 * James, 2026-10-21: "add magnet link handling." Pure: no lookup and no network. A routed window's magnet becomes one of these and is
 * listed in its quarantine (net/quarantine.js); peer traffic starts only through a verified client (net/qbittorrent.js, his MR12 rule).
 *   parse(link) → { infoHash, v2, name, size, trackers, webSeeds, raw } | null    (BEP 9 xt=urn:btih, BEP 53 urn:btmh)
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToHex(s) {
  let bits = '';
  for (const c of String(s).toUpperCase()) { const v = B32.indexOf(c); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
  let hex = ''; for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

const isMagnet = (url) => /^magnet:\?/i.test(String(url || ''));

function parse(link) {
  const raw = String(link || '').trim();
  if (!isMagnet(raw)) return null;
  const q = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
  let infoHash = null, v2 = null;
  for (const xt of q.getAll('xt')) {
    const m = /^urn:btih:([0-9a-f]{40}|[a-z2-7]{32})$/i.exec(xt);
    if (m && !infoHash) infoHash = m[1].length === 40 ? m[1].toLowerCase() : base32ToHex(m[1]);
    const n = /^urn:btmh:([0-9a-f]+)$/i.exec(xt);
    if (n && !v2) v2 = n[1].toLowerCase();
  }
  if (!infoHash && !v2) return null;
  const uniq = (a) => [...new Set(a.map(s => s.trim()).filter(Boolean))];
  const size = Number(q.get('xl'));
  return { infoHash, v2, name: q.get('dn') || null, size: Number.isFinite(size) && size > 0 ? size : null, trackers: uniq(q.getAll('tr')), webSeeds: uniq(q.getAll('ws')), raw };
}

module.exports = { parse, isMagnet, base32ToHex };
