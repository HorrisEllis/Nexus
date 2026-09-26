// ui/home/areas/spec-wizard.js — Spec wizard modal.
// Split from ui/home/index.html (inline script, lines 2754-2939 at v0.39.227). Load order is set by index.html; do not reorder.
// comp_id: nexus.ui.tv-shell.spec-wizard
  // ── Spec wizard state ─────────────────────────────────────────────────────────
let _wizAgent   = 'ollama';
let _wizSpecUuid = null;
let _wizBuildInterval = null;

function openSpecWizard() {
  // Check if there are existing specs — if yes, show list first
  fetch(`${B.orch}/api/spec-engine/specs`).then(r=>r.json()).then(d => {
    if (d.specs && d.specs.length > 0) {
      _renderSpecList(d.specs);
      wizShowStep(3);
    } else {
      wizShowStep(1);
    }
  }).catch(() => wizShowStep(1));
  document.getElementById('spec-wizard-overlay').classList.add('open');
}

function closeSpecWizard() {
  document.getElementById('spec-wizard-overlay').classList.remove('open');
  if (_wizBuildInterval) { clearInterval(_wizBuildInterval); _wizBuildInterval = null; }
}

function wizShowStep(n) {
  for (let i=1;i<=3;i++) {
    const el = document.getElementById(`swiz-step-${i}`);
    if (el) el.style.display = i===n ? '' : 'none';
  }
}

function selectWizAgent(agent, el) {
  _wizAgent = agent;
  document.querySelectorAll('.swiz-agent').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
}

async function wizNext() {
  const name = document.getElementById('swiz-name').value.trim();
  const type = document.getElementById('swiz-type').value;
  const desc = document.getElementById('swiz-desc').value.trim();
  if (!name) { document.getElementById('swiz-name').focus(); return; }

  const r = await post(`${B.orch}/api/spec-engine/specs`, { name, type, description: desc, agent: _wizAgent });
  if (!r?.manifest) { alert('Failed to create spec: ' + (r?.error || 'unknown')); return; }

  _wizSpecUuid = r.manifest.uuid;
  _renderChunkGrid(r.manifest);
  document.getElementById('swiz-s2-title').textContent = r.manifest.name.toUpperCase();
  document.getElementById('swiz-s2-sub').textContent =
    `${r.manifest.totalChunks} chunks · agent: ${r.manifest.agent} · uuid: ${r.manifest.uuid.slice(0,8)}`;
  wizShowStep(2);
}

function _renderChunkGrid(manifest) {
  const grid = document.getElementById('swiz-chunk-grid');
  grid.innerHTML = manifest.chunks.map(c => `
    <div class="swiz-chunk ${c.status}" id="chunk-${c.uuid.slice(0,8)}">
      <div class="swiz-chunk-title">${String(c.chunkIdx+1).padStart(2,'0')} ${c.sectionTitle}</div>
      <div class="swiz-chunk-desc">${c.sectionDesc.slice(0,80)}</div>
      <div class="swiz-chunk-status" id="chunkst-${c.uuid.slice(0,8)}">
        ${c.status === 'complete' ? '✓ done' : c.status === 'building' ? '⟳ building…' : c.status === 'failed' ? '✗ failed' : '○ pending'}
      </div>
      <div style="font-size:9px;color:rgba(255,255,255,.2);margin-top:4px;word-break:break-all">
        ${c.seam_id.slice(0,40)}
      </div>
    </div>
  `).join('');
  _updateProgress(manifest);
}

function _updateProgress(manifest) {
  const pct = manifest.progress || 0;
  document.getElementById('swiz-progress').style.width = pct + '%';
  document.getElementById('swiz-progress-text').textContent =
    `${manifest.doneChunks} / ${manifest.totalChunks} chunks · ${pct}%`;
}

