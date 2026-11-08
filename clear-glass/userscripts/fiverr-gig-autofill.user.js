// ==UserScript==
// @name         Fiverr gig autofill (James Brooks)
// @namespace    nexus.clear-glass.fiverr-gig
// @version      1.0.0
// @description  Fills Fiverr's gig editor from a written gig, page by page. Never presses Save, Continue or Publish.
// @match        https://www.fiverr.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==
//
// clear-glass/userscripts/fiverr-gig-autofill.user.js — FG5's userscript form, for a machine without Clear Glass (docs/2026-10-28-gated-flows-
// phasemap.spec, FG5 expanded 2026-11-08).
// James, 2026-11-08: "I need the automation. I’ve gone to do the fiverr post over and over. I need help with this." · "Nexus is to remove as
// much effort, beyond thinking as possible." · his rule 0.39.301: "Not automate talking or posting" — so nothing here clicks Save, Continue
// or Publish (FG_D3).
//
// The rules are Clear Glass's, learned from his screenshots (clear-glass/src/autofill/gig-pages.js SIGNS, gig-fields.js fieldScript,
// gig-pricing.js PRICING_LABELS): a page is known by its own words and its ?tab=; a box is found by the words of the section around it, never
// by a class name. Whatever is not found is said, and offered as a chip: click a box on the page, then the chip, and the chip fills that box.
//
// Install: the Tampermonkey extension, then open this file's raw link and press Install. Open Fiverr › Selling › Gigs › Create a new gig.

