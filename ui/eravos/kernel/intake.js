/* ═══════════════════════════════════════════════════════════
   ERAVOS INTAKE  v3.0.0
   File identification, FNV hash, MIME detection, type routing.
   Every file entering ERAVOS goes through here first.
   ═══════════════════════════════════════════════════════════ */

window.Intake = (() => {
'use strict';

const TYPES = [
  { id:'audio:sample', label:'Audio Sample', icon:'🎵',
    exts:['wav','mp3','ogg','flac','aiff','aif','m4a','opus'],
    mimes:['audio/'] },
  { id:'audio:midi', label:'MIDI', icon:'🎹',
    exts:['mid','midi'], mimes:['audio/midi','audio/x-midi'],
    magic:[0x4D,0x54,0x68,0x64] },
  { id:'image', label:'Image', icon:'🖼️',
    exts:['png','jpg','jpeg','gif','webp','svg','bmp'], mimes:['image/'] },
  { id:'video', label:'Video', icon:'🎬',
    exts:['mp4','webm','mov','avi'], mimes:['video/'] },
  { id:'zip', label:'Plugin Pack', icon:'📦',
    exts:['zip'], mimes:['application/zip'],
    magic:[0x50,0x4B,0x03,0x04] },
  { id:'json:preset',  label:'Preset',  icon:'🎛️', exts:['json'], mimes:['application/json'],
    jsonDetect: p => !!(p && (p._eravos || p.comp_id || p.manifest_version)) },
  { id:'json:pattern', label:'Pattern', icon:'🥁', exts:['json'], mimes:['application/json'],
    jsonDetect: p => !!(p && p.tracks && Array.isArray(p.tracks)) },
  { id:'json:generic', label:'JSON',    icon:'{ }', exts:['json'], mimes:['application/json'],
    jsonDetect: () => true },
  { id:'text', label:'Text', icon:'📄',
    exts:['txt','md','csv','spec','log'], mimes:['text/'] },
];

function _fnv32(bytes) {
  let h = 0x811c9dc5;
  const view = new Uint8Array(bytes);
  const len  = Math.min(view.length, 4096);
  for (let i = 0; i < len; i++) { h ^= view[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function _matchMagic(bytes, magic) {
  if (!magic || !bytes || bytes.byteLength < magic.length) return false;
  const v = new Uint8Array(bytes);
  return magic.every((b, i) => v[i] === b);
}

async function _identify(file) {
  const ext  = (file.name.split('.').pop() || '').toLowerCase();
  const mime = file.type || '';
  let buf = null, parsed = null;

  try { buf = await file.arrayBuffer(); }
  catch(e) { return { id:'error', name:file.name, icon:'⚠', error:`Read failed: ${e.message}`, file }; }

  const hash = _fnv32(buf);

  if (ext === 'json' || mime.includes('json')) {
    try { parsed = JSON.parse(new TextDecoder().decode(buf)); }
    catch(e) { return { id:'error', name:file.name, icon:'⚠', error:'JSON parse failed', file, hash, sizeBytes:file.size }; }
    for (const t of TYPES) {
      if (t.exts?.includes('json') && t.jsonDetect?.(parsed))
        return { id:t.id, name:file.name, label:t.label, icon:t.icon, hash, sizeBytes:file.size, mimeType:mime, arrayBuffer:buf, file, meta:{ parsed } };
    }
  }

  for (const t of TYPES) {
    if (t.magic && _matchMagic(buf, t.magic))
      return { id:t.id, name:file.name, label:t.label, icon:t.icon, hash, sizeBytes:file.size, mimeType:mime, arrayBuffer:buf, file };
  }

  for (const t of TYPES) {
    if (t.mimes?.some(m => mime.startsWith(m)))
      return { id:t.id, name:file.name, label:t.label, icon:t.icon, hash, sizeBytes:file.size, mimeType:mime, arrayBuffer:buf, file };
  }

  for (const t of TYPES) {
    if (t.exts?.includes(ext))
      return { id:t.id, name:file.name, label:t.label, icon:t.icon, hash, sizeBytes:file.size, mimeType:mime, arrayBuffer:buf, file };
  }

  return { id:'unknown', name:file.name, label:'Unknown', icon:'?', hash, sizeBytes:file.size, mimeType:mime, arrayBuffer:buf, file };
}

async function ingestAll(fileList, bus) {
  const results = [];
  for (const file of Array.from(fileList)) {
    const r = await _identify(file);
    if (bus) bus.publish('intake:file', r);
    results.push(r);
  }
  return results;
}

async function ingestOne(file, bus) {
  const r = await _identify(file);
  if (bus) bus.publish('intake:file', r);
  return r;
}

function types() { return TYPES.map(t => ({ id:t.id, label:t.label, icon:t.icon })); }

return { ingestAll, ingestOne, types };
})();
