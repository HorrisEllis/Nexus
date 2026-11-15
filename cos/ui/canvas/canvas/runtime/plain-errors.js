/* ERAVOS runtime — plain-errors.js → window.PlainErrors   (P11.2 · production gate E)
 * Every message a person SEES is plain language: what happened, in their words, and what to do next.
 * Fault codes (WIRE_005, RUNTIME_003 …) and internal names stay in the fault log, where they belong.
 *   PlainErrors.describe(fault, K) → { text, hint, level }   level: 'show' (toast) | 'quiet' (log only)
 *   PlainErrors.register(fn)        domains add sharper wording: fn(fault, ctx) → {text, hint?, level?} | null
 *   PlainErrors.isPlain(str)        true when a raw message is already fit for a person (no codes, no internals)
 * Domain-free: no domain word appears here; domains register their own phrasing. */
(function (global) {
  'use strict';
  const rules = [];
  const CODE = /\b[A-Z]{3,}_\d{3}\b/;
  const INTERNAL = /(\b[a-z]+(?:-[a-z]+)*-\d+-[a-z0-9]{3,}\b|\beravos\.|\.hook\.|_hook|snake|payload|schema|undefined|null\b|NaN|\[object|TypeError|ReferenceError|instance_?id|[a-z]+_[a-z_]+\b|\bctx\b|=>|\{|\}|\bat \w+ \()/;
  function isPlain(s) { s = String(s || '').trim(); return !!s && s.length <= 220 && !CODE.test(s) && !INTERNAL.test(s); }

  // the thing the fault is about, in words a person knows: the tool's label, a file name, or "this"
  function subject(f, K) {
    try {
      const id = f.instance_id || f.instanceId;
      if (id && K && K.registry && K.registry.get(id)) return K.registry.get(id).descriptor.label;
      if (f.organism_id && global.OrganismFactory && global.OrganismFactory.def(f.organism_id)) return global.OrganismFactory.def(f.organism_id).label;
    } catch (e) {}
    return null;
  }
  const quoteFile = (m) => { const x = String(m || '').match(/(?:^|:\s*|[“"])([^:“”"\n]{1,80}?\.[a-z0-9]{2,5})\b/i); const n = x && x[1].trim(); return n && !/^\d+(\.\d+)*$/.test(n) && !INTERNAL.test(n) && !CODE.test(n) ? '“' + n + '”' : null; };

  // generic wording per fault family — honest, short, with the next step
  function generic(f, K) {
    const who = subject(f, K), it = who || 'A tool', file = quoteFile(f.message);
    const c = f.fault_class || '';
    switch (c) {
      case 'WIRE_001': case 'WIRE_005': return { text: 'Those two can’t be connected — they don’t use the same kind of signal.', hint: 'Try another input on the window (the dots that light up while you drag are the ones that fit), or click the ⇢ plug for a list.' };
      case 'WIRE_002': return { text: 'That connection point no longer exists.', hint: 'The window may have changed or been closed — connect again.' };
      case 'WIRE_003': return { text: 'Connect an output to an input.', hint: 'Outputs are on the right edge of a window, inputs on the left.' };
      case 'WIRE_004': return { text: 'Those two are already connected.', level: 'quiet' };
      case 'WIRE_006': return { text: 'That would make a loop — the signal would feed back into itself.', hint: 'Connect it to something further along instead.' };
      case 'ASSET_001': return { text: `Couldn’t open ${file || 'that file'}.`, hint: 'It may be missing, damaged or still downloading. Try it again, or a different copy.' };
      case 'ASSET_002': return { text: `Couldn’t read ${file || 'that file'} — it may be damaged or in a format this build can’t decode.`, hint: 'Try a different copy, or convert it to a common format.' };
      case 'ASSET_003': return { text: `${file || 'That file'} changed or was damaged while loading.`, hint: 'Load it again from the original.' };
      case 'ASSET_004': return { text: `Nothing installed can open ${file || 'that kind of file'}.`, hint: 'Add the pack that understands it, or convert the file.' };
      case 'MOUNT_001': case 'DOMAIN_001': return { text: `${who ? who + ' needs' : 'That needs'} a pack that isn’t installed.`, hint: 'Add the pack (drop its .zip on the canvas), then try again.' };
      case 'MOUNT_002': return { text: `${it} can’t start — something it depends on isn’t available here.`, hint: 'Open ＋ Add: each tool lists what it needs.' };
      case 'MOUNT_003': return { text: 'That pack wasn’t added because its permissions were declined.', hint: 'Drop it again and choose Allow if you trust it.' };
      case 'MOUNT_004': return { text: 'That pack was made for a newer ERAVOS.', hint: 'Update ERAVOS to use it.' };
      case 'MOUNT_005': return { text: `${file || who || 'That pack or project'} looks damaged or incomplete, so it wasn’t loaded.`, hint: 'Nothing on your canvas changed. Try the original file again.' };
      case 'MOUNT_006': return { text: `${who ? who + ' is' : 'That is'} already on the canvas — only one is allowed.`, level: 'quiet' };
      case 'MOUNT_007': case 'CONSTRAINT_001': case 'CONSTRAINT_002': return { text: `${it}’s settings don’t fit together.`, hint: 'Undo the last change (Ctrl+Z), or load one of its presets.' };
      case 'RUNTIME_001': return { text: `${it} isn’t allowed to do that.`, hint: 'Its pack didn’t ask for that permission.' };
      case 'RUNTIME_002': return { text: `${it} ignored a setting it didn’t understand.`, level: 'quiet' };
      case 'RUNTIME_003': return { text: `${it} hit a problem and skipped that step. Your work is safe.`, hint: 'If it keeps happening, remove the window and add it again (Ctrl+Z brings it back).' };
      case 'RUNTIME_004': case 'RUNTIME_005': return { text: `${it} is busy — slowing down so nothing gets lost.`, level: 'quiet' };
      case 'MUTATION_001': return { text: 'That item doesn’t exist any more — it may have been removed.', level: 'quiet' };
      case 'MUTATION_002': case 'MUTATION_003': return { text: 'That change can’t be made here.', hint: 'Undo (Ctrl+Z) puts things back the way they were.' };
      case 'MUTATION_004': return { text: 'A change couldn’t be fully undone.', hint: 'Save a copy of your work now and reopen it to be safe.' };
      case 'DOMAIN_002': return { text: 'Two packs tried to add the same thing; the second one was skipped.', hint: 'Remove one of them if something looks wrong.' };
      case 'PORT_001': case 'PORT_002': case 'PORT_003': return { text: `Something inside ${who || 'a tool'} didn’t connect properly.`, hint: 'Remove the window and add it again (Ctrl+Z brings back the old one if needed).' };
      default: return { text: `${it} reported a problem.`, hint: 'Details are in the fault log (the dot at the top right).' };
    }
  }

  function describe(f, K) {
    f = f || {};
    if (f.quiet) return Object.assign(generic(f, K), { level: 'quiet' }); // the caller already told the person, in its own words
    for (const fn of rules) { try { const r = fn(f, { K, subject: subject(f, K), isPlain }); if (r && r.text) return Object.assign({ level: 'show' }, r); } catch (e) {} }
    const g = Object.assign({ level: 'show' }, generic(f, K));
    // a tool that wrote its own plain sentence gets to say it — it is more specific than the family wording
    // (only for tool-raised faults; kernel families keep their curated wording + the file name)
    const own = /^RUNTIME_00[23]$/.test(f.fault_class || '') || !f.fault_class || !/^[A-Z]+_\d{3}$/.test(f.fault_class);
    if (own && isPlain(f.message)) { g.level = 'show'; delete g.hint; } else return g;
    g.text = (subject(f, K) ? subject(f, K) + ': ' : '') + f.message.replace(/^\w/, (c) => c.toUpperCase()).replace(/\s*$/, '') + (/[.!?]$/.test(f.message.trim()) ? '' : '.');
    return g;
  }
  global.PlainErrors = { describe, register(fn) { if (typeof fn === 'function') rules.push(fn); }, isPlain, CODE };
})(typeof window !== 'undefined' ? window : globalThis);
