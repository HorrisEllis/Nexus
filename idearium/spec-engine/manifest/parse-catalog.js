// idearium/spec-engine/manifest/parse-catalog.js
// UUID: nexus-idearium-manifest-parse-catalog-v1-0000-2026-0925-jamesbrooks-001
// Intent: read the `file "path" { key = value }` entries of a .spec catalog
// (genesis.spec's GENESIS_FILE_TREE grammar) into plain objects. Parsing only:
// no resolution, no judgement. Unknown keys are kept, never dropped.

const FILE_OPEN = /file\s+"([^"]+)"\s*\{/g;

function _blockEnd(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function _value(raw) {
  const v = raw.trim();
  if (v.startsWith('[')) {
    const inner = v.slice(1, v.lastIndexOf(']'));
    return inner.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
  }
  if (v.startsWith('"')) return v.slice(1, v.lastIndexOf('"'));
  return v;
}

function _stripComments(body) {
  return body.split('\n').map(l => {
    let inStr = false;
    for (let i = 0; i < l.length - 1; i++) {
      if (l[i] === '"') inStr = !inStr;
      if (!inStr && l[i] === '/' && l[i + 1] === '/') return l.slice(0, i);
    }
    return l;
  }).join('\n');
}

function _fields(body) {
  const out = {};
  const lines = _stripComments(body).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Za-z_][\w.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let raw = m[2];
    if (raw.trim().startsWith('[')) {
      while (!raw.includes(']') && i + 1 < lines.length) raw += ' ' + lines[++i];
    } else if (raw.trim().startsWith('"')) {
      while ((raw.match(/"/g) || []).length < 2 && i + 1 < lines.length) raw += '\n' + lines[++i];
    }
    out[m[1]] = _value(raw);
  }
  return out;
}

/** parseCatalog(text) → [{ path, fields, line }] in source order. */
export function parseCatalog(text) {
  if (typeof text !== 'string') throw new Error('parseCatalog: text must be a string');
  const out = [];
  let m;
  FILE_OPEN.lastIndex = 0;
  while ((m = FILE_OPEN.exec(text))) {
    const bodyStart = m.index + m[0].length;
    const end = _blockEnd(text, bodyStart);
    if (end < 0) throw new Error(`parseCatalog: file "${m[1]}" has no closing brace`);
    const line = text.slice(0, m.index).split('\n').length;
    out.push({ path: m[1], fields: _fields(text.slice(bodyStart, end)), line });
    FILE_OPEN.lastIndex = end + 1;
  }
  return out;
}