(function () {
  'use strict';

  // ── the gigs (docs/fiverr/gig-drafts.md; prices lowered 2026-11-08, his call) ─────────────────────────────────────────────
  const FAQ = [
    { question: 'Do you use AI?', answer: 'Yes, as a tool I direct. Every finding is checked against your code before it reaches you, and each one names the file and line.' },
    { question: 'Will you change my code?', answer: 'Only if you ask. The deliverable is a report or a plan.' },
    { question: 'What languages?', answer: 'JavaScript and TypeScript, Node, Python and web front ends are best. For anything else, ask first.' },
    { question: 'Is my code safe?', answer: 'It is used only for your order, never shared, and deleted after delivery on request.' },
  ];
  const GIGS = [
    {
      label: 'Gig 1: codebase audit',
      title: 'I will audit your codebase and give you a clear, prioritized fix report',
      category: 'Programming & Tech', subcategory: 'Software Development',
      tags: ['code review', 'codebase audit', 'technical debt', 'refactoring plan', 'security check'],
      description: "Inherited a messy project? Not sure what's broken, duplicated or risky? I'll map it and tell you, in plain language.\n\nYou get a report that lists, file by file:\n• broken imports and references that point nowhere\n• packages used but never declared\n• duplicate and dead files\n• credentials or secrets committed by accident\n• a dependency map: what uses what, and what a change can break\n• a prioritized fix list: what to fix first, and why\n\nEvery finding names the file and line, so you or your developer can check it yourself. Nothing is vague.\n\nHow I work: I build and direct AI-assisted analysis tools, and every result is checked against the code itself before it goes in your report. I never change your code unless you ask.\n\nSend me the repo (GitHub link or zip) and one sentence on what worries you most.",
      packages: {
        basic: { name: 'Quick scan', description: 'Up to 50 files: the findings list', deliveryDays: 2, revisions: 1, price: 15 },
        standard: { name: 'Full audit', description: 'Up to 300 files: findings and the dependency map', deliveryDays: 3, revisions: 2, price: 40 },
        premium: { name: 'Audit + plan', description: 'Up to 1,000 files: findings, map, and a phased fix plan with tests', deliveryDays: 5, revisions: 3, price: 90 },
      },
      faq: FAQ,
      requirements: ['Send the repo (GitHub link or zip) and one sentence on what worries you most.'],
    },
    {
      label: 'Gig 2: build plan for AI coders',
      title: 'I will turn your app idea into a phased build plan and spec AI coders can follow',
      category: 'Programming & Tech', subcategory: 'Software Development',
      tags: ['software spec', 'project plan', 'ai development', 'tech architecture', 'product requirements'],
      description: "AI coding tools build fast, and drift faster. They forget decisions, rebuild what exists, and skip tests. The fix is the plan they're given.\n\nI write that plan:\n• the end state first: what \"done\" means, as checks that pass or fail\n• every component specified: inputs, outputs, errors, acceptance tests\n• the work cut into small phases, each with the files it touches, what it depends on, and the test that proves it\n• a dependency graph, so nothing is built before what it needs\n• the decisions written down with the options you chose between, so they don't get lost or re-argued\n\nYou can hand it to Claude, Cursor, Copilot or a human developer, and they build in order, one checked phase at a time.\n\nThis is how I build my own multi-system platform: over 200 phase maps, each phase graphed and tested before it was built.\n\nSend me your idea, however rough. Voice notes are fine.",
      packages: {
        basic: { name: 'One feature', description: 'One feature: end state, spec, phases', deliveryDays: 2, revisions: 1, price: 20 },
        standard: { name: 'Full app plan', description: 'An MVP: every component specced, phased and graphed', deliveryDays: 4, revisions: 2, price: 60 },
        premium: { name: 'Plan + architecture', description: 'The full plan plus the system architecture: components, boundaries, data', deliveryDays: 7, revisions: 3, price: 130 },
      },
      faq: FAQ,
      requirements: ['Describe your idea, however rough: what it must do, who uses it, and how you will know it is done. Voice notes are fine.'],
    },
    {
      label: 'Gig 3: architecture design or review',
      title: 'I will design or review your software architecture for clean boundaries',
      category: 'Programming & Tech', subcategory: 'Software Development',
      tags: ['architecture review', 'system design', 'microservices', 'design review', 'scalability'],
      description: "When one part of your system breaks, does everything break? That's a boundary problem, and it gets more expensive every month it stays.\n\nI design systems, and review existing ones, around a few hard rules:\n• each part owns its own data and logic, and talks to the others only through a defined interface, so any part can be swapped\n• one door per part: the same commands for the UI, the API and automation\n• every failure is visible, never silent\n• the finished state is defined first, and the design is checked against it\n\nFor a review you get: a map of your current parts and how they're wired, every place one part reaches into another's internals, the failure modes (what breaks when X goes down), and a step-by-step plan to fix them, highest leverage first.\n\nFor a new design you get the architecture document, the boundaries, the interfaces, and a phased plan to build it.\n\nAI-assisted, human-directed. Every claim in my reports points at your code.",
      packages: {
        basic: { name: 'Quick review', description: 'One service or module: boundaries and failure modes', deliveryDays: 2, revisions: 1, price: 25 },
        standard: { name: 'Full review', description: 'The whole system: map, boundary violations, failure modes, fix plan', deliveryDays: 5, revisions: 2, price: 75 },
        premium: { name: 'Design', description: 'A new architecture or a redesign: document, interfaces, build plan', deliveryDays: 7, revisions: 3, price: 150 },
      },
      faq: FAQ,
      requirements: ['Send the repo or a description of the system, and what worries you most about it.'],
    },
  ];
  const TIERS = ['basic', 'standard', 'premium'];

  // ── which page of the editor is open (gig-pages.js SIGNS and TAB_OF) ──────────────────────────────────────────────────────
  const SIGNS = {
    overview: [/suggested categories/i, /gig metadata/i, /service type/i, /gig title/i, /select a category/i, /search tags/i, /positive keywords/i],
    pricing: [/scope\s*&\s*pricing/i, /\bpackages\b/i],
    description: [/description\s*&\s*faq/i, /briefly describe your gig/i, /frequently asked questions/i, /\badd faq\b/i],
    requirements: [/get all the information you need from buyers/i, /add new question/i, /answer type/i],
    gallery: [/gig gallery/i, /showcase your services/i, /images?\s*\(up to 3\)/i],
  };
  const TAB_OF = { general: 'overview', pricing: 'pricing', description: 'description', requirements: 'requirements', gallery: 'gallery' };
  function pageOf() {
    const hay = String((document.body && document.body.innerText) || '').slice(0, 8000);
    const tab = (/[?&]tab=(\w+)/i.exec(location.href) || [])[1];
    let best = null, bestScore = 1;
    for (const p of Object.keys(SIGNS)) {
      const s = SIGNS[p].filter(re => re.test(hay)).length + (tab && TAB_OF[tab.toLowerCase()] === p ? 2 : 0);
      if (s > bestScore) { best = p; bestScore = s; }
    }
    return best;
  }

  // ── finding a box by the words around it (gig-fields.js fieldScript) ─────────────────────────────────────────────────────
  const BOXES = 'input:not([type]),input[type="text"],input[type="number"],input[type="search"],textarea,[contenteditable="true"],[contenteditable=""]';
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const inPanel = el => !!(el.closest && el.closest('#cg-fiverr-panel'));
  function boxUnder(re, exclude, preferRich) {
    let best = null;
    for (const el of document.querySelectorAll(BOXES)) {
      if (!vis(el) || inPanel(el)) continue;
      if (el.parentElement && el.parentElement.closest('[contenteditable="true"]')) continue;
      const rich = el.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(el.tagName);
      let up = el.parentElement;
      for (let d = 1; d < 9 && up; d++, up = up.parentElement) {
        const own = String(up.innerText || up.textContent || ''), hit = re.test(own), bad = !!(exclude && exclude.test(own));
        if (!hit && !bad) continue;
        if (hit && !bad) { const score = d * 2 + (preferRich && !rich ? 1 : 0); if (!best || score < best.score) best = { el, score }; }
        break;
      }
    }
    return best ? best.el : null;
  }
  const byPlaceholder = re => [...document.querySelectorAll('input,textarea')].filter(el => vis(el) && !inPanel(el) && re.test(el.getAttribute('placeholder') || ''));

  // ── writing a value so the page's own code sees it (React reads input events, a rich editor reads insertText) ───────────────
  function setBox(el, text) {
    el.focus();
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(text));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return String(el.value) === String(text);
    }
    document.execCommand('selectAll', false, null);
    // in a rich editor every line break is already a paragraph, so a blank line between paragraphs would be doubled
    document.execCommand('insertText', false, String(text).replace(/\n{2,}/g, '\n'));
    return String(el.innerText || '').replace(/\s+/g, ' ').trim().length > 0;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pressEnter(el) {
    for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }

  // ── what each page takes, and how ─────────────────────────────────────────────────────────────────────────────────────────
  // each part: { label, value, find() → element | null, fill(el) } or { label, value, pick: true } for a dropdown (said, highlighted, copied)
  function partsFor(page, g) {
    const parts = [];
    if (page === 'overview') {
      parts.push({ label: 'Title', value: g.title.replace(/^I will\s+/i, ''), find: () => boxUnder(/gig title/i) });
      parts.push({ label: 'Category', value: `${g.category} › ${g.subcategory}`, pick: true });
      parts.push({ label: 'Tags', value: g.tags.join(', '), find: () => boxUnder(/positive keywords|search tags/i), tags: g.tags });
    } else if (page === 'pricing') {
      const names = () => byPlaceholder(/name your package/i), descs = () => byPlaceholder(/describe the details/i);
      TIERS.forEach((t, i) => {
        const p = g.packages[t], col = t.toUpperCase();
        parts.push({ label: `${col} name`, value: p.name, find: () => names()[i] || null });
        parts.push({ label: `${col} description`, value: p.description, find: () => descs()[i] || null });
        parts.push({ label: `${col} delivery`, value: `${p.deliveryDays} days`, pick: true });
        parts.push({ label: `${col} revisions`, value: String(p.revisions), pick: true });
        parts.push({ label: `${col} price`, value: String(p.price), find: () => priceBoxes()[i] || null });
      });
    } else if (page === 'description') {
      parts.push({ label: 'Description', value: g.description, find: () => boxUnder(/description/i, /frequently asked|\bfaq\b/i, true) });
      g.faq.forEach((f, i) => {
        parts.push({ label: `FAQ ${i + 1} question`, value: f.question, find: null });
        parts.push({ label: `FAQ ${i + 1} answer`, value: f.answer, find: null });
      });
    } else if (page === 'requirements') {
      g.requirements.forEach((q, i) => parts.push({ label: `Question ${i + 1}`, value: q, find: null }));
    }
    return parts;
  }
  // the price row: the boxes in the same row as a cell that says "Price", in column order
  function priceBoxes() {
    const label = [...document.querySelectorAll('td,th,div,span,label')].find(el => vis(el) && !inPanel(el) && /^\s*price\s*$/i.test(el.textContent || ''));
    if (!label) return [];
    let row = label.closest('tr') || label.parentElement;
    for (let d = 0; d < 4 && row; d++, row = row.parentElement) {
      const boxes = [...row.querySelectorAll('input')].filter(el => vis(el) && !inPanel(el));
      if (boxes.length >= 3) return boxes.slice(0, 3);
    }
    return [];
  }

  // ── the panel ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  let lastBox = null;
  document.addEventListener('focusin', e => { const t = e.target; if (t && !inPanel(t) && t.matches && t.matches(BOXES)) lastBox = t; }, true);
  let gigIndex = Number(localStorage.getItem('cg-fiverr-gig') || 0) || 0;
  const panel = document.createElement('div');
  panel.id = 'cg-fiverr-panel';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;width:330px;max-height:70vh;overflow:auto;background:#fff;color:#111;' +
    'border:2px solid #1dbf73;border-radius:10px;padding:10px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
  document.body.appendChild(panel);
  const copy = text => { try { GM_setClipboard(text); } catch (_) { navigator.clipboard && navigator.clipboard.writeText(text); } };

  const shown = {};   // what the last fill of each page found, so a redraw keeps its marks
  function render(statuses) {
    const page = pageOf(), g = GIGS[gigIndex];
    if (statuses) shown[page + gigIndex] = statuses; else statuses = shown[page + gigIndex];
    panel.innerHTML = '';
    const h = document.createElement('div');
    h.innerHTML = `<b>Gig autofill</b> · page: <b>${page || 'not a gig editor page'}</b>`;
    panel.appendChild(h);
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;margin:6px 0';
    GIGS.forEach((x, i) => { const o = document.createElement('option'); o.value = i; o.textContent = x.label; if (i === gigIndex) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { gigIndex = Number(sel.value); localStorage.setItem('cg-fiverr-gig', gigIndex); render(); };
    panel.appendChild(sel);
    if (!page) { panel.appendChild(note('Open Fiverr › Selling › Gigs › Create a new gig. This panel fills each page; you press Save & Continue and Publish.')); return; }
    const parts = partsFor(page, g);
    if (page === 'gallery') { panel.appendChild(note('Gallery: add one image yourself (a screenshot of a report, or a card with the title). Then Publish is yours.')); return; }
    const go = document.createElement('button');
    go.textContent = 'Fill this page';
    go.style.cssText = 'width:100%;padding:8px;margin:4px 0 8px;background:#1dbf73;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer';
    go.onclick = async () => render(await fillPage(parts));
    panel.appendChild(go);
    parts.forEach((p, i) => {
      const st = statuses && statuses[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:3px 0';
      const mark = st === 'ok' ? '✓' : p.pick ? '☐' : st === 'missing' ? '•' : '·';
      const chip = document.createElement('button');
      chip.textContent = `${mark} ${p.label}`;
      chip.title = p.value;
      chip.style.cssText = `flex:1;text-align:left;padding:4px 6px;border-radius:5px;cursor:pointer;border:1px solid ${st === 'ok' ? '#1dbf73' : p.pick ? '#f5a623' : '#bbb'};background:${st === 'ok' ? '#e9fbf2' : '#fafafa'}`;
      chip.onmousedown = e => e.preventDefault();   // keep the page's box focused
      chip.onclick = () => {
        if (p.pick) { copy(p.value); chip.textContent = `☐ ${p.label}: pick "${p.value}" (copied)`; return; }
        if (lastBox && document.contains(lastBox)) {
          if (p.tags) typeTags(lastBox, p.tags); else setBox(lastBox, p.value);
          chip.textContent = `✓ ${p.label}`;
        }
        else { copy(p.value); chip.textContent = `${p.label}: copied — click a box, then this again to fill it`; }
      };
      row.appendChild(chip);
      panel.appendChild(row);
    });
    panel.appendChild(note('✓ filled · ☐ a dropdown to pick (click to copy) · • not found: click the box on the page, then the chip. Save & Continue and Publish are yours.'));
  }
  function note(text) { const n = document.createElement('div'); n.style.cssText = 'color:#555;font-size:12px;margin-top:6px'; n.textContent = text; return n; }

  // tags: typed one by one, each with Enter, as the Search tags box takes them (gig-pages.js tagInputScript)
  async function typeTags(el, tags) {
    for (const tag of tags) { setBox(el, tag); await sleep(250); pressEnter(el); await sleep(350); }
  }
  async function fillPage(parts) {
    const out = [];
    for (const p of parts) {
      if (p.pick) { out.push('pick'); continue; }
      const el = p.find ? p.find() : null;
      if (!el) { out.push('missing'); continue; }
      if (p.tags) {
        await typeTags(el, p.tags);
        out.push('ok');
      } else {
        out.push(setBox(el, p.value) ? 'ok' : 'missing');
        await sleep(150);
      }
    }
    return out;
  }

  render();
  // the editor is one page that changes its content: re-read which page is open when the address or the headings change
  let lastKey = '';
  setInterval(() => {
    const key = location.href + '|' + pageOf();
    if (key !== lastKey) { lastKey = key; render(); }
  }, 1500);
})();