async function wizBuildNext() {
  if (!_wizSpecUuid) return;
  const btn = document.getElementById('swiz-build-btn');
  btn.disabled = true;
  btn.textContent = '⟳ BUILDING…';

  const r = await post(`${B.orch}/api/spec-engine/specs/${_wizSpecUuid}/build`,
    { agent: _wizAgent });

  if (r?.chunkUuid) {
    const el = document.getElementById(`chunk-${r.chunkUuid.slice(0,8)}`);
    const st = document.getElementById(`chunkst-${r.chunkUuid.slice(0,8)}`);
    if (el) el.className = 'swiz-chunk building';
    if (st) st.textContent = '⟳ building…';
    // Poll for completion
    _pollChunk(r.chunkUuid);
  }
  btn.disabled = false;
  btn.textContent = '▶ BUILD NEXT CHUNK';
}

async function wizBuildAll() {
  if (!_wizSpecUuid) return;
  // Trigger builds sequentially — each triggers when previous completes
  _autoBuildLoop();
}

async function _autoBuildLoop() {
  if (!_wizSpecUuid) return;
  const m = await fetch(`${B.orch}/api/spec-engine/specs/${_wizSpecUuid}`)
    .then(r=>r.json()).then(d=>d.manifest).catch(()=>null);
  if (!m) return;
  if (m.status === 'complete') { return; }
  const pending = m.chunks.filter(c => c.status === 'pending');
  const building = m.chunks.filter(c => c.status === 'building');
  if (building.length > 0) {
    // Already building — wait
    setTimeout(_autoBuildLoop, 3000); return;
  }
  if (pending.length === 0) return;
  await wizBuildNext();
}

async function _pollChunk(chunkUuid) {
  // Poll spec manifest until chunk is complete/failed
  const short = chunkUuid.slice(0,8);
  let polls = 0;
  const interval = setInterval(async () => {
    polls++;
    if (polls > 120) { clearInterval(interval); return; } // 2min timeout
    const m = await fetch(`${B.orch}/api/spec-engine/specs/${_wizSpecUuid}`)
      .then(r=>r.json()).then(d=>d.manifest).catch(()=>null);
    if (!m) return;
    const chunk = m.chunks.find(c=>c.uuid.slice(0,8)===short || c.uuid===chunkUuid);
    if (!chunk) { clearInterval(interval); return; }

    const el = document.getElementById(`chunk-${short}`);
    const st = document.getElementById(`chunkst-${short}`);

    if (chunk.status === 'complete') {
      clearInterval(interval);
      if (el) el.className = 'swiz-chunk complete';
      if (st) st.textContent = `✓ done · ${Math.round(chunk.byteSize/1024*10)/10}kb`;
      _updateProgress(m);
      if (m.status === 'complete') {
        document.getElementById('swiz-build-btn').textContent = '✓ COMPLETE';
      }
    } else if (chunk.status === 'failed' || chunk.status === 'escalated') {
      clearInterval(interval);
      if (el) el.className = 'swiz-chunk failed';
      if (st) st.textContent = `✗ failed: ${(chunk.failureMode||'').slice(0,40)}`;
    }
  }, 1500);
}

function _renderSpecList(specs) {
  const list = document.getElementById('swiz-spec-list');
  if (!specs.length) {
    list.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:12px;text-align:center;padding:20px">No specs yet</div>';
    return;
  }
  list.innerHTML = specs.map(s => `
    <div class="swiz-spec-item" onclick="wizOpenSpec('${s.uuid}')">
      <div>
        <div class="swiz-spec-name">${s.name}</div>
        <div class="swiz-spec-meta">${s.type} · ${s.status} · ${new Date(s.updatedAt).toLocaleString()}</div>
      </div>
      <div style="text-align:right">
        <div class="swiz-progress-bar" style="width:80px">
          <div class="swiz-progress-fill" style="width:${s.progress||0}%"></div>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:3px">${s.doneChunks||0}/${s.totalChunks} chunks</div>
      </div>
    </div>
  `).join('');
}

async function wizOpenSpec(uuid) {
  _wizSpecUuid = uuid;
  const r = await fetch(`${B.orch}/api/spec-engine/specs/${uuid}`).then(x=>x.json());
  if (!r.manifest) return;
  const m = r.manifest;
  _renderChunkGrid(m);
  document.getElementById('swiz-s2-title').textContent = m.name.toUpperCase();
  document.getElementById('swiz-s2-sub').textContent =
    `${m.totalChunks} chunks · agent: ${m.agent} · uuid: ${m.uuid.slice(0,8)}`;
  wizShowStep(2);
}
