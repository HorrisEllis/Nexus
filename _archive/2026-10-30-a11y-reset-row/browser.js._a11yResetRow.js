// renderer/browser.js _a11yResetRow at 0.60.296, superseded by renderer/a11y-panel.js (AC2, 2026-10-30). Kept per §0.3.
  // 0.60.283 — James, 2026-10-29: "The accessability man. i can't fix it." A site that remembers its accessibility look (Fiverr) loads with it
  // on, so Tab mode Off had nothing to undo. "Reset" finds what holds it (classes, storage, cookies), backs it up, removes it, sets the site
  // to Off and reloads; the row says what it found, or that nothing matched and which names it looked at.
  function _a11yResetRow(root) {
    const g = root.querySelector('[data-feature="accessibility"]'); if (!g || !cg.siteProfile || !cg.siteProfile.a11yReset) return;
    const row = document.createElement('div'); row.className = 'sp-a11y';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sp-a11y-reset'; b.textContent = 'Reset this site’s accessibility look';
    const note = document.createElement('div'); note.className = 'sp-note sp-a11y-note';
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); b.disabled = true; note.textContent = 'Looking…';
      try {
        const r = await cg.siteProfile.a11yReset(_wcId());
        if (!r || r.ok === false) throw new Error((r && r.error) || 'no answer');
        const what = [].concat(r.classes.html.map(c => `class ${c}`), r.classes.body.map(c => `class ${c}`), Object.keys(r.attrs.html).concat(Object.keys(r.attrs.body)).map(a => `attribute ${a}`),
          r.storage.map(x => `${x.area} storage ${x.key}`), r.cookies.map(c => `cookie ${c}`));
        note.textContent = what.length ? `Removed ${what.join(', ')} (backed up), set this site to Off, and reloaded.`
          : `Nothing on this page is named as accessibility. Set this site to Off and reloaded. Looked at: ${r.otherKeys.length} storage keys, ${r.otherCookies.length} cookies${r.link ? `; a link looks ${r.link.color} on ${r.link.background}, spacing ${r.link.letterSpacing}` : ''}.`;
        note.title = JSON.stringify({ storageKeys: r.otherKeys, cookies: r.otherCookies, backup: r.backup || null });
      } catch (err) { note.textContent = `Could not reset: ${err.message}`; }
      b.disabled = false;
    });
    row.append(b, note); g.append(row);
  }
