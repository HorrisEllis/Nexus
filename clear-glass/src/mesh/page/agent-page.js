/**
 * clear-glass/src/mesh/page/agent-page.js — runs INSIDE an AI chat page (injected via the driver).
 * 2026-09-19 (docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec). Installs window.__cgAgent.
 *
 * BUILT FOR CODING WHOLE CODE BASES, which changes every default:
 *  - INJECTION: prompts can be megabytes. Text areas take the value in one native-setter write. Rich editors
 *    (contenteditable) get a synthetic paste first, then chunked execCommand('insertText'), then textContent.
 *    Bulk `content` above `inlineMax` is ATTACHED AS A FILE (input[type=file]) and only the instruction is typed.
 *    Everything is VERIFIED before sending; a failed injection is `sent:false` (safe to fall back).
 *  - OUTPUT: the response is converted DOM -> markdown, keeping fenced code blocks WITH language and indentation
 *    (innerText, which the userscripts use, drops the fences and flattens code). Long answers that stop at a
 *    length limit show a "Continue" button: it is clicked and the segments are joined.
 *  - TIME: generation can run for many minutes. There is no short timeout: completion means "no longer generating
 *    AND quiet", with a stall guard (no growth for `stallMs`) and an overall cap. The host POLLS this state, so a
 *    page-side promise never has to survive a long IPC call.
 *  - SENT IS THREE-VALUED. true = confirmed; false = provably nothing was sent (safe to fall back); null = we
 *    clicked send but cannot confirm (a large paste can take a long time to be accepted). null must NEVER be
 *    resent: the host treats it like true.
 *
 * Stages: no_login, captcha, input_not_found, inject_failed, attach_failed, send_not_found, send_unconfirmed,
 * response_not_found, rate_limited, stalled, timeout, page_navigated, aborted.
 */
