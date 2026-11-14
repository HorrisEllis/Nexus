/* cos/ui/pipeline-editor/field-pipeline-kind.preview.js — PREVIEW (sample data): a pipeline as a KIND on ERAVOS's Field (tools/core/field).
 * James, 2026-11-14: "look at field or workshop, also tabs on sides, remove the start just have the add. yes, like each step, gate,
 * relationship, from raid to end state, anything, events from an application, emerge coding word by word, visual debugging, running
 * frameworks or pipelines, recursive and meta, like any process, system, etc can be systematized, stepwise, broken down, chunked, or bricks,
 * or gaps, step, analysis or decomposition, its my framework" · "no in eravos canvas repo"
 * The Field is domain-free: a kind gives it layers, an outline, a picture and a status, and it gives the kind layers, outliner, properties,
 * history and undo. A pipeline is one kind; the same kind shape holds an app's events, Emerge word by word, a debug run, a framework. */
(function () {
  const NODES = [
    { id: 'input', label: 'Input', kind: 'input', group: 'RAID', type: 'events', sub: '"build IN0_baseline"', state: 'done', x: .1, y: .18 },
    { id: 'raid', label: 'RAID decides', kind: 'raid', group: 'RAID', type: 'constraint', sub: 'agent ollama · contract c-in-1794', state: 'done', x: .24, y: .18 },
    { id: 'c1', label: 'What can be built', kind: 'compartment', group: 'COMPARTMENTS', type: 'value', sub: 'idearium · 0.4 s / 0.5', state: 'done', x: .38, y: .18 },
    { id: 'g1', label: 'Answer is usable', kind: 'gate', group: 'GATES', type: 'constraint', sub: 'check · open', state: 'done', x: .52, y: .18 },
    { id: 'c2', label: 'Mapped, DAG whole', kind: 'compartment', group: 'COMPARTMENTS', type: 'value', sub: 'idearium · 1.1 s / 1.0', state: 'done', x: .65, y: .18 },
    { id: 'g2', label: 'DAG gate', kind: 'gate', group: 'GATES', type: 'constraint', sub: 'dag · open', state: 'done', x: .8, y: .18 },
    { id: 'c3', label: 'Write the files', kind: 'compartment', group: 'COMPARTMENTS', type: 'emergent', sub: 'ollama · 2 m 41 s / 4 m 20', state: 'live', x: .8, y: .52, bricks: 3 },
    { id: 'gap', label: 'Gap: which tree?', kind: 'gap', group: 'GAPS', type: 'constraint', sub: 'asked · from RQ8', state: 'held', x: .8, y: .82 },
    { id: 'g3', label: 'Tests pass', kind: 'gate', group: 'GATES', type: 'constraint', sub: 'tests · waiting', state: 'wait', x: .64, y: .52 },
    { id: 'c4', label: 'Close on evidence', kind: 'compartment', group: 'COMPARTMENTS', type: 'value', sub: 'cortex · usual 2 s', state: 'wait', x: .5, y: .52 },
    { id: 'g4', label: 'You approve', kind: 'gate', group: 'GATES', type: 'constraint', sub: 'person · yours', state: 'held', x: .36, y: .52 },
    { id: 'end', label: 'End state', kind: 'end', group: 'END STATE', type: 'emergent', sub: 'IN0_baseline built, its proof passes', state: 'wait', x: .2, y: .52 },
  ];
  const WIRES = [['input','raid'],['raid','c1'],['c1','g1'],['g1','c2'],['c2','g2'],['g2','c3'],['c3','gap'],['c3','g3'],['g3','c4'],['c4','g4'],['g4','end']];
  const COL = { done: '#00ff88', live: '#00d4ff', wait: '#4a5b6e', held: '#ffaa00' };
  const at = (n, W, H) => [n.x * W, n.y * H];
  const kind = {
    id: 'nexus.pipeline', label: 'Pipeline',
    title: () => 'Idearium build · IN0_baseline',
    stations: () => ['RAID', 'PLAN', 'BUILD', 'PROVE', 'END STATE'],
    layers: () => NODES.map(n => ({ id: n.id, label: n.label, group: n.group, type: n.type, sub: n.sub,
      fields: [{ key: n.id + '.label', label: 'Name', type: 'text' }, { key: n.id + '.state', label: 'State', type: 'enum', options: ['wait', 'live', 'done', 'held'] }] })),
    get: (d, k) => { const [id, f] = k.split('.'); const n = NODES.find(x => x.id === id); return n ? n[f] : undefined; },
    set: (d, k, v) => d,
    outline: () => [[0, 'RAID · contract c-in-1794', 'raid'], [1, 'Plan', 'c1'], [2, 'What can be built', 'c1'], [2, '◇ Answer is usable', 'g1'],
      [2, 'Mapped, DAG whole', 'c2'], [2, '◇ DAG gate', 'g2'], [1, 'Build', 'c3'], [2, 'Write the files · 3 bricks', 'c3'], [3, '▸ brick 1 · read', 'c3'],
      [3, '▸ brick 2 · write', 'c3'], [3, '▸ brick 3 · check', 'c3'], [2, '? Gap: which tree', 'gap'], [1, 'Prove', 'g3'], [2, '◇ Tests pass', 'g3'],
      [2, 'Close on evidence', 'c4'], [2, '◇ You approve', 'g4'], [0, '◎ End state', 'end']],
    status: () => [['RUN', 'a91f'], ['PASSED', '5 of 9'], ['AGENT', 'ollama · local'], ['MEMORY', '71%']],
    actions: () => [{ label: '▶ Run', strip: true, run: () => 'running' }, { label: '❚❚ Pause', strip: true, run: () => 'paused' }, { label: '↻ From…', run: () => 'pick a step' }],
    addable: () => [{ section: 'STEP', label: 'Compartment', key: 'add', value: 'compartment' }, { section: 'STEP', label: 'Gate', key: 'add', value: 'gate' },
      { section: 'STEP', label: 'Relation', key: 'add', value: 'relation' }, { section: 'BREAK DOWN', label: 'Brick (chunk)', key: 'add', value: 'brick' },
      { section: 'BREAK DOWN', label: 'Gap', key: 'add', value: 'gap' }, { section: 'META', label: 'A pipeline as a step', key: 'add', value: 'pipeline' }],
    draw(g, W, H, d, o) {
      g.fillStyle = '#07090d'; g.fillRect(0, 0, W, H);
      g.lineWidth = 2.2;
      for (const [a, b] of WIRES) { const A = NODES.find(n => n.id === a), B = NODES.find(n => n.id === b); const [x1, y1] = at(A, W, H), [x2, y2] = at(B, W, H);
        g.strokeStyle = COL[B.state === 'wait' ? 'wait' : A.state === 'done' && B.state !== 'held' ? (B.state === 'live' ? 'live' : 'done') : B.state] ; g.globalAlpha = .75;
        g.beginPath(); g.moveTo(x1, y1); const mx = (x1 + x2) / 2; g.bezierCurveTo(mx, y1, mx, y2, x2, y2); g.stroke(); g.globalAlpha = 1; }
      for (const n of NODES) { const [x, y] = at(n, W, H); const c = COL[n.state]; const sel = o && o.selected === n.id;
        g.shadowColor = c; g.shadowBlur = n.state === 'live' || sel ? 18 : 0;
        if (n.kind === 'gate' || n.kind === 'gap') { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = '#0b1018'; g.fillRect(-15, -15, 30, 30); g.strokeStyle = c; g.strokeRect(-15, -15, 30, 30); g.restore(); }
        else { const w = n.kind === 'end' ? 190 : 168, h = 48; g.fillStyle = n.kind === 'end' ? '#140f22' : '#0f1520'; g.fillRect(x - w / 2, y - h / 2, w, h); g.strokeStyle = n.kind === 'end' ? '#b066ff' : c; g.strokeRect(x - w / 2, y - h / 2, w, h);
          if (n.bricks) for (let i = 0; i < n.bricks; i++) { g.fillStyle = i < 2 ? '#00d4ff' : '#223044'; g.fillRect(x - w / 2 + 8 + i * 16, y + h / 2 - 9, 12, 4); } }
        g.shadowBlur = 0; g.fillStyle = '#d6e4f0'; g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(n.label, x, n.kind === 'gate' || n.kind === 'gap' ? y + 34 : y - 4);
        g.fillStyle = '#7f93a8'; g.font = '10px "JetBrains Mono", monospace'; g.fillText(n.sub.length > 22 ? n.sub.slice(0, 21) + '…' : n.sub, x, n.kind === 'gate' || n.kind === 'gap' ? y + 48 : y + 11);
        if (sel) { g.strokeStyle = '#b066ff'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.strokeRect(x - 84, y - 30, 168, 60); g.setLineDash([]); g.lineWidth = 2.2; } }
    },
  };
  window.__pipelineKind = kind;
})();
