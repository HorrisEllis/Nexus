(function() {
  if (window.__gPickerActive) { window.__gPickerActive.destroy?.(); }
  if (window.__cgPicker) { try { window.__cgPicker.destroy(); } catch (_) {} }
  // §0.59.2 — James: "the popup … cant close it." Every toggle of the picker runs this file again; destroy() closed the
  // popups but left their elements, so a second run added a SECOND #__g-popup with the same ids — the buttons were wired
  // (getElementById) to the first, hidden one, and the ✕ on the one he saw did nothing. Anything left by an earlier run
  // is removed first, and destroy() now removes what it made.
  for (const n of document.querySelectorAll('[id^="__g-"]')) { try { n.remove(); } catch (_) {} }
  const _life = new AbortController();   // the listeners that live as long as this run (the global ESC)

  // ── Injected styles — VERBATIM from the real, original Guardian
  // content.js (v3.4.0), byte-for-byte, per James: "do not change any
  // css, style, themes, any thing about how it looks." Extracted
  // programmatically from the archive, not retyped, to guarantee
  // fidelity. ─────────────────────────────────────────────────────────
  const STYLE = document.createElement('style');
  STYLE.id = '__g-style';
  STYLE.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Rajdhani:wght@600;700&display=swap');

    #__g-mask {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0);
      z-index: 2147483640; pointer-events: none;
      transition: background 0.2s ease;
    }
    #__g-mask.on { background: rgba(0,0,0,0.6); }

    #__g-sel {
      position: fixed; z-index: 2147483641; pointer-events: none;
      border: 2px solid #00ffa3; border-radius: 3px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.58), 0 0 0 3px rgba(0,255,163,0.25),
                  0 0 18px rgba(0,255,163,0.4), inset 0 0 0 1px rgba(0,255,163,0.12);
      display: none;
      transition: top 0.04s, left 0.04s, width 0.04s, height 0.04s;
    }
    #__g-sel.listener-mode {
      border-color: #cc44ff;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.58), 0 0 0 3px rgba(204,68,255,0.25),
                  0 0 18px rgba(204,68,255,0.4), inset 0 0 0 1px rgba(204,68,255,0.12);
    }
    #__g-sel::before, #__g-sel::after, #__g-sel-c::before, #__g-sel-c::after {
      content: ''; position: absolute; width: 9px; height: 9px;
      border-color: #00ffa3; border-style: solid;
    }
    #__g-sel.listener-mode::before, #__g-sel.listener-mode::after,
    #__g-sel.listener-mode ~ * ::before, #__g-sel.listener-mode ~ * ::after {
      border-color: #cc44ff;
    }
    #__g-sel::before  { top: -2px; left: -2px;   border-width: 2px 0 0 2px; }
    #__g-sel::after   { top: -2px; right: -2px;  border-width: 2px 2px 0 0; }
    #__g-sel-c { position: absolute; inset: 0; pointer-events: none; }
    #__g-sel-c::before { bottom: -2px; left: -2px;  border-width: 0 0 2px 2px; }
    #__g-sel-c::after  { bottom: -2px; right: -2px; border-width: 0 2px 2px 0; }

    #__g-sel-scan {
      position: absolute; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent 0%, rgba(0,255,163,0.7) 50%, transparent 100%);
      animation: g-scan 1.4s ease-in-out infinite; pointer-events: none;
    }
    #__g-sel.listener-mode #__g-sel-scan {
      background: linear-gradient(90deg, transparent 0%, rgba(204,68,255,0.7) 50%, transparent 100%);
    }
    @keyframes g-scan { 0% { top: 0%; opacity: 0; } 5% { opacity: 1; } 95% { opacity: 1; } 100% { top: 100%; opacity: 0; } }

    #__g-overlay {
      position: fixed; inset: 0; z-index: 2147483642;
      pointer-events: none; cursor: crosshair;
    }
    #__g-overlay.picking { pointer-events: none; cursor: crosshair; }

    #__g-tip {
      position: fixed; z-index: 2147483647;
      background: #080c10; border: 1px solid rgba(0,255,163,0.5);
      border-left: 2px solid #00ffa3; border-radius: 2px;
      padding: 5px 10px; font: 500 11px/1.4 'IBM Plex Mono', monospace;
      pointer-events: none; max-width: 280px; white-space: nowrap; display: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.8), 0 0 8px rgba(0,255,163,0.15);
    }
    #__g-tip.listener-mode { border-color: rgba(204,68,255,0.5); border-left-color: #cc44ff; }
    #__g-tip-tag { font-family: 'Rajdhani', sans-serif; font-size: 9px; letter-spacing: 0.12em; color: rgba(0,255,163,0.5); margin-bottom: 2px; }
    #__g-tip.listener-mode #__g-tip-tag { color: rgba(204,68,255,0.6); }
    #__g-tip-sel { color: #00ffa3; font-size: 11px; }
    #__g-tip.listener-mode #__g-tip-sel { color: #cc44ff; }
    #__g-tip-dims { font-size: 9px; color: rgba(0,255,163,0.4); margin-top: 1px; }

    #__g-esc {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483648; background: rgba(8,12,16,0.92);
      border: 1px solid rgba(0,255,163,0.25); padding: 5px 16px;
      font: 10px/1.5 'IBM Plex Mono', monospace; color: rgba(0,255,163,0.6);
      border-radius: 2px; pointer-events: none; display: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.6);
    }
    #__g-esc.listener-mode { border-color: rgba(204,68,255,0.35); color: rgba(204,68,255,0.7); }
    #__g-esc.show { display: block; animation: g-fadein 0.2s ease; }
    @keyframes g-fadein { from { opacity:0; transform: translateX(-50%) translateY(-4px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }

    /* ── Callto Popup ── */
    #__g-popup {
      position: fixed; z-index: 2147483649; width: 330px;
      background: #080c10; border: 1px solid rgba(0,255,163,0.3);
      border-top: 2px solid #00ffa3; border-radius: 3px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.85), 0 0 20px rgba(0,255,163,0.1);
      font-family: 'IBM Plex Mono', monospace; display: none; overflow: hidden;
    }
    #__g-popup.listener-mode { border-color: rgba(204,68,255,0.3); border-top-color: #cc44ff; }
    #__g-popup.show { display: block; animation: g-popup-in 0.18s ease-out; }
    @keyframes g-popup-in { from { opacity:0; transform: scale(0.96) translateY(6px); } to { opacity:1; transform: scale(1) translateY(0); } }

    #__g-popup-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 11px; background: rgba(0,255,163,0.06);
      border-bottom: 1px solid rgba(0,255,163,0.15);
    }
    #__g-popup.listener-mode #__g-popup-hdr { background: rgba(204,68,255,0.06); border-bottom-color: rgba(204,68,255,0.15); }
    #__g-popup-title { font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.15em; color: #00ffa3; }
    #__g-popup.listener-mode #__g-popup-title { color: #cc44ff; }
    #__g-popup-close { background: none; border: none; cursor: pointer; color: rgba(0,255,163,0.4); font-size: 14px; line-height: 1; padding: 0 2px; }
    #__g-popup-close:hover { color: #00ffa3; }
    #__g-popup-body { padding: 10px 11px; }

    .gf { margin-bottom: 8px; }
    .gf-label { font-size: 10px; letter-spacing: 0.14em; color: rgba(200,220,240,0.35); text-transform: uppercase; margin-bottom: 3px; }
    .gf-val { font-size: 12px; color: #00c8ff; background: rgba(0,200,255,0.06); border: 1px solid rgba(0,200,255,0.15); border-radius: 2px; padding: 4px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gf-input {
      width: 100%; font: 12px/1.4 'IBM Plex Mono', monospace; color: #c8d8e8;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 2px; padding: 4px 8px; outline: none; transition: border-color 0.15s;
    }
    .gf-input:focus { border-color: rgba(0,255,163,0.4); color: #00ffa3; }

    #__g-ct-id-row { display: flex; align-items: center; gap: 5px; }
    #__g-ct-id { flex: 1; font: 9px/1.4 'IBM Plex Mono', monospace; color: rgba(0,255,163,0.5); background: transparent; border: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #__g-ct-regen { background: none; border: none; cursor: pointer; color: rgba(0,255,163,0.35); font-size: 13px; line-height: 1; padding: 0; transition: color 0.15s; }
    #__g-ct-regen:hover { color: #00ffa3; }

    #__g-popup-actions { display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
    .gf-btn { flex: 1; padding: 7px; font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; border-radius: 2px; cursor: pointer; border: 1px solid; transition: all 0.15s; }
    .__g-zoom-btn { background: rgba(0,255,163,0.05); border: 1px solid rgba(0,255,163,0.2); border-radius: 2px; color: rgba(0,255,163,0.6); font: 700 9px 'Rajdhani',sans-serif; letter-spacing: .1em; padding: 2px 7px; cursor: pointer; transition: all .15s; }
    .__g-zoom-btn:hover { background: rgba(0,255,163,0.12); border-color: rgba(0,255,163,0.5); color: #00ffa3; }
    .__g-nearby-chip { background: rgba(0,212,255,0.06); border: 1px solid rgba(0,212,255,0.25); border-radius: 2px; color: rgba(0,212,255,0.8); font: 9px 'IBM Plex Mono',monospace; padding: 2px 7px; cursor: pointer; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .__g-nearby-chip:hover { background: rgba(0,212,255,0.14); border-color: rgba(0,212,255,0.6); }
    #__g-btn-add    { background: rgba(0,255,163,0.1);  border-color: rgba(0,255,163,0.4);  color: #00ffa3; }
    #__g-btn-add:hover { background: rgba(0,255,163,0.2); border-color: #00ffa3; }
    #__g-btn-agent  { background: rgba(0,212,255,0.12); border-color: rgba(0,212,255,0.5); color: #00d4ff; }
    #__g-btn-agent:hover { background: rgba(0,212,255,0.22); border-color: #00d4ff; }
    #__g-btn-copy   { background: transparent; border-color: rgba(0,255,163,0.25); color: rgba(0,255,163,0.75); }
    #__g-btn-copy:hover { border-color: #00ffa3; color: #00ffa3; }
    /* LISTEN button: opens listener config modal — NOT a callto action */
    #__g-btn-listen { background: rgba(204,68,255,0.1); border-color: rgba(204,68,255,0.4); color: #cc44ff; }
    #__g-btn-listen:hover { background: rgba(204,68,255,0.2); border-color: #cc44ff; }
    #__g-btn-pick   { background: transparent; border-color: rgba(0,200,255,0.3); color: rgba(0,200,255,0.7); }
    #__g-btn-pick:hover { border-color: #00c8ff; color: #00c8ff; }
    #__g-btn-cancel { background: transparent; border-color: rgba(255,255,255,0.08); color: rgba(200,220,240,0.35); }
    #__g-btn-cancel:hover { border-color: rgba(255,59,59,0.4); color: #ff3b3b; }

    /* ── Listener Config Modal (separate from callto popup) ── */
    #__g-listen-modal {
      position: fixed; z-index: 2147483649; width: 340px;
      background: #080c10; border: 1px solid rgba(204,68,255,0.4);
      border-top: 2px solid #cc44ff; border-radius: 3px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.85), 0 0 24px rgba(204,68,255,0.12);
      font-family: 'IBM Plex Mono', monospace; display: none; overflow: hidden;
    }
    #__g-listen-modal.show { display: block; animation: g-popup-in 0.18s ease-out; }
    #__g-listen-modal-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 11px; background: rgba(204,68,255,0.07);
      border-bottom: 1px solid rgba(204,68,255,0.2);
    }
    #__g-listen-modal-title { font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.15em; color: #cc44ff; }
    #__g-listen-modal-close { background: none; border: none; cursor: pointer; color: rgba(204,68,255,0.4); font-size: 14px; line-height: 1; padding: 0 2px; }
    #__g-listen-modal-close:hover { color: #cc44ff; }
    #__g-listen-modal-body { padding: 10px 11px; }
    .lm-section-title { font-family: 'Rajdhani', sans-serif; font-size: 11px; letter-spacing: 0.18em; color: rgba(204,68,255,0.5); text-transform: uppercase; margin: 8px 0 4px; }
    .lm-info { font-size: 11px; color: rgba(200,220,240,0.3); line-height: 1.5; margin-bottom: 8px; }
    #__g-listen-modal-actions { display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(204,68,255,0.1); }
    .lm-btn-confirm { flex:1; padding:7px; font-family:'Rajdhani',sans-serif; font-size:12px; font-weight:700; letter-spacing:.1em; border-radius:2px; cursor:pointer; border:1px solid rgba(204,68,255,0.4); background:rgba(204,68,255,0.1); color:#cc44ff; transition:all .15s; }
    .lm-btn-confirm:hover { background:rgba(204,68,255,0.2); border-color:#cc44ff; }
    .lm-btn-cancel  { flex:1; padding:7px; font-family:'Rajdhani',sans-serif; font-size:12px; font-weight:700; letter-spacing:.1em; border-radius:2px; cursor:pointer; border:1px solid rgba(255,255,255,0.08); background:transparent; color:rgba(200,220,240,0.35); transition:all .15s; }
    .lm-btn-cancel:hover { border-color:rgba(255,59,59,.4); color:#ff3b3b; }

    /* link target sub-section inside listener modal */
    .lm-link-opt { display:flex; align-items:center; gap:8px; padding:6px 8px; border:1px solid rgba(204,68,255,0.18); border-radius:2px; cursor:pointer; margin-bottom:4px; transition:background .1s; }
    .lm-link-opt:hover { background:rgba(204,68,255,0.06); border-color:rgba(204,68,255,0.35); }
    .lm-link-opt.selected { background:rgba(204,68,255,0.1); border-color:#cc44ff; }
    .lm-link-opt-icon { font-size:13px; }
    .lm-link-opt-label { font-size:12px; color:#cc44ff; display:block; font-family:'Rajdhani',sans-serif; letter-spacing:.08em; }
    .lm-link-opt-desc  { font-size:11px; color:rgba(200,220,240,0.45); }
    .lm-url-row { display:none; margin-top:5px; }
    .lm-url-row.show { display:block; }
    #__g-link-actions { display: flex; gap: 6px; margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); }

    /* ── Listener badge (shows on active listeners) ── */
    .g-listener-badge {
      position: fixed; z-index: 2147483645;
      background: rgba(204,68,255,0.15); border: 1px solid rgba(204,68,255,0.5);
      border-radius: 2px; padding: 3px 8px; font: 9px 'IBM Plex Mono', monospace;
      color: #cc44ff; pointer-events: none; animation: g-pulse-m 2s ease-in-out infinite;
    }
    @keyframes g-pulse-m { 0%,100%{box-shadow:0 0 6px rgba(204,68,255,0.3)} 50%{box-shadow:0 0 16px rgba(204,68,255,0.6)} }

    /* ── Toast ── */
    #__g-toast {
      position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
      z-index: 2147483650; background: #080c10;
      border: 1px solid rgba(0,255,163,0.4); border-left: 3px solid #00ffa3;
      padding: 6px 16px; font: 11px/1.4 'IBM Plex Mono', monospace;
      color: #00ffa3; border-radius: 2px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6); pointer-events: none; opacity: 0;
      transition: opacity 0.2s; white-space: nowrap; max-width: 380px;
    }
    #__g-toast.show { opacity: 1; }
    #__g-toast.err { border-color: rgba(255,45,85,0.4); border-left-color: #ff2d55; color: #ff2d55; }
    #__g-toast.warn { border-color: rgba(255,204,0,0.4); border-left-color: #ffcc00; color: #ffcc00; }

    /* ── Killswitch flash ── */
    @keyframes g-kill-flash { 0%{background:rgba(255,45,85,0.25)} 100%{background:transparent} }
  `;
  document.head.appendChild(STYLE);

  // ── Build DOM — same real element() helper, same real structure ─────
  function el(tag, id, html) {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (html) e.innerHTML = html;
    return e;
  }

  const selBox  = el('div', '__g-sel', '<div id="__g-sel-c"></div><div id="__g-sel-scan"></div>');
  const overlay = el('div', '__g-overlay');
  const tip     = el('div', '__g-tip', `<div id="__g-tip-tag">GUARDIAN · SELECT</div><div id="__g-tip-sel">—</div><div id="__g-tip-dims">—</div>`);
  const escHint = el('div', '__g-esc');
  const toast   = el('div', '__g-toast');

  const popup = el('div', '__g-popup');
  popup.innerHTML = `
    <div id="__g-popup-hdr">
      <div id="__g-popup-title">◈ GENERATE CALLTO</div>
      <button id="__g-popup-close">✕</button>
    </div>
    <div id="__g-popup-body">
      <div class="gf"><div class="gf-label">Selector</div><div class="gf-val" id="__g-ct-sel">—</div></div>
      <div id="__g-zoom-bar" style="display:flex;align-items:center;gap:4px;padding:4px 0 2px;flex-wrap:wrap;">
        <button class="__g-zoom-btn" id="__g-zoom-parent" title="Select parent element">↑ PARENT</button>
        <button class="__g-zoom-btn" id="__g-zoom-child"  title="Select first child">↓ CHILD</button>
        <button class="__g-zoom-btn" id="__g-zoom-prev"   title="Previous sibling">← PREV</button>
        <button class="__g-zoom-btn" id="__g-zoom-next"   title="Next sibling">→ NEXT</button>
        <span id="__g-zoom-depth" style="font:9px 'IBM Plex Mono',monospace;color:rgba(0,255,163,0.4);margin-left:4px"></span>
      </div>
      <div id="__g-nearby-row" style="display:none;padding:3px 0 4px;">
        <div style="font:9px 'IBM Plex Mono',monospace;color:rgba(0,255,163,0.3);margin-bottom:3px;">NEARBY</div>
        <div id="__g-nearby-chips" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
      </div>
      <div class="gf"><div class="gf-label">Label</div><input class="gf-input" id="__g-ct-label" placeholder="e.g. submit-btn" maxlength="60"/></div>
      <div class="gf" id="__g-action-row">
        <div class="gf-label">Action</div>
        <select class="gf-input" id="__g-ct-action">
          <option value="click">click</option>
          <option value="type">type</option>
          <option value="focus">focus</option>
          <option value="hover">hover</option>
          <option value="extract">extract text</option>
          <option value="screenshot">screenshot</option>
        </select>
      </div>
      <div class="gf">
        <div class="gf-label">Callto ID</div>
        <div id="__g-ct-id-row"><div id="__g-ct-id">—</div><button id="__g-ct-regen" title="Regenerate ID">↻</button></div>
      </div>
      <div id="__g-popup-actions">
        <button class="gf-btn" id="__g-btn-agent" title="Hand this element (selector, text, page) to Claude Code and the agents — they read it with: idearium picks">→ CLAUDE CODE</button>
        <button class="gf-btn" id="__g-btn-copy" title="Copy the selector">⧉ COPY</button>
        <button class="gf-btn" id="__g-btn-listen">⦿ LISTEN</button>
        <button class="gf-btn" id="__g-btn-pick">RE-PICK</button>
      </div>
      <div id="__g-popup-actions2" style="display:flex;gap:6px;margin-top:6px;">
        <button class="gf-btn" id="__g-btn-add" title="Save as a callto in Clear Glass's index (Settings → Suite)">SAVE CALLTO</button>
        <button class="gf-btn" id="__g-btn-cancel">CLOSE</button>
      </div>
    </div>
  `;

  const listenModal = el('div', '__g-listen-modal');
  listenModal.innerHTML = `
    <div id="__g-listen-modal-hdr">
      <div id="__g-listen-modal-title">⦿ LISTENER CONFIG</div>
      <button id="__g-listen-modal-close">✕</button>
    </div>
    <div id="__g-listen-modal-body">
      <div class="gf"><div class="gf-label">Element</div><div class="gf-val" id="__g-lm-sel">—</div></div>
      <div class="gf"><div class="gf-label">Label</div><input class="gf-input" id="__g-lm-label" placeholder="e.g. chat-output" maxlength="60"/></div>
      <div class="gf">
        <div class="gf-label">Observe Mode</div>
        <select class="gf-input" id="__g-lm-mode">
          <option value="mutation">DOM mutations (all child/text changes)</option>
          <option value="input">Input / value changes</option>
          <option value="chat">Chat messages (AI stream)</option>
        </select>
      </div>
      <div class="lm-section-title">MATCH CRITERIA (optional)</div>
      <div class="lm-info">Emit only when observed text matches. Leave all unchecked to emit on every real change (original behavior, unchanged).</div>
      <div class="gf">
        <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(200,220,240,0.6);cursor:pointer;margin-bottom:4px;"><input type="checkbox" id="__g-lm-mc-keywords-on"/> Keywords (comma-separated)</label>
        <input class="gf-input" id="__g-lm-mc-keywords" placeholder="e.g. deploy, error, urgent" disabled/>
      </div>
      <div class="gf">
        <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(200,220,240,0.6);cursor:pointer;"><input type="checkbox" id="__g-lm-mc-wakeword"/> NEXUS wake word ("hey/hi/ok nexus, ...")</label>
      </div>
      <div class="gf">
        <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(200,220,240,0.6);cursor:pointer;"><input type="checkbox" id="__g-lm-mc-questions"/> Questions</label>
      </div>
      <div class="gf">
        <div class="gf-label">Emit Callto Type</div>
        <select class="gf-input" id="__g-lm-callto-type">
          <option value="mutation">mutation</option>
          <option value="listen">listen</option>
        </select>
      </div>
      <div class="lm-section-title">LINK TARGET (optional)</div>
      <div class="lm-info">Where matched events are routed. Leave blank to route via IR Layer default.</div>
      <!-- §BUILD 2026-08-30 — James: "make the link target hidden with a
           check box, it's too big." Real collapse, not a cosmetic
           scrollbar — all 8 real options + their sub-rows sit inside
           #__g-lm-link-target-options, hidden until this checkbox is
           actually checked. Unchecked (hidden) is the real default,
           matching the modal's own existing "leave blank to route via
           IR Layer default" behavior — routing was already optional,
           now the UI matches that instead of showing all 8 choices
           up front regardless. -->
      <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:rgba(200,220,240,0.6);cursor:pointer;margin-bottom:6px;">
        <input type="checkbox" id="__g-lm-link-target-toggle"/> Route to a specific system
      </label>
      <div id="__g-lm-link-target-options" style="display:none;">
      <div class="lm-link-opt" data-lm-link="ledger" id="__g-lm-link-ledger">
        <span class="lm-link-opt-icon">📒</span>
        <div><span class="lm-link-opt-label">Event Ledger</span><span class="lm-link-opt-desc">Real, permanent write to Cortex's own event log</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="intelligence" id="__g-lm-link-intelligence">
        <span class="lm-link-opt-icon">🧬</span>
        <div><span class="lm-link-opt-label">Intelligence System</span><span class="lm-link-opt-desc">Tagged for Cortex's pattern-scan — same real event log, marked as a deliberate observation</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="compartment" id="__g-lm-link-compartment">
        <span class="lm-link-opt-icon">🗂</span>
        <div><span class="lm-link-opt-label">Another System</span><span class="lm-link-opt-desc">Ledger write tagged to a specific real NEXUS system, with intent</span></div>
      </div>
      <div class="lm-url-row" id="__g-lm-compartment-row">
        <div class="gf-label">System</div>
        <select class="gf-input" id="__g-lm-compartment-select">
          <option value="cortex">cortex</option><option value="guardian">guardian</option>
          <option value="orchestrator">orchestrator</option><option value="bridge">bridge</option>
          <option value="loom">loom</option><option value="copilot">copilot</option>
          <option value="intelligence">intelligence</option><option value="eravos">eravos</option>
          <option value="idearium">idearium</option><option value="architect">architect</option>
          <option value="emerge">emerge</option><option value="ollama">ollama</option>
        </select>
        <div class="gf-label" style="margin-top:6px">Intent</div>
        <input class="gf-input" id="__g-lm-compartment-intent" placeholder="e.g. flag-for-review, price-change"/>
      </div>
      <div class="lm-link-opt" data-lm-link="sse-system" id="__g-lm-link-sse-system">
        <span class="lm-link-opt-icon">📶</span>
        <div><span class="lm-link-opt-label">SSE → System</span><span class="lm-link-opt-desc">Live stream into a real system's own event bus (Guardian's included)</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="copilot-cli" id="__g-lm-link-copilot-cli">
        <span class="lm-link-opt-icon">⌘</span>
        <div><span class="lm-link-opt-label">Co-pilot CLI</span><span class="lm-link-opt-desc">Sends the matched text to Co-pilot's real prompt route, with an intent</span></div>
      </div>
      <div class="lm-url-row" id="__g-lm-copilot-cli-row">
        <div class="gf-label">Intent</div>
        <input class="gf-input" id="__g-lm-copilot-cli-intent" placeholder="e.g. summarize, flag, ask"/>
      </div>
      <div class="lm-link-opt" data-lm-link="nexus-command" id="__g-lm-link-nexus-command">
        <span class="lm-link-opt-icon">⌘</span>
        <div><span class="lm-link-opt-label">Run Nexus commands</span><span class="lm-link-opt-desc">Lines it hears like "nexus&gt; census" or "idearium dump …" run as Nexus commands, once each — the result shows in the co-pilot panel</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="copilot-panel" id="__g-lm-link-copilot-panel">
        <span class="lm-link-opt-icon">💬</span>
        <div><span class="lm-link-opt-label">Co-pilot Panel</span><span class="lm-link-opt-desc">Shows up directly in Clear Glass's own co-pilot chat — no external system</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="ollama-stream" id="__g-lm-link-ollama-stream">
        <span class="lm-link-opt-icon">🧠</span>
        <div><span class="lm-link-opt-label">Ollama Continuous Stream</span><span class="lm-link-opt-desc">Every matched real event sent to Ollama for processing</span></div>
      </div>
      <div class="lm-link-opt" data-lm-link="direct-file-write" id="__g-lm-link-direct-file-write">
        <span class="lm-link-opt-icon">📝</span>
        <div><span class="lm-link-opt-label">Direct File Write</span><span class="lm-link-opt-desc">Writes a matched code block straight to disk, using its own path comment (// path/to/file.js) — no compartment, no contract</span></div>
      </div>
      <!-- §BUILD 2026-09-02 — AM8, James: "the guardian plugin maps to
           adding a new agent to the mesh. selecting a new element has
           the option in the listener settings to add to new agent,
           then asks if this is an input or an output element. then
           when you choose asks you to select the opposite to create a
           system." Two-step pairing, not a single-pick option — the
           real flow (see startAgentPairing()/commitListener()'s own
           new-agent branch below) picks THIS element first, asks its
           role, then reopens the picker for the opposite role before
           a real agent record is ever created. -->
      <div class="lm-link-opt" data-lm-link="new-agent" id="__g-lm-link-new-agent">
        <span class="lm-link-opt-icon">🔌</span>
        <div><span class="lm-link-opt-label">Add to New Agent</span><span class="lm-link-opt-desc">Pair this element with its input/output counterpart to register a new, custom agent in the mesh</span></div>
      </div>
      <div class="lm-url-row" id="__g-lm-new-agent-row">
        <div class="gf-label">Agent Name</div>
        <input class="gf-input" id="__g-lm-new-agent-name" placeholder="e.g. my-custom-chat-tool"/>
        <div class="gf-label" style="margin-top:6px">This Element Is The</div>
        <select class="gf-input" id="__g-lm-new-agent-role">
          <option value="input">Input (where a prompt is typed)</option>
          <option value="output">Output (where the response appears)</option>
        </select>
      </div>
      </div>
      <div id="__g-listen-modal-actions">
        <button class="lm-btn-confirm" id="__g-lm-btn-confirm">⦿ START LISTENER</button>
        <button class="lm-btn-cancel"  id="__g-lm-btn-cancel">CANCEL</button>
      </div>
      <div id="__g-lm-log-section" style="display:none;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font:700 9px 'Rajdhani',sans-serif;letter-spacing:.12em;color:rgba(0,212,255,0.6)">EVENT LOG</span>
          <span id="__g-lm-log-count" style="font:9px 'IBM Plex Mono',monospace;color:rgba(255,255,255,0.3)">0 events</span>
          <button id="__g-lm-log-export" style="margin-left:auto;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.25);border-radius:2px;color:rgba(0,212,255,0.7);font:700 9px 'Rajdhani',sans-serif;padding:2px 8px;cursor:pointer;letter-spacing:.1em;">⬇ EXPORT</button>
          <button id="__g-lm-log-clear" style="background:rgba(255,60,60,0.08);border:1px solid rgba(255,60,60,0.2);border-radius:2px;color:rgba(255,100,100,0.7);font:700 9px 'Rajdhani',sans-serif;padding:2px 8px;cursor:pointer;letter-spacing:.1em;">CLEAR</button>
        </div>
        <div id="__g-lm-log-list" style="max-height:100px;overflow-y:auto;font:9px 'IBM Plex Mono',monospace;color:rgba(255,255,255,0.45);line-height:1.6;background:rgba(0,0,0,0.2);border-radius:2px;padding:4px 6px;"></div>
      </div>
    </div>
  `;

  for (const e of [selBox, overlay, tip, escHint, toast, popup, listenModal]) {
    document.body.appendChild(e);
  }

  // ── Draggable popups — James: "also i cant move it around." Neither the
  //    real Guardian source nor the port had drag support; both popups sit
  //    at fixed positions computed once in openPopup()/openListenModal()
  //    and never move. Real, generic drag-by-header, matching this file's
  //    existing bounds-checking style (openPopup/openListenModal already
  //    clamp initial position to the viewport — dragging clamps the same
  //    way so a popup can't be dragged fully off-screen and become
  //    unreachable). Cursor feedback on the header only, not the whole
  //    panel, so text inside (label inputs etc.) stays normally selectable.
  function makeDraggable(panel, handle) {
    let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', (e) => {
      // Don't start a drag from the close button inside the header
      if (e.target.closest('button')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const r = panel.getBoundingClientRect();
      origLeft = r.left; origTop = r.top;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const vw = window.innerWidth, vh = window.innerHeight;
      const r  = panel.getBoundingClientRect();
      let left = origLeft + dx, top = origTop + dy;
      left = Math.max(4, Math.min(left, vw - r.width  - 4));
      top  = Math.max(4, Math.min(top,  vh - r.height - 4));
      panel.style.left = left + 'px';
      panel.style.top  = top  + 'px';
    });
    const endDrag = (e) => { if (dragging) { dragging = false; try { handle.releasePointerCapture(e.pointerId); } catch(_) {} } };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }
  makeDraggable(popup,       document.getElementById('__g-popup-hdr'));
  makeDraggable(listenModal, document.getElementById('__g-listen-modal-hdr'));

  // ── State — real, unchanged from the source (already extension-agnostic) ──

  // ── State ────────────────────────────────────────────────────────────────
  let pickerActive   = false;
  let pickerMode       = 'callto';   // always 'callto' — listener is a separate modal path
  let _currentEl       = null;
  let _currentFp       = null;
  let _calltoId        = null;
  let _toastTimer      = null;
  let _linkType        = null;       // unused legacy, kept for safety
  let _currentHighlight = null;      // kept for compatibility, no longer used for styling
  // Listener event log: { listenerId → [{ts, type, before, after, selector}] }
  const _listenerLog   = {};
  const LISTENER_LOG_MAX = 500;
  let _lmLinkType    = null;       // selected link type inside listener modal
  // §BUILT 2026-09-02 — AM8's real two-step pairing state. null when no
  // pairing is in progress; { agentName, firstRole, firstSelector,
  // firstXpath } while waiting for the opposite-role element to be
  // picked. Module-level, not stored on the modal's own DOM, since the
  // modal is fully closed and reopened (via startPicker('listener'))
  // between the two real picks.
  let _pendingAgentPair = null;
  let _pendingListenerId = null;   // pending listener config

  // Active listeners on this page: listenerId → { observer, el, badges }
  const activeListeners = new Map();

  // ── Helpers ──────────────────────────────────────────────────────────────
  function genCalltoId() { return 'callto-' + crypto.randomUUID().slice(0, 8); }
  function truncSel(s, n = 45) { return s?.length > n ? s.slice(0, n - 3) + '...' : (s || '?'); }

  function fingerprint(el) {
    if (!el || !el.tagName) return { tag:'unknown', selector:'unknown', xpath:'/', rect:{top:0,left:0,width:0,height:0}, url:window.location.href, text:'', id:'', classes:'', name:'', type:'', ariaLabel:'' };
    try {
      const tag  = el.tagName.toLowerCase();
      const id   = el.id ? '#' + el.id : '';
      // Safe classList access — SVG elements have non-iterable classList in Firefox
      let cls = '';
      try {
        const classArr = el.classList ? Array.from(el.classList) : [];
        cls = classArr
          .filter(c => c && c.length > 1 && c.length < 40 && !/^[a-z]{1,2}$/.test(c) && !/^\d/.test(c))
          .slice(0, 3).map(c => '.' + c).join('');
      } catch(_) {}
      // Safe getAttribute — some elements throw
      const safeAttr = (name) => { try { return el.getAttribute ? el.getAttribute(name) || '' : ''; } catch(_) { return ''; } };
      const name  = safeAttr('name')       ? `[name="${safeAttr('name').slice(0,30)}"]` : '';
      const type  = safeAttr('type')       ? `[type="${safeAttr('type')}"]` : '';
      const aria  = safeAttr('aria-label') ? `[aria-label="${safeAttr('aria-label').slice(0,30)}"]` : '';
      const ph    = safeAttr('placeholder')? `[placeholder="${safeAttr('placeholder').slice(0,20)}"]` : '';
      const selector = (id ? tag + id : tag + cls + name + type + ph) || tag;
      const text  = (el.innerText || el.textContent || '').trim().slice(0, 40);
      const rect  = el.getBoundingClientRect();
      return {
        tag, id, classes: cls, name, type, ariaLabel: aria, text, selector,
        xpath: getXPath(el),
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        url: window.location.href,
      };
    } catch(err) {
      const tag = (el.tagName || 'unknown').toLowerCase();
      return { tag, selector: tag, xpath: '/' + tag, rect:{top:0,left:0,width:0,height:0}, url:window.location.href, text:'', id:'', classes:'', name:'', type:'', ariaLabel:'' };
    }
  }

  function getXPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = []; let node = el;
    while (node && node.nodeType === 1) {
      let idx = 1, sib = node.previousSibling;
      while (sib) { if (sib.nodeType === 1 && sib.tagName === node.tagName) idx++; sib = sib.previousSibling; }
      parts.unshift(node.tagName.toLowerCase() + (idx > 1 ? `[${idx}]` : ''));
      node = node.parentNode;
    }
    return '/' + parts.join('/');
  }

  function positionTooltip(rect) {
    const vw = window.innerWidth, vh = window.innerHeight, pad = 10;
    let top = rect.top - 52, left = rect.left;
    if (top < pad) top = rect.bottom + pad;
    if (left + 290 > vw - pad) left = vw - 290 - pad;
    if (left < pad) left = pad;
    if (top + 52 > vh - pad) top = vh - 60;
    tip.style.top = top + 'px'; tip.style.left = left + 'px';
  }

  function showToast(msg, type = 'ok', dur = 2800) {
    clearTimeout(_toastTimer);
    toast.textContent = msg;
    toast.className = 'show' + (type !== 'ok' ? ' ' + type : '');
    _toastTimer = setTimeout(() => { toast.className = ''; }, dur);
  }

  // ── Selection zone ───────────────────────────────────────────────────────
  // Refs cached once at init — never query DOM inside move handler
  const _tipTag  = document.getElementById('__g-tip-tag');
  const _tipSel  = document.getElementById('__g-tip-sel');
  const _tipDims = document.getElementById('__g-tip-dims');

  function updateSel(el, r) {
    // r passed in — caller already computed getBoundingClientRect, no extra call
    selBox.style.top    = r.top    + 'px';
    selBox.style.left   = r.left   + 'px';
    selBox.style.width  = r.width  + 'px';
    selBox.style.height = r.height + 'px';
    selBox.style.display = 'block';
    if (_tipTag)  _tipTag.textContent  = pickerMode === 'listener' ? 'GUARDIAN · LISTEN' : 'GUARDIAN · SELECT';
    if (_tipSel)  _tipSel.textContent  = el.tagName.toLowerCase()
      + (el.id ? '#' + el.id.slice(0, 20)
        : (el.className && typeof el.className === 'string')
          ? '.' + el.className.trim().split(/\s+/)[0].slice(0, 20) : '');
    if (_tipDims) _tipDims.textContent = Math.round(r.width) + '\xd7' + Math.round(r.height);
    tip.style.display = 'block';
    positionTooltip(r);
  }
  function hideSel() { selBox.style.display = 'none'; tip.style.display = 'none'; }

  // ── Picker — ZERO-REFLOW, ZERO-LEAK ──────────────────────────────────────
  // Design:
  //   overlay is pointer-events:none AT ALL TIMES — we NEVER toggle it
  //   pointermove fires on document, passes through overlay naturally
  //   AbortController removes all listeners in one call — impossible to leak
  //   rAF id tracked — if a frame is in flight, new moves update coords but
  //   don't schedule another frame (last-write-wins, no queue buildup)
  //   try/finally in rAF callback — _rafId always cleared even on throw

  let _pickerAbort = null;


  function startPicker(mode = 'callto') {
    if (pickerActive) stopPicker(true);  // always clean up first
    pickerMode   = mode;
    pickerActive = true;

    overlay.classList.add('picking');
    selBox.classList.toggle('listener-mode', mode === 'listener');
    tip.classList.toggle('listener-mode', mode === 'listener');
    escHint.className = 'show' + (mode === 'listener' ? ' listener-mode' : '');
    escHint.textContent = mode === 'listener'
      ? 'LISTEN MODE — click element  ·  ESC to cancel'
      : 'PICKING — click element to capture  ·  ESC to cancel';
    document.body.style.cursor = 'crosshair';

    _pickerAbort = new AbortController();
    const sig = _pickerAbort.signal;

    let _rafId = null;
    let _mx = 0, _my = 0;

    document.addEventListener('pointermove', (e) => {
      _mx = e.clientX; _my = e.clientY;
      if (_rafId !== null) return;
      _rafId = requestAnimationFrame(() => {
        try {
          if (!pickerActive) return;
          const t = document.elementFromPoint(_mx, _my);
          if (!t || t === selBox || t === tip || t === overlay || t === escHint) return;
          if (t.id && t.id.startsWith('__g-')) return;
          _currentEl = t;
          updateSel(t, t.getBoundingClientRect());
        } finally {
          _rafId = null;  // always reset — even if we throw
        }
      });
    }, { signal: sig, passive: true });

    document.addEventListener('pointerdown', (e) => {
      if (!pickerActive) return;
      // Guard: ignore clicks on Guardian's own UI
      let _tgt = e.target;
      while (_tgt) {
        if (_tgt.id && _tgt.id.startsWith('__g-')) return;
        _tgt = _tgt.parentElement;
      }
      e.preventDefault();
      e.stopPropagation();
      // Use e.target as primary source — it's the real element the pointer hit
      // Fall back to _currentEl (last hover target) then elementFromPoint
      const t = (e.target && e.target !== document.body && e.target !== document.documentElement)
        ? e.target
        : (_currentEl || document.elementFromPoint(e.clientX, e.clientY));
      if (!t) return;
      _currentEl = t;
      try {
        _currentFp = fingerprint(t);
      } catch(fpErr) {
        showToast('⚠ Could not fingerprint element: ' + fpErr.message.slice(0,40), 'warn');
        return;
      }
      if (!_currentFp || !_currentFp.selector) {
        showToast('⚠ Element not fingerprintable (shadow DOM?)', 'warn');
        return;
      }
      stopPicker(true);
      try { window.__cg?.send('dom:event', { type: 'guardian.picker.picked', xpath: _currentFp.xpath, selector: _currentFp.selector, url: window.location.href }); } catch (_) {}  // 0.39.251 — Clear Glass selector-assign offer; no visual change
      openPopup(_currentFp, e.clientX, e.clientY);
    }, { signal: sig, capture: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') stopPicker();
    }, { signal: sig });

    try { if (typeof URCK !== 'undefined') URCK.ingest('guardian.picker.start', { url: window.location.href, mode }, { source: 'content' }); } catch(_) {}
  }

  function stopPicker(silent) {
    if (!pickerActive) return;
    pickerActive = false;
    if (_pickerAbort) { _pickerAbort.abort(); _pickerAbort = null; }
    overlay.classList.remove('picking');
    escHint.className = '';
    document.body.style.cursor = '';
    hideSel();
    if (!silent) try { if (typeof URCK !== 'undefined') URCK.ingest('guardian.picker.stop', { url: window.location.href }, { source: 'content' }); } catch(_) {}
  }

  // Kept for any code that still calls onKey directly
  function onKey(e) { if (e.key === 'Escape') stopPicker(); }


  // ── Global killswitch ────────────────────────────────────────────────────
  // Re-entrancy guard — prevents the background broadcast round-trip from
  // calling triggerKillswitch() a second time on this same tab.
  let _killswitchActive = false;

  // notify=true  → self-initiated (ESC, button): tell background so other tabs die too
  // notify=false → initiated by background broadcast: local cleanup only, no re-broadcast
  function triggerKillswitch(reason = 'ESC', notify = true) {
    if (_killswitchActive) return;
    _killswitchActive = true;

    stopPicker(true);
    closeCalltoPopup(true);

    for (const [lid] of activeListeners) detachListenerDOM(lid);
    activeListeners.clear();

    if (notify) {
      // Only send to background when self-initiated — background skips our tab in broadcast
      // §1.2 — honest, real limit: a true WebExtension's background.js can
      // broadcast to every open tab; Clear Glass has no equivalent
      // cross-tab broadcaster yet. This kills listeners on THIS page,
      // real and complete — cross-tab propagation is not wired.
      try { window.__cg?.send('dom:event', { type: 'guardian.killswitch', reason }); } catch (_) {}
    }
    // If notify=false, background already knows and already handled other tabs.

    document.body.style.animation = 'g-kill-flash 0.4s ease-out';
    setTimeout(() => { document.body.style.animation = ''; }, 400);
    showToast('⛔ KILLSWITCH — all listeners stopped', 'err', 2000);

    setTimeout(() => { _killswitchActive = false; }, 0);
  }

  // ── Single global ESC handler — registered once, never duplicated ─────────
  // Distinct from onKey (which only lives during picking).
  // Uses { capture: true } so it fires before any page handler can swallow it.
  document.addEventListener('keydown', function onGlobalEsc(e) {   // §0.59.2 — removed with the run (_life)
    if (e.key !== 'Escape') return;
    if (pickerActive) {
      // Picker is active — let onKey (registered by startPicker) handle it.
      // Do NOT also trigger killswitch here.
      return;
    }
    if (popup.classList.contains('show')) { closeCalltoPopup(true); return; }   // §0.59.2 — ESC closes the popup first
    triggerKillswitch('ESC');
  }, { capture: true, signal: _life.signal });


  // ── Popup ────────────────────────────────────────────────────────────────
  function openPopup(fp, cx, cy) {
    _calltoId = genCalltoId();
    _linkType = null;

    // Callto popup is always in callto mode — no listener-mode state here
    popup.classList.remove('listener-mode');
    document.getElementById('__g-popup-title').textContent = '◈ GENERATE CALLTO';

    document.getElementById('__g-ct-sel').textContent   = truncSel(fp.selector);
    document.getElementById('__g-ct-label').value       = '';
    document.getElementById('__g-ct-action').value      = 'click';
    document.getElementById('__g-ct-id').textContent    = _calltoId;

    // Action row is ALWAYS shown — callto popup is callto-only
    document.getElementById('__g-action-row').style.display = '';

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    let px = cx + 12, py = cy + 12;
    if (px + 340 > vw - 10) px = cx - 340 - 12;
    if (py + 380 > vh - 10) py = cy - 380 - 12;
    if (px < 10) px = 10; if (py < 10) py = 10;
    popup.style.left = px + 'px'; popup.style.top = py + 'px';
    popup.classList.add('show');
  }

  function closeCalltoPopup(silent) {
    popup.classList.remove('show', 'listener-mode');
    _currentFp         = null;
    _calltoId          = null;
    _linkType          = null;
    _pendingListenerId = null;
    pickerMode = 'callto';
  }

  // ── Listener Config Modal open/close ──────────────────────────────────────
  function openListenModal(fp, cx, cy) {
    // Populate from the already-captured fingerprint
    document.getElementById('__g-lm-sel').textContent     = truncSel(fp.selector);
    document.getElementById('__g-lm-label').value         = '';
    document.getElementById('__g-lm-mode').value          = 'mutation';
    document.getElementById('__g-lm-callto-type').value   = 'mutation';

    // Reset link selection
    document.querySelectorAll('.lm-link-opt').forEach(o => o.classList.remove('selected'));
    document.querySelectorAll('.lm-url-row').forEach(r => r.classList.remove('show'));
    _lmLinkType = null;
    document.getElementById('__g-lm-link-target-toggle').checked = false;
    document.getElementById('__g-lm-link-target-options').style.display = 'none';

    // Position near callto popup (offset slightly so both visible)
    const vw = window.innerWidth, vh = window.innerHeight;
    let px = cx + 16, py = cy + 16;
    if (px + 350 > vw - 10) px = cx - 350 - 16;
    if (py + 500 > vh - 10) py = Math.max(10, vh - 510);
    if (px < 10) px = 10;
    listenModal.style.left = px + 'px'; listenModal.style.top = py + 'px';
    listenModal.classList.add('show');

    // Show log section if listener already has events
    const matchId = Object.keys(_listenerLog).find(k => k.includes(fp.selector || ''));
    if (matchId && _listenerLog[matchId]?.length) {
      if (typeof showListenerLog === 'function') showListenerLog(matchId);
    }
  }

  function closeListenModal() {
    listenModal.classList.remove('show');
    _lmLinkType        = null;
    _pendingListenerId = null;
  }

  // ── Commit callto ────────────────────────────────────────────────────────
  async function commitCallto() {
    if (!_currentFp || !_calltoId) return;
    const label  = document.getElementById('__g-ct-label').value.trim();
    const action = document.getElementById('__g-ct-action').value;

    const callto = {
      id:          _calltoId,
      selector:    _currentFp.selector,
      xpath:       _currentFp.xpath,
      label:       label || _currentFp.selector,
      action,
      url:         window.location.href,
      host:        HOST,
      ts:          Date.now(),
      fingerprint: _currentFp,
    };

    // URCK ingest
    if (typeof URCK !== 'undefined') {
      const ev = URCK.ingest('guardian.picker.capture', callto, { source: 'content', url: window.location.href });
      URCK.registerCallto(_calltoId, ev.id);
    }

    // ── FIX: Close popup IMMEDIATELY before async bridge call ─────────────
    const savedId    = _calltoId;
    const savedLabel = label || _calltoId;
    closeCalltoPopup(true);

    // Now send to background (non-blocking from user's perspective)
    // §1.2 — window.__cg.send() is real but fire-and-forget (no
    // synchronous response channel back into the page, unlike a real
    // WebExtension's sendMessage → background → reply round-trip). Being
    // honest about that rather than fabricating a synchronous ok/fail —
    // the real confirmation (or failure) shows up in Clear Glass's own
    // Picked Elements panel / event log, not synchronously here.
    try { window.__cg?.send('dom:event', { type: 'guardian.callto.added', callto }); showToast('→ callto sent → ' + savedLabel); }
    catch (e) { showToast('✗ could not send callto: ' + e.message, 'err', 4000); }
  }

  // ── Commit listener — called from modal CONFIRM button ───────────────────
  async function commitListener() {
    if (!_pendingListenerId) return;

    // §BUILT 2026-09-02 — AM8's real two-step pairing, intercepted here
    // before any of the normal listener-attach machinery below runs —
    // this isn't a real "listener" at all, it's a one-time agent-
    // registration act. See startAgentPairing() for the real second-
    // pick completion.
    if (_lmLinkType === 'new-agent') {
      const agentName = document.getElementById('__g-lm-new-agent-name').value.trim();
      const role = document.getElementById('__g-lm-new-agent-role').value;
      if (!agentName) { showToast('✗ agent name is required', 'err', 3000); return; }
      const selector = _pendingListenerId.selector, xpath = _pendingListenerId.xpath;
      closeListenModal();
      if (!_pendingAgentPair) {
        // First real pick of the pair — save it, ask for the opposite.
        _pendingAgentPair = { agentName, firstRole: role, firstSelector: selector, firstXpath: xpath };
        showToast(`◆ ${role} captured for "${agentName}" — now pick the ${role === 'input' ? 'output' : 'input'} element`, 'ok', 5000);
        setTimeout(() => startPicker('listener'), 300);
        return;
      }
      // Second real pick — must be the OPPOSITE role of the first, and
      // for the SAME agent (a person could theoretically start a
      // second, unrelated pairing before finishing the first by
      // reopening this modal manually — checked, not assumed safe).
      if (_pendingAgentPair.agentName !== agentName) {
        showToast(`✗ pairing "${_pendingAgentPair.agentName}" is still open — finish or cancel it before starting a new one`, 'err', 4000);
        return;
      }
      if (role === _pendingAgentPair.firstRole) {
        showToast(`✗ you already picked the ${role} element — pick the ${role === 'input' ? 'output' : 'input'} element instead`, 'err', 4000);
        setTimeout(() => startPicker('listener'), 300);
        return;
      }
      const pair = _pendingAgentPair;
      _pendingAgentPair = null;
      const inputSel  = pair.firstRole === 'input' ? { selector: pair.firstSelector, xpath: pair.firstXpath } : { selector, xpath };
      const outputSel = pair.firstRole === 'output' ? { selector: pair.firstSelector, xpath: pair.firstXpath } : { selector, xpath };
      try {
        window.__cg?.send('dom:event', {
          type: 'guardian.agent.create',
          agentName: pair.agentName,
          origin: location.origin,
          url: location.href,
          input:  inputSel,
          output: outputSel,
        });
        showToast(`⚡ agent "${pair.agentName}" registered — input + output paired`, 'ok', 4000);
      } catch (e) {
        showToast('✗ could not register agent: ' + e.message, 'err', 4000);
      }
      return;
    }

    const label    = document.getElementById('__g-lm-label').value.trim();
    const mode     = document.getElementById('__g-lm-mode').value;
    const calltoType = document.getElementById('__g-lm-callto-type').value;

    // §BUILD 2026-08-23 — James: "option to listen for keywords, nexus
    // wake word, data types including but not limited to questions."
    // Real, gathered match criteria — empty/false on every field means
    // "emit on every real change," the exact original, unfiltered
    // behavior, unless a person explicitly opts into filtering.
    const mcKeywordsOn = document.getElementById('__g-lm-mc-keywords-on').checked;
    const matchCriteria = {
      keywords:  mcKeywordsOn ? document.getElementById('__g-lm-mc-keywords').value.split(',').map(s => s.trim()).filter(Boolean) : [],
      wakeWord:  document.getElementById('__g-lm-mc-wakeword').checked,
      questions: document.getElementById('__g-lm-mc-questions').checked,
    };

    let linkTarget = null;
    if (_lmLinkType === 'ledger') {
      // Real, direct write to Cortex's own event log — no extra config
      // needed, matching the existing 'nexus' option's own simplicity.
      linkTarget = { type: 'ledger' };
    } else if (_lmLinkType === 'intelligence') {
      // §2026-08-28 — James: "do the intelligence system instead" (of
      // COS/autopilot, which have no real event-ingest endpoint — checked
      // directly, neither exposes one). Traced the real path first: the
      // 'ledger' target above already POSTs to cortex's real /api/event
      // (registered in cortex/registry-components.js as 'events.write'),
      // and that's the exact same event_log table cortex's own
      // intelligence module scans for pattern-crystallization — confirmed
      // directly in cortex/boot.js, not assumed. So this doesn't need a
      // new transport, just a distinct, honestly-tagged event type so
      // intelligence's pattern-scan (and anyone reading the ledger later)
      // can tell a deliberate observation from an ordinary ledger write.
      linkTarget = { type: 'intelligence' };
    } else if (_lmLinkType === 'compartment') {
      linkTarget = {
        type: 'compartment',
        system: document.getElementById('__g-lm-compartment-select').value,
        intent: document.getElementById('__g-lm-compartment-intent').value.trim() || null,
      };
    } else if (_lmLinkType === 'sse-system') {
      linkTarget = { type: 'sse-system', system: document.getElementById('__g-lm-compartment-select')?.value || 'cortex' };
    } else if (_lmLinkType === 'copilot-cli') {
      linkTarget = { type: 'copilot-cli', intent: document.getElementById('__g-lm-copilot-cli-intent').value.trim() || 'ask' };
    } else if (_lmLinkType === 'nexus-command') {
      linkTarget = { type: 'nexus-command' };   // §0.59.4
    } else if (_lmLinkType === 'copilot-panel') {
      // Fully local — no external system, no HTTP call. Routes into
      // Clear Glass's own co-pilot chat panel via the same real SSE
      // stream every other panel already listens on.
      linkTarget = { type: 'copilot-panel' };
    } else if (_lmLinkType === 'ollama-stream') {
      linkTarget = { type: 'ollama-stream' };
    } else if (_lmLinkType === 'direct-file-write') {
      linkTarget = { type: 'direct-file-write' };
    }
    // else: no link selected — linkTarget stays null, real IR-Layer-
    // default routing (the existing emit(d.type, d) that already fires
    // unconditionally, regardless of link target) still applies. Not
    // defaulting to a fabricated target here now that 'bridge' is no
    // longer a real, visible option.

    const listenerId = 'listener-' + crypto.randomUUID().slice(0, 8);
    const config = {
      ..._pendingListenerId,
      label:      label || _pendingListenerId.selector,
      mode,
      calltoType,
      matchCriteria,
      linkTarget,
    };

    const savedLabel = config.label;
    closeListenModal();

    // §FIXED 2026-08-23 — real, genuine bug found while extending this:
    // nothing ever called attachListenerDOM() anywhere in this file.
    // The original extension relies on a real background-script
    // round-trip (START_LISTENER → background → ATTACH_LISTENER back to
    // content.js) that Clear Glass has no equivalent for — so the real,
    // correct port calls it directly, here, rather than waiting for a
    // reply that will never come.
    const attached = attachListenerDOM(listenerId, _pendingListenerId.selector, _pendingListenerId.xpath, mode, matchCriteria);
    if (!attached) { showToast(`✗ listener failed to attach — element not found`, 'err', 3000); return; }

    // Same real, honest fire-and-forget note as commitCallto above —
    // this announces the real, now-attached listener's config out,
    // it doesn't wait for or need a reply to actually start observing.
    try { window.__cg?.send('dom:event', { type: 'guardian.listener.start', listenerId, config }); showToast(`◆ listener active → ${savedLabel}`, 'ok', 3000); }
    catch (e) { showToast('✗ could not announce listener: ' + e.message, 'err', 3000); }
  }

  // ── Listener modal link-type selection ────────────────────────────────────
  document.querySelectorAll('.lm-link-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.lm-link-opt').forEach(o => o.classList.remove('selected'));
      document.querySelectorAll('.lm-url-row').forEach(r => r.classList.remove('show'));
      opt.classList.add('selected');
      _lmLinkType = opt.dataset.lmLink;
      const rowMap = { compartment: '__g-lm-compartment-row', 'copilot-cli': '__g-lm-copilot-cli-row', 'new-agent': '__g-lm-new-agent-row' };
      const rowId = rowMap[_lmLinkType];
      if (rowId) document.getElementById(rowId).classList.add('show');
    });
  });

  document.getElementById('__g-lm-btn-confirm').addEventListener('click', commitListener);

  // §BUILD 2026-08-23 — James: "option to listen for keywords." Real,
  // simple enable/disable wiring — the checkbox controls whether the
  // keyword input is actually usable, matching this file's own real
  // established convention for a checkbox gating an input.
  document.getElementById('__g-lm-mc-keywords-on').addEventListener('change', (e) => {
    document.getElementById('__g-lm-mc-keywords').disabled = !e.target.checked;
  });
  // §BUILD 2026-08-30 — real link-target collapse toggle, same real
  // checkbox-gates-content pattern as __g-lm-mc-keywords-on just above.
  document.getElementById('__g-lm-link-target-toggle').addEventListener('change', (e) => {
    document.getElementById('__g-lm-link-target-options').style.display = e.target.checked ? 'block' : 'none';
  });
  document.getElementById('__g-lm-btn-cancel').addEventListener('click',  closeListenModal);
  document.getElementById('__g-listen-modal-close').addEventListener('click', closeListenModal);

  // ── Listener log helpers ──────────────────────────────────────────────────
  function showListenerLog(listenerId) {
    const section  = document.getElementById('__g-lm-log-section');
    const list     = document.getElementById('__g-lm-log-list');
    const countEl  = document.getElementById('__g-lm-log-count');
    if (!section || !list) return;

    const entries = _listenerLog[listenerId] || [];
    section.style.display = 'block';
    countEl.textContent   = entries.length + ' event' + (entries.length !== 1 ? 's' : '');

    list.innerHTML = entries.slice(-40).reverse().map(e => {
      const t   = new Date(e.ts).toTimeString().slice(0, 8);
      const typ = e.type || 'event';
      const val = (e.text || e.value || '').slice(0, 60).replace(/</g, '&lt;');
      return `<div><span style="color:rgba(0,255,163,0.4)">${t}</span> <span style="color:rgba(0,212,255,0.6)">${typ}</span>${val ? ' · ' + val : ''}</div>`;
    }).join('') || '<div style="color:rgba(255,255,255,0.2)">No events yet</div>';
  }

  document.getElementById('__g-lm-log-export')?.addEventListener('click', () => {
    const lid     = _pendingListenerId?.selector || 'listener';
    const entries = _listenerLog[Object.keys(_listenerLog).pop()] || [];
    const blob    = new Blob([JSON.stringify({ listenerId: lid, entries }, null, 2)], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = 'guardian-listener-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Log exported', 'ok', 2000);
  });

  document.getElementById('__g-lm-log-clear')?.addEventListener('click', () => {
    const lid = Object.keys(_listenerLog).pop();
    if (lid) _listenerLog[lid] = [];
    showListenerLog(lid);
    showToast('Log cleared', 'ok', 1500);
  });

  // Refresh log display on every modal open
  const _origOpenListenModal = openListenModal;
  // (openListenModal is defined as function, will pick up showListenerLog via closure)

  // ── DOM Listener attachment (content side) ────────────────────────────────
  // §BUILD 2026-08-23 — real, exact wake-word regex reused from guardian/
  // userscript-nexus-wake.js, not reinvented — same pattern, same real
  // behavior a person already knows from every other "hey nexus" surface
  // in this codebase.
  const WAKE_RE = /^\s*(?:hey|hi|ok|okay)[,\s]+nexus[,:\s]+([\s\S]+)$/i;

  // Real, honest heuristic — not a big NLU system. A question mark
  // anywhere, or starting with a real question word/auxiliary verb.
  const QUESTION_RE = /\?|^\s*(who|what|when|where|why|how|is|are|can|could|would|should|do|does|did|will)\b/i;

  function _matchesCriteria(text, criteria) {
    if (!criteria) return true; // no criteria configured — original, unfiltered behavior
    const hasAny = (criteria.keywords && criteria.keywords.length) || criteria.wakeWord || criteria.questions;
    if (!hasAny) return true; // every checkbox left unchecked — emit on every real change
    if (!text) return false;
    if (criteria.keywords && criteria.keywords.length) {
      const lower = text.toLowerCase();
      if (criteria.keywords.some(k => lower.includes(k.toLowerCase()))) return true;
    }
    if (criteria.wakeWord && WAKE_RE.test(text)) return true;
    if (criteria.questions && QUESTION_RE.test(text)) return true;
    return false;
  }

  function attachListenerDOM(listenerId, selector, xpath, mode, matchCriteria) {
    // Find element
    let target = null;
    try { target = document.querySelector(selector); } catch {}
    if (!target && xpath) {
      try {
        const r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        target = r.singleNodeValue;
      } catch {}
    }
    // For chat/mutation mode: element may not exist yet — don't bail out.
    // The sentinel observer will wait for it to appear.
    // For other modes: bail if element missing.
    const isChatMode = mode === 'chat' || mode === 'mutation';
    if (!target && !isChatMode) {
      window.__cg?.send('dom:event', {
        type: 'guardian.listener.event',
        listenerId,
        eventData: { type: 'error', reason: `Element not found: ${selector}`, ts: Date.now() },
      });
      return false;
    }

    // Badge — only if element is already present
    if (target) {
      const badge = document.createElement('div');
      badge.className = 'g-listener-badge';
      badge.textContent = `⦿ ${listenerId.slice(-6)}`;
      const rect = target.getBoundingClientRect();
      badge.style.cssText = `top:${rect.top + window.scrollY - 22}px;left:${rect.left + window.scrollX}px;`;
      document.body.appendChild(badge);
    }

    let observer = null;

    function emit(data) {
      // §BUILD 2026-08-23 — real match-criteria check, the single real
      // choke point every mode (mutation/chat/input) passes through.
      // Error-type events always pass through regardless of criteria —
      // a real failure should never be silently swallowed by a keyword
      // filter that was never meant to filter errors.
      const text = data?.text ?? data?.value ?? '';
      if (data?.type !== 'error' && !_matchesCriteria(text, matchCriteria)) return;

      // Record to local log ring buffer
      if (!_listenerLog[listenerId]) _listenerLog[listenerId] = [];
      const entry = { ...data, ts: Date.now(), selector, url: window.location.href };
      _listenerLog[listenerId].push(entry);
      if (_listenerLog[listenerId].length > LISTENER_LOG_MAX) _listenerLog[listenerId].shift();
      // Cap total listener keys to 20 — remove oldest when exceeded
      const keys = Object.keys(_listenerLog);
      if (keys.length > 20) delete _listenerLog[keys[0]];
      // Forward to background
      try { window.__cg?.send('dom:event', { type: 'guardian.listener.event', listenerId, eventData: entry }); } catch (_) {}
    }

    if (mode === 'mutation' || mode === 'chat') {
      let lastText = '';
      let idleTimer = null;
      let realObs   = null;
      let watchObs  = null;

      const host     = window.location.hostname;
      const provider = host.includes('claude')  ? 'claude'
                     : host.includes('chatgpt') ? 'chatgpt' : 'gemini';

      function isStreaming() {
        if (host.includes('chatgpt.com') || host.includes('openai.com'))
          return !!document.querySelector('button[data-testid="stop-button"]');
        if (host.includes('claude.ai'))
          return !!document.querySelector('[data-is-streaming]');
        return false;
      }

      function sendCallto(text, complete) {
        const payload = { text: text.slice(0, 8000), provider, complete,
                          calltoId: _listenerCalltoId || listenerId,
                          requestId: _listenerRequestId || listenerId, listenerId,
                          chars: text.length, ts: Date.now() };
        // Fire immediately — log before idle timer, before truncation
        try { window.__cg?.send('dom:event', { type: 'guardian.callto.stream', payload }); } catch (_) {}
        // Also emit LISTENER_EVENT so background logs it to the persistent store
        emit({ type: 'mutation', text: text.slice(0, 8000), complete,
               chars: text.length, provider });
      }

      function onText(text) {
        if (!text || text === lastText) return;
        lastText = text;
        const done = !isStreaming();
        sendCallto(text, done);
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (lastText) sendCallto(lastText, true);
          stop();
        }, 12000);
      }

      function stop() {
        if (realObs)  { realObs.disconnect();  realObs  = null; }
        if (watchObs) { watchObs.disconnect(); watchObs = null; }
        if (idleTimer){ clearTimeout(idleTimer); idleTimer = null; }
      }

      // ── KEY FIX: count existing messages NOW (before submit) ─────────────
      // Only transfer observer to a message that appears AFTER this count.
      // This prevents attaching to old finished messages from previous runs.
      const countAtAttach = document.querySelectorAll(selector).length;

      function checkForNewElement() {
        const all = document.querySelectorAll(selector);
        // Only consider elements that appeared AFTER we attached
        if (all.length <= countAtAttach) return null;
        // Return the newest element (last in DOM order)
        return all[all.length - 1];
      }

      function attachToElement(el) {
        if (realObs) realObs.disconnect();
        realObs = new MutationObserver(() => {
          // Re-query — ChatGPT may add sibling elements mid-stream
          const latest = checkForNewElement() || el;
          onText(latest.innerText?.trim() || '');
        });
        // Observe the element AND its siblings container for maximum coverage
        const parent = el.parentElement || el;
        realObs.observe(parent, { childList: true, subtree: true, characterData: true });
        // Emit immediately in case text already present
        const t = el.innerText?.trim() || '';
        if (t) onText(t);
        const entry = activeListeners.get(listenerId);
        if (entry) entry.observer = { disconnect: stop };
      }

      // Watch for the new element to appear
      const container = document.querySelector('main') ||
                        document.querySelector('[role="main"]') ||
                        document.querySelector('.flex-1') ||
                        document.body;

      watchObs = new MutationObserver(() => {
        const el = checkForNewElement();
        if (!el) return;
        // Found a genuinely new element — stop watching, start observing it
        watchObs.disconnect(); watchObs = null;
        attachToElement(el);
      });
      watchObs.observe(container, { childList: true, subtree: true });

      // Also check immediately in case new element already appeared
      const immediate = checkForNewElement();
      if (immediate) {
        watchObs.disconnect(); watchObs = null;
        attachToElement(immediate);
      }

      // Failsafe: 90s max
      const failsafe = setTimeout(() => {
        if (lastText) sendCallto(lastText, true);
        stop();
      }, 90000);

      observer = { disconnect() { stop(); clearTimeout(failsafe); } };
    }

    if (mode === 'input') {
      const handler = () => {
        emit({ type: 'input', value: (target.value || target.innerText || '').slice(0, 2000) });
      };
      target.addEventListener('input',  handler);
      target.addEventListener('change', handler);
      observer = { disconnect: () => { target.removeEventListener('input', handler); target.removeEventListener('change', handler); } };
    }

    // Register listener — observer may be a sentinel stub if element not yet present
    activeListeners.set(listenerId, { observer, target: target || null, badge: null });
    return true;
  }

  function detachListenerDOM(listenerId) {
    const entry = activeListeners.get(listenerId);
    if (!entry) return;
    entry.observer?.disconnect();
    entry.badge?.remove();
    activeListeners.delete(listenerId);
  }

  // ── Button wiring ─────────────────────────────────────────────────────────
  document.getElementById('__g-popup-close').addEventListener('click', closeCalltoPopup);
  document.getElementById('__g-btn-cancel').addEventListener('click',  closeCalltoPopup);

  document.getElementById('__g-btn-add').addEventListener('click', commitCallto);

  // §0.59.2 — James: "can you make it so i can use guardian element picker for claude code … the popup when picking an
  // element needs buttons that wre usefull." → CLAUDE CODE hands the element to Clear Glass (dom:event dom.pick.sent), which
  // keeps the last picks (src/page/attention.js) at GET :7702/cli/picks; Claude Code and every agent read them with
  // `idearium picks`. The element's own text and a slice of its HTML go with it, so the agent sees what he pointed at.
  document.getElementById('__g-btn-agent').addEventListener('click', () => {
    if (!_currentFp) return;
    const elx = _currentEl || null;
    let rect = null; try { const r = elx && elx.getBoundingClientRect(); if (r) rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; } catch (_) {}
    const label = (document.getElementById('__g-ct-label').value || '').trim();
    const sent = { type: 'dom.pick.sent', selector: _currentFp.selector, xpath: _currentFp.xpath, url: window.location.href, title: document.title, label: label || null,
      tag: elx ? elx.tagName.toLowerCase() : null, text: elx ? String(elx.innerText || elx.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600) : '',
      html: elx ? String(elx.outerHTML || '').slice(0, 2000) : '', rect, ts: Date.now() };
    try { window.__cg?.send('dom:event', sent); showToast('→ sent to Claude Code — read it with: idearium picks', 'ok'); }
    catch (e2) { showToast('⚠ could not reach Clear Glass: ' + String(e2.message || e2).slice(0, 40), 'warn'); return; }
    closeCalltoPopup(true);
  });
  document.getElementById('__g-btn-copy').addEventListener('click', () => {
    if (!_currentFp) return;
    const t = _currentFp.selector;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error('no clipboard')))
      .then(() => showToast('⧉ selector copied', 'ok'), () => { try { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('⧉ selector copied', 'ok'); } catch (_) { showToast('⚠ copy failed — selector: ' + t.slice(0, 60), 'warn'); } });
  });

  // LISTEN button: opens the listener config modal with the current element.
  // It does NOT commit a callto. Callto popup stays open so user can still ADD TO INDEX.
  document.getElementById('__g-btn-listen').addEventListener('click', () => {
    if (!_currentFp) return;
    // Stash fingerprint for the listener modal
    _pendingListenerId = {
      selector: _currentFp.selector,
      xpath:    _currentFp.xpath,
      url:      window.location.href,
    };
    // Get position from callto popup for placement
    const popupRect = popup.getBoundingClientRect();
    openListenModal(_currentFp, popupRect.right + 8, popupRect.top);
  });

  document.getElementById('__g-ct-regen').addEventListener('click', () => {
    _calltoId = genCalltoId();
    document.getElementById('__g-ct-id').textContent = _calltoId;
  });

  document.getElementById('__g-btn-pick').addEventListener('click', () => {
    closeCalltoPopup(true);
    setTimeout(() => startPicker(pickerMode), 80);
  });

  // ── Zoom controls ─────────────────────────────────────────────────────────
  // Navigate element tree without re-picking. Updates _currentEl + _currentFp.

  function _zoomDepthLabel(el) {
    // Build a compact breadcrumb: body > div#app > section > button
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 5) {
      let label = node.tagName.toLowerCase();
      if (node.id) label += '#' + node.id.slice(0, 12);
      else if (node.className && typeof node.className === 'string') {
        const cls = node.className.trim().split(/\s+/)[0];
        if (cls) label += '.' + cls.slice(0, 12);
      }
      parts.unshift(label);
      node = node.parentElement;
    }
    return parts.join(' › ');
  }

  function _zoomTo(el) {
    if (!el || el === document || el === document.body) return;
    _currentEl = el;
    _currentFp = fingerprint(el);
    _calltoId  = genCalltoId();

    // Update popup fields only — NEVER modify page element styles
    const selEl = document.getElementById('__g-ct-sel');
    const idEl  = document.getElementById('__g-ct-id');
    const depEl = document.getElementById('__g-zoom-depth');
    if (selEl) selEl.textContent = _currentFp.selector.length > 40
      ? '…' + _currentFp.selector.slice(-40) : _currentFp.selector;
    if (idEl)  idEl.textContent  = _calltoId;
    if (depEl) depEl.textContent = _zoomDepthLabel(el);

    // Use the existing selection box (selBox) to highlight — not el.style
    const r = el.getBoundingClientRect();
    if (selBox) {
      selBox.style.left   = (r.left   + window.scrollX) + 'px';
      selBox.style.top    = (r.top    + window.scrollY) + 'px';
      selBox.style.width  = r.width  + 'px';
      selBox.style.height = r.height + 'px';
      selBox.style.display = 'block';
    }

    // Nearby suggestions
    _renderNearbySuggestions(el);
  }

  function _renderNearbySuggestions(el) {
    const nearbyRow   = document.getElementById('__g-nearby-row');
    const nearbyChips = document.getElementById('__g-nearby-chips');
    if (!nearbyRow || !nearbyChips) return;

    const INTERACTIVE_TAGS = new Set(['a','button','input','select','textarea','label','summary','details']);
    const rect  = el.getBoundingClientRect();
    const found = [];

    // Check siblings, parent's siblings, parent's children
    const candidates = [
      ...(el.parentElement ? [...el.parentElement.children] : []),
      ...(el.parentElement?.parentElement ? [...el.parentElement.parentElement.querySelectorAll('a,button,input,select,textarea')] : []),
    ];

    for (const c of candidates) {
      if (c === el) continue;
      if (found.length >= 5) break;
      const cr = c.getBoundingClientRect();
      // Within 120px
      const dist = Math.hypot(cr.left - rect.left, cr.top - rect.top);
      if (dist < 120 || INTERACTIVE_TAGS.has(c.tagName.toLowerCase())) {
        const tag  = c.tagName.toLowerCase();
        const id   = c.id ? '#' + c.id : '';
        const cls  = c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/)[0] : '';
        const text = (c.textContent || '').trim().slice(0, 14);
        if (tag || text) found.push({ el: c, label: (tag + id + cls + (text ? ' "' + text + '"' : '')).slice(0, 28) });
      }
    }

    if (!found.length) { nearbyRow.style.display = 'none'; return; }

    nearbyRow.style.display = 'block';
    nearbyChips.innerHTML = found.map((f, i) =>
      `<div class="__g-nearby-chip" data-nearby-idx="${i}" title="${f.label}">${f.label}</div>`
    ).join('');

    // Use a single delegated listener — set via onclick attribute to avoid accumulation
    nearbyChips.querySelectorAll('.__g-nearby-chip').forEach((chip, i) => {
      chip.dataset.nearbyIdx = i;
    });
    // Replace any previous delegated handler (not addEventListener which stacks)
    nearbyChips.onclick = (ev) => {
      const chip = ev.target.closest('.__g-nearby-chip');
      if (chip) _zoomTo(found[parseInt(chip.dataset.nearbyIdx, 10)].el);
    };
  }

  // Wire zoom buttons
  document.getElementById('__g-zoom-parent').addEventListener('click', () => {
    if (_currentEl?.parentElement && _currentEl.parentElement !== document.body)
      _zoomTo(_currentEl.parentElement);
  });
  document.getElementById('__g-zoom-child').addEventListener('click', () => {
    const child = _currentEl?.firstElementChild;
    if (child) _zoomTo(child);
  });
  document.getElementById('__g-zoom-prev').addEventListener('click', () => {
    const prev = _currentEl?.previousElementSibling;
    if (prev) _zoomTo(prev);
  });
  document.getElementById('__g-zoom-next').addEventListener('click', () => {
    const next = _currentEl?.nextElementSibling;
    if (next) _zoomTo(next);
  });



  // ── Cookie capture ───────────────────────────────────────────
  function captureCookies() {
    try { window.__cg?.send('dom:event', { type: 'guardian.cookies.capture', cookies: document.cookie, url: window.location.href }); } catch (_) {}
    // §FOUND & FIXED 2026-09-08 — was "🍪 cookies captured," claiming
    // full, real success. §1.2: the real receiving handler
    // (ipc/bridge.js) only logs this right now — no real, secure
    // storage exists yet — so the toast must not claim more than what
    // actually happened.
    showToast('🍪 cookies sent (logged — real storage not yet built)');
  }


  // ── Real, host-facing control surface ───────────────────────────────
  // Matches the real, existing pattern the current, simpler PICKER_SCRIPT
  // already uses (window.__cgPicker.destroy()) — not a new mechanism.
  window.__gPickerActive = {
    startPick: () => startPicker('callto'),
    startListen: () => startPicker('listener'),
    stop: () => stopPicker(),
    killswitch: () => triggerKillswitch('host', true),
    destroy() {
      stopPicker(true); closeCalltoPopup(true); closeListenModal(); for (const [lid] of activeListeners) detachListenerDOM(lid); activeListeners.clear();
      _life.abort();   // §0.59.2 — and remove what this run made, so the next run starts clean
      for (const e of [STYLE, selBox, overlay, tip, escHint, toast, popup, listenModal]) { try { e.remove(); } catch (_) {} }
      if (window.__gPickerActive === this) window.__gPickerActive = null;
    },
  };

  // Global ESC already wired above via onGlobalEsc. Auto-start in pick mode
  // on injection — matches the current PICKER_SCRIPT's own real behavior
  // (starts picking immediately when injected via the context-menu action).
  startPicker('callto');
})();