(function () {
  'use strict';
  var VERSION = 3;
  if (window.__cgAgent && window.__cgAgent.version === VERSION) return;
  var JOBS = (window.__cgJobs = window.__cgJobs || {});

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var now = function () { return Date.now(); };
  var qsa = function (sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } };
  var norm = function (s) { return String(s || '').replace(/\s+/g, ''); };

  function visible(el) {
    if (!el || el.hidden) return false;
    try {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch (e) {}
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    var layout = document.documentElement && document.documentElement.getBoundingClientRect().width > 0;
    if (layout && r && r.width === 0 && r.height === 0) return false;
    return true;
  }
  function firstVisible(sel) { var l = qsa(sel).filter(visible); return l.length ? l[l.length - 1] : (qsa(sel)[0] || null); }

  // ── DOM -> markdown (keeps fenced code with language + indentation) ─────────────────────────────
  var SKIP = { SCRIPT: 1, STYLE: 1, SVG: 1, BUTTON: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  function codeFence(text, lang) {
    var f = '```'; while (text.indexOf(f) !== -1) f += '`';
    return '\n\n' + f + (lang || '') + '\n' + text.replace(/\n+$/, '') + '\n' + f + '\n\n';
  }
  function langOf(pre, code) {
    var c = (code && code.className || '') + ' ' + (pre.className || '');
    var m = /(?:language|lang)-([\w+#.-]+)/i.exec(c);
    if (m) return m[1];
    return (pre.getAttribute('data-language') || (code && code.getAttribute('data-language')) || '').toLowerCase();
  }
  function inline(node, ctx) {
    var out = '';
    for (var i = 0; i < node.childNodes.length; i++) out += toMd(node.childNodes[i], ctx);
    return out;
  }
  function toMd(node, ctx) {
    ctx = ctx || { depth: 0 };
    if (node.nodeType === 3) return ctx.pre ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (SKIP[tag.toUpperCase()] || node.getAttribute('aria-hidden') === 'true') return '';
    tag = tag.toLowerCase();
    if (tag === 'pre') {
      var clone = node.cloneNode(true);
      qsa('button,[role=button],svg', clone).forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
      var code = clone.querySelector('code');
      return codeFence((code || clone).textContent, langOf(node, node.querySelector('code')));
    }
    if (tag === 'code') return '`' + node.textContent + '`';
    if (/^h[1-6]$/.test(tag)) return '\n\n' + new Array(+tag[1] + 1).join('#') + ' ' + inline(node, ctx).trim() + '\n\n';
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'strong' || tag === 'b') return '**' + inline(node, ctx) + '**';
    if (tag === 'em' || tag === 'i') return '*' + inline(node, ctx) + '*';
    if (tag === 'a') { var t = inline(node, ctx); var h = node.getAttribute('href'); return h && t.trim() ? '[' + t + '](' + h + ')' : t; }
    if (tag === 'blockquote') return '\n\n' + inline(node, ctx).trim().split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n\n';
    if (tag === 'ul' || tag === 'ol') {
      var n = 0, lines = [];
      for (var i = 0; i < node.children.length; i++) {
        var li = node.children[i]; if (li.tagName.toLowerCase() !== 'li') continue;
        n++;
        var body = inline(li, { depth: ctx.depth + 1 }).trim().replace(/\n/g, '\n' + '  ');
        lines.push(new Array(ctx.depth * 2 + 1).join(' ') + (tag === 'ol' ? n + '. ' : '- ') + body);
      }
      return '\n' + lines.join('\n') + '\n';
    }
    if (tag === 'table') {
      var rows = qsa('tr', node).map(function (tr) { return qsa('th,td', tr).map(function (c) { return c.textContent.trim().replace(/\|/g, '\\|'); }); });
      if (!rows.length) return '';
      var out = ['| ' + rows[0].join(' | ') + ' |', '| ' + rows[0].map(function () { return '---'; }).join(' | ') + ' |'];
      rows.slice(1).forEach(function (r) { out.push('| ' + r.join(' | ') + ' |'); });
      return '\n\n' + out.join('\n') + '\n\n';
    }
    if (tag === 'p') return '\n\n' + inline(node, ctx).trim() + '\n\n';
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'li') return '\n' + inline(node, ctx) + '\n';
    return inline(node, ctx);
  }
  function markdown(el) { return toMd(el).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

  // ── injection ───────────────────────────────────────────────────────────────────────────────────
  function readInput(el) { return el.value !== undefined && el.tagName !== 'DIV' ? el.value : (el.innerText || el.textContent || ''); }
  function attachmentCount() { return qsa('[data-testid*="attachment" i],[data-testid*="file" i],[class*="attachment" i],[class*="file-chip" i],[aria-label*="attachment" i]').length; }

  function nativeSet(el, text) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function setInputText(el, text) {
    el.focus && el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') { nativeSet(el, text); return 'native'; }
    var before = attachmentCount();
    try { var sel = window.getSelection(); sel.selectAllChildren(el); document.execCommand && document.execCommand('delete'); } catch (e) {}
    try {                                                    // rich editors handle paste (and may turn big pastes into attachments)
      var dt = new window.DataTransfer(); dt.setData('text/plain', text);
      var ev = new window.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      await sleep(150);
      if (accepted(el, text, before)) return 'paste';
    } catch (e) {}
    try {                                                    // chunked insertText: one giant call freezes the tab
      if (document.execCommand) {
        var ok = true;
        for (var i = 0; i < text.length && ok; i += 8000) { ok = document.execCommand('insertText', false, text.slice(i, i + 8000)); await sleep(0); }
        if (ok && accepted(el, text, before)) return 'insertText';
      }
    } catch (e) {}
    el.textContent = text;                                   // last resort
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'textContent';
  }
  function accepted(el, text, attBefore) {
    if (norm(readInput(el)).length >= norm(text).length * 0.97) return true;
    return attachmentCount() > attBefore;                    // big pastes become an attachment pill: not text in the box
  }
  async function attachFile(name, text, fileSel) {
    var inputs = qsa(fileSel || 'input[type="file"]');
    var inp = inputs.filter(function (i) { return !i.accept || /text|\.txt|\*|\.md|\.json/i.test(i.accept); })[0] || inputs[0];
    if (!inp) return false;
    var file = new window.File([text], name, { type: 'text/plain' });
    try { var dt = new window.DataTransfer(); dt.items.add(file); inp.files = dt.files; }
    catch (e) { Object.defineProperty(inp, 'files', { configurable: true, value: { 0: file, length: 1, item: function () { return file; } } }); }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    for (var i = 0; i < 40; i++) { if ((document.body.innerText || document.body.textContent || '').indexOf(name) !== -1) return true; await sleep(250); }
    return false;
  }

  // ── page state probes ──────────────────────────────────────────────────────────────────────────
  var GEN_SEL = '[data-is-streaming="true"],[aria-label*="Stop" i],[data-testid*="stop" i],button[aria-label*="stop" i],[class*="streaming" i],.result-streaming';
  var generating = function () { return qsa(GEN_SEL).some(visible); };
  var LIMIT_RE = /(rate limit|usage limit|too many requests|reached (your|the) (message|usage|daily) limit|message limit|try again (later|in))/i;
  function checkBlockers() {
    if (qsa('iframe[src*="captcha" i],iframe[src*="challenge" i],[id*="captcha" i]').some(visible) || /verify you are human|are you a robot/i.test((document.body.innerText || '').slice(0, 4000))) return 'captcha';
    return null;
  }
  function looksLoggedOut() { return qsa('input[type="password"]').some(visible) || /\/(login|signin|sign-in|auth)\b/i.test(location.pathname); }
  function clickContinue() {
    var b = qsa('button,[role="button"]').filter(visible).filter(function (x) { return /^\s*(continue( generating)?|keep going)\s*$/i.test(x.innerText || x.textContent || ''); })[0];
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }

  // ── the job pipeline ───────────────────────────────────────────────────────────────────────────
  function fail(job, stage, sent, error) { job.done = true; job.ok = false; job.stage = stage; job.sent = sent; job.error = error || stage; job.endedAt = now(); return job; }

  async function run(job) {
    var S = job.selectors, O = job.opts;
    try {
      var blocker = checkBlockers();
      if (blocker) return fail(job, blocker, false);
      var input = firstVisible(S.input);
      for (var hw = 0; !input && hw < O.inputWaitMs / 250; hw++) {          // SPAs hydrate after load: give the input time to exist
        if (checkBlockers()) return fail(job, checkBlockers(), false);
        if (looksLoggedOut()) break;
        await sleep(250); input = firstVisible(S.input);
      }
      if (!input) return fail(job, looksLoggedOut() ? 'no_login' : 'input_not_found', false);
      job.phase = 'inject';
      var baseline = qsa(S.resp).length;
      var content = job.content || '', prompt = job.prompt || '', text;
      if (content && content.length > O.inlineMax) {
        var okFile = await attachFile('codebase-' + job.id.slice(0, 8) + '.txt', content, S.file);
        if (!okFile) return fail(job, 'attach_failed', false, 'could not attach ' + content.length + ' chars as a file');
        text = prompt || 'The attached file contains the full context. Follow the instruction in it.';
        job.via = 'attachment';
      } else { text = content ? (prompt ? prompt + '\n\n' + content : content) : prompt; }
      var how = await setInputText(input, text);
      job.via = job.via || how;
      if (how === 'textContent' && !accepted(input, text, -1) && norm(readInput(input)).length < norm(text).length * 0.97) return fail(job, 'inject_failed', false, 'input did not accept the text');
      job.phase = 'send';
      var sendBtn = null;
      for (var t = 0; t < O.sendWaitMs / 250 && !sendBtn; t++) { var c = firstVisible(S.send); if (c && !c.disabled && c.getAttribute('aria-disabled') !== 'true') sendBtn = c; else await sleep(250); }
      if (!sendBtn) return fail(job, 'send_not_found', false);
      var lenBefore = norm(readInput(input)).length;
      sendBtn.click();
      job.clickedAt = now();
      var confirmed = false;
      for (var w = 0; w < O.confirmMs / 250 && !confirmed; w++) {
        await sleep(250);
        confirmed = norm(readInput(input)).length < lenBefore * 0.1 || generating() || qsa(S.resp).length > baseline;
      }
      if (!confirmed) { job.sent = null; return fail(job, 'send_unconfirmed', null, 'clicked send but could not confirm it was accepted'); }
      job.sent = true;
      return await observe(job, baseline);
    } catch (e) { return fail(job, 'inject_failed', job.sent === true ? true : (job.clickedAt ? null : false), String(e && e.message || e)); }
  }

  async function observe(job, baseline) {
    var S = job.selectors, O = job.opts, started = now(), lastChange = now(), lastText = '', seen = false;
    job.phase = 'wait';
    job.continues = job.continues || 0;
    while (!job.abort) {
      await sleep(O.pollMs);
      if (location.href !== job.url0 && !O.allowNav) return fail(job, 'page_navigated', true);
      var nodes = qsa(S.resp).slice(Math.max(0, baseline));
      var text = nodes.map(markdown).filter(Boolean).join('\n\n');
      if (text !== lastText) { lastText = text; lastChange = now(); job.chars = text.length; seen = seen || !!text; }
      var gen = generating();
      job.generating = gen; job.elapsedMs = now() - started;
      if (LIMIT_RE.test(text.slice(-400)) && !gen && text.length < 600) return fail(job, 'rate_limited', true, text.slice(-200));
      if (!gen && seen && now() - lastChange >= O.quietMs) {
        if (job.continues < O.maxContinues && clickContinue()) { job.continues++; lastChange = now(); continue; }
        job.text = text; job.ok = true; job.done = true; job.stage = null; job.endedAt = now(); job.phase = 'done';
        return job;
      }
      if (!seen && now() - started > O.firstTokenMs) return fail(job, 'response_not_found', true, 'no response text appeared for ' + S.resp);
      if (seen && now() - lastChange > O.stallMs) { job.text = text; return fail(job, 'stalled', true, 'no new output for ' + O.stallMs + 'ms'); }
      if (now() - started > O.maxMs) { job.text = text; return fail(job, 'timeout', true); }
    }
    return fail(job, 'aborted', job.sent === true ? true : job.sent);
  }

  var DEFAULT_OPTS = { inputWaitMs: 15000, inlineMax: 120000, sendWaitMs: 10000, confirmMs: 30000, pollMs: 400, quietMs: 4000, firstTokenMs: 120000, stallMs: 600000, maxMs: 4 * 3600000, maxContinues: 30 };

  window.__cgAgent = {
    version: VERSION,
    markdown: markdown,
    start: function (o) {
      if (JOBS[o.jobId]) return { started: false, existing: true, jobId: o.jobId };      // idempotent: never inject twice
      var job = JOBS[o.jobId] = { id: o.jobId, selectors: o.selectors, prompt: o.prompt, content: o.content, opts: Object.assign({}, DEFAULT_OPTS, o.opts || {}),
        phase: 'start', done: false, ok: false, sent: false, stage: null, url0: location.href, startedAt: now(), chars: 0, continues: 0 };
      run(job);
      return { started: true, jobId: o.jobId };
    },
    read: function (o) {                                         // re-read an ALREADY SENT job with repaired selectors (no resend)
      var job = JOBS[o.jobId]; if (!job) return { ok: false, error: 'unknown job' };
      job.selectors = Object.assign({}, job.selectors, o.selectors || {});
      job.done = false; job.ok = false; job.stage = null; job.error = null; job.abort = false;
      var n = qsa(job.selectors.resp).length;
      observe(job, Math.max(0, n - 1));
      return { started: true, jobId: o.jobId };
    },
    poll: function (jobId) {
      var j = JOBS[jobId]; if (!j) return { known: false };
      return { known: true, phase: j.phase, done: j.done, ok: j.ok, sent: j.sent, stage: j.stage, error: j.error || null, chars: j.chars || 0, generating: !!j.generating,
        continues: j.continues || 0, elapsedMs: j.elapsedMs || (now() - j.startedAt), via: j.via || null, text: j.done ? (j.text || '') : undefined, url: location.href };
    },
    abort: function (jobId) { var j = JOBS[jobId]; if (j) j.abort = true; return !!j; },
    forget: function (jobId) { delete JOBS[jobId]; return true; },
    preflight: function (S) {
      var b = checkBlockers(); if (b) return { ok: false, stage: b };
      var i = firstVisible(S.input); if (!i) return { ok: false, stage: looksLoggedOut() ? 'no_login' : 'input_not_found' };
      return { ok: true, inputFound: true, sendFound: !!firstVisible(S.send), respCount: qsa(S.resp).length };
    },
    map: function () { return mapDom(); },
  };

  // ── automatic DOM mapping (diagnose + repair) ──────────────────────────────────────────────────
  var esc = function (x) { return (window.CSS && window.CSS.escape) ? window.CSS.escape(x) : String(x).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); };
  var HASHY = /[a-z]+[-_][a-f0-9]{5,}|\d{4,}|^[a-z]{1,2}\d/i;
  function selectorFor(el) {
    var tag = el.tagName.toLowerCase(), attrs = ['data-testid', 'data-message-author-role', 'data-role', 'role', 'aria-label', 'placeholder', 'name', 'type'];
    if (el.id && !HASHY.test(el.id) && qsa('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
    for (var i = 0; i < attrs.length; i++) {
      var v = el.getAttribute && el.getAttribute(attrs[i]);
      if (v && !HASHY.test(v) && v.length < 80) { var s = tag + '[' + attrs[i] + '="' + v.replace(/"/g, '\\"') + '"]'; if (qsa(s).length >= 1 && qsa(s).indexOf(el) !== -1 && qsa(s).length <= 3) return s; }
    }
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return tag + '[contenteditable="true"]';
    var cls = (el.className && el.className.split ? el.className.split(/\s+/) : []).filter(function (c) { return c && !HASHY.test(c); });
    for (var j = 0; j < cls.length; j++) { var s2 = tag + '.' + esc(cls[j]); if (qsa(s2).indexOf(el) !== -1) return s2; }
    return tag;
  }
  function mapDom() {
    var kw = /message|ask|prompt|chat|reply|talk|type|write|send/i;
    var inputs = qsa('textarea,[contenteditable="true"],[role="textbox"],input[type="text"],input:not([type])').filter(visible).map(function (el) {
      var r = el.getBoundingClientRect(), why = [], sc = 0;
      var label = (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('data-testid') || '');
      if (kw.test(label)) { sc += 3; why.push('label'); }
      if (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true') { sc += 2; why.push('editable'); }
      if (el.closest('form')) { sc += 1; why.push('in-form'); }
      if (r && r.top > (window.innerHeight || 800) / 2) { sc += 1; why.push('lower-half'); }
      if (el.type === 'search' || /search/i.test(label)) sc -= 3;
      sc += Math.min(2, ((r && r.width * r.height) || 0) / 60000);
      return { el: el, selector: selectorFor(el), score: +sc.toFixed(2), why: why.join(',') };
    }).sort(function (a, b) { return b.score - a.score; });
    var best = inputs[0] && inputs[0].el, sends = [];
    if (best) {
      var scope = best; for (var up = 0; up < 5 && scope.parentElement; up++) scope = scope.parentElement;
      var bad = /attach|upload|voice|mic|record|stop|plus|settings|menu|search|copy|regenerate|new chat/i;
      sends = qsa('button,[role="button"]', scope).filter(visible).filter(function (b) { return b !== best && !best.contains(b); }).map(function (b) {
        var label = (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-testid') || '') + ' ' + (b.innerText || '') + ' ' + (b.title || ''), sc = 0, why = [];
        if (/send|submit|arrow|↑|➤/i.test(label)) { sc += 4; why.push('label'); }
        if (b.type === 'submit') { sc += 3; why.push('submit'); }
        if (b.querySelector('svg')) { sc += 1; why.push('icon'); }
        if (bad.test(label)) sc -= 5;
        if (best.compareDocumentPosition(b) & 4) { sc += 1; why.push('after-input'); }
        return { selector: selectorFor(b), score: +sc.toFixed(2), why: why.join(','), el: b };
      }).filter(function (c) { return c.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    }
    var formOf = best && best.closest('form');
    var resps = qsa('[data-message-author-role="assistant"],[class*="markdown"],[class*="prose"],message-content,[class*="message-content"],[class*="response"],[class*="assistant"],article').filter(visible).filter(function (el) {
      return !(formOf && formOf.contains(el)) && (el.textContent || '').trim().length > 0;
    }).map(function (el) {
      var sc = 0, why = [];
      if (el.querySelector('pre,p,li')) { sc += 2; why.push('rich'); }
      if (el.getAttribute('data-message-author-role') === 'assistant') { sc += 4; why.push('role=assistant'); }
      if (/markdown|prose|message-content|assistant|response/i.test(el.className || '')) { sc += 2; why.push('class'); }
      sc += Math.min(2, (el.textContent || '').length / 2000);
      if (el.querySelectorAll('[class*="markdown"],[class*="prose"]').length) sc -= 1;    // prefer the inner-most content node
      return { selector: selectorFor(el), score: +sc.toFixed(2), why: why.join(','), el: el };
    }).sort(function (a, b) { return b.score - a.score; });
    var strip = function (l) { return l.slice(0, 5).map(function (c) { return { selector: c.selector, score: c.score, why: c.why, matches: qsa(c.selector).length }; }); };
    return { input: strip(inputs), send: strip(sends), resp: strip(resps), url: location.href, title: document.title };
  }
})();
