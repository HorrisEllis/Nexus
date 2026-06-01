/**
 * forge-pipeline.js — Pipeline engine + SEAM compiler + condition evaluator
 * ──────────────────────────────────────────────────────────────────────────
 * UUID:    forge-pipeline-0002-2026-0530-jamesbrooks
 * VERSION: 1.0.0
 *
 * Node types (all SEAM-web-aligned):
 *   trigger    — manual | cron | event | condition | webhook | schedule | chain
 *   condition  — if/then/else gate (SEAM if·when node)
 *   transform  — pure function over data (SEAM make·set node)
 *   api_call   — HTTP fetch (SEAM call·stream node)
 *   agent_call — Guardian/Idearium dispatch (SEAM route·snr node)
 *   store      — write to JAA (SEAM write·read node)
 *   emit       — SISO bus event (SEAM emit·watch node)
 *   loop       — iterate array (SEAM for-each node)
 *   delay      — wait N ms (SEAM while·until node)
 *   seam_compile — run SEAM Pass 0→2 compiler
 *   gap        — declare gap (SEAM gap·fill node)
 *   notify     — toast / log (SEAM show node)
 *   merge      — join parallel branches
 *   fork       — parallel branch execution
 *   webhook_out — fire outbound webhook
 *
 * SEAM condition evaluator: hand-rolled safe expr parser (no eval).
 * Supports: ===, !==, <, >, <=, >=, &&, ||, !, ternary, dot-paths,
 *           includes(), startsWith(), endsWith(), length, arithmetic.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════
// SEAM CONDITION EVALUATOR (inlined — no external deps)
// ══════════════════════════════════════════════════════════════════════

const MAX_EXPR_LEN = 2048;
const MAX_DEPTH    = 32;

const TT = {
  NUM:'NUM',STR:'STR',BOOL:'BOOL',NULL:'NULL',
  ID:'ID',DOT:'DOT',LBRACK:'LBRACK',RBRACK:'RBRACK',
  LPAREN:'LPAREN',RPAREN:'RPAREN',
  EQ:'EQ',NEQ:'NEQ',LT:'LT',GT:'GT',LTE:'LTE',GTE:'GTE',
  AND:'AND',OR:'OR',NOT:'NOT',
  QMARK:'QMARK',COLON:'COLON',
  PLUS:'PLUS',MINUS:'MINUS',STAR:'STAR',SLASH:'SLASH',
  COMMA:'COMMA',EOF:'EOF',
};

function tokenise(src) {
  if (src.length > MAX_EXPR_LEN) throw new SeamEvalError(`Expression too long`);
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (/\d/.test(src[i]) || (src[i]==='-' && /\d/.test(src[i+1]??''))) {
      let num = '';
      if (src[i]==='-') num += src[i++];
      while (i < src.length && /[\d.]/.test(src[i])) num += src[i++];
      tokens.push({ t: TT.NUM, v: parseFloat(num) }); continue;
    }
    if (src[i]==='"' || src[i]==="'") {
      const q = src[i++]; let str = '';
      while (i < src.length && src[i] !== q) {
        if (src[i]==='\\') { i++; str += src[i] ?? ''; } else str += src[i]; i++;
      }
      i++; tokens.push({ t: TT.STR, v: str }); continue;
    }
    if (/[a-zA-Z_$]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[\w$]/.test(src[i])) id += src[i++];
      if (id==='true')  { tokens.push({ t: TT.BOOL, v: true });  continue; }
      if (id==='false') { tokens.push({ t: TT.BOOL, v: false }); continue; }
      if (id==='null')  { tokens.push({ t: TT.NULL, v: null });  continue; }
      tokens.push({ t: TT.ID, v: id }); continue;
    }
    const three = src.slice(i, i+3);
    if (three==='===') { tokens.push({ t: TT.EQ  }); i+=3; continue; }
    if (three==='!==') { tokens.push({ t: TT.NEQ }); i+=3; continue; }
    const two = src.slice(i, i+2);
    if (two==='<=')  { tokens.push({ t: TT.LTE }); i+=2; continue; }
    if (two==='>=')  { tokens.push({ t: TT.GTE }); i+=2; continue; }
    if (two==='&&')  { tokens.push({ t: TT.AND }); i+=2; continue; }
    if (two==='||')  { tokens.push({ t: TT.OR  }); i+=2; continue; }
    const ch = src[i++];
    const map = {
      '.':TT.DOT,'[':TT.LBRACK,']':TT.RBRACK,
      '(':TT.LPAREN,')':TT.RPAREN,
      '<':TT.LT,'>':TT.GT,'!':TT.NOT,
      '?':TT.QMARK,':':TT.COLON,
      '+':TT.PLUS,'-':TT.MINUS,'*':TT.STAR,'/':TT.SLASH,
      ',':TT.COMMA,
    };
    const tt = map[ch];
    if (!tt) throw new SeamEvalError(`Unexpected char: '${ch}'`);
    tokens.push({ t: tt });
  }
  tokens.push({ t: TT.EOF });
  return tokens;
}

class SeamEvaluator {
  constructor(tokens, ctx) { this._tok=tokens; this._pos=0; this._ctx=ctx; this._depth=0; }
  _peek()    { return this._tok[this._pos]; }
  _consume() { return this._tok[this._pos++]; }
  _expect(type) {
    const tok = this._consume();
    if (tok.t !== type) throw new SeamEvalError(`Expected ${type}, got ${tok.t}`);
    return tok;
  }
  _match(...types) { if (types.includes(this._peek().t)) return this._consume(); return null; }
  _guard() { if (++this._depth > MAX_DEPTH) throw new SeamEvalError('Depth limit'); }

  eval() {
    const v = this._ternary();
    if (this._peek().t !== TT.EOF) throw new SeamEvalError(`Unexpected: ${this._peek().t}`);
    return v;
  }
  _ternary() { this._guard(); let v=this._or(); if(this._match(TT.QMARK)){const t=this._ternary();this._expect(TT.COLON);const f=this._ternary();return v?t:f;} return v; }
  _or()      { this._guard(); let v=this._and(); while(this._match(TT.OR)) v=(v||this._and()); return v; }
  _and()     { this._guard(); let v=this._eq(); while(this._match(TT.AND)) v=(v&&this._eq()); return v; }
  _eq()      { this._guard(); let v=this._rel(); const op=this._match(TT.EQ,TT.NEQ); if(op){const r=this._rel();return op.t===TT.EQ?v===r:v!==r;} return v; }
  _rel()     { this._guard(); let v=this._add(); const op=this._match(TT.LT,TT.GT,TT.LTE,TT.GTE); if(op){const r=this._add();if(op.t===TT.LT)return v<r;if(op.t===TT.GT)return v>r;if(op.t===TT.LTE)return v<=r;return v>=r;} return v; }
  _add()     { this._guard(); let v=this._mul(),op; while((op=this._match(TT.PLUS,TT.MINUS))){const r=this._mul();if(typeof v!=='number'||typeof r!=='number')throw new SeamEvalError('Arithmetic requires numbers');v=op.t===TT.PLUS?v+r:v-r;} return v; }
  _mul()     { this._guard(); let v=this._unary(),op; while((op=this._match(TT.STAR,TT.SLASH))){const r=this._unary();if(typeof v!=='number'||typeof r!=='number')throw new SeamEvalError('Arithmetic requires numbers');if(op.t===TT.SLASH&&r===0)throw new SeamEvalError('Division by zero');v=op.t===TT.STAR?v*r:v/r;} return v; }
  _unary()   { this._guard(); if(this._match(TT.NOT))return !this._unary(); return this._postfix(this._primary()); }

  _primary() {
    this._guard();
    const tok = this._peek();
    if (tok.t===TT.NUM)  { this._consume(); return tok.v; }
    if (tok.t===TT.STR)  { this._consume(); return tok.v; }
    if (tok.t===TT.BOOL) { this._consume(); return tok.v; }
    if (tok.t===TT.NULL) { this._consume(); return null; }
    if (tok.t===TT.LPAREN) { this._consume(); const v=this._ternary(); this._expect(TT.RPAREN); return v; }
    if (tok.t===TT.ID) return this._path();
    throw new SeamEvalError(`Unexpected primary: ${tok.t}`);
  }

  _path() {
    const name = this._expect(TT.ID).v;
    const val = this._lookupRoot(name);
    return this._postfix(val, name);
  }

  _postfix(val, label='') {
    this._guard();
    while (true) {
      const tok = this._peek();
      if (tok.t===TT.DOT) {
        this._consume();
        const key = this._expect(TT.ID).v;
        val = this._safeProp(val, key);
        label += '.' + key;
        continue;
      }
      if (tok.t===TT.LBRACK) {
        this._consume();
        const key = this._ternary();
        this._expect(TT.RBRACK);
        val = this._safeProp(val, key);
        label += `[${key}]`;
        continue;
      }
      if (tok.t===TT.LPAREN) {
        this._consume();
        const args = [];
        while (this._peek().t !== TT.RPAREN) { args.push(this._ternary()); this._match(TT.COMMA); }
        this._expect(TT.RPAREN);
        val = this._callMethod(val, label, args);
        continue;
      }
      break;
    }
    return val;
  }

  _callMethod(target, label, args) {
    const ALLOWED = new Set(['includes','startsWith','endsWith','indexOf','length','toString','trim','toLowerCase','toUpperCase']);
    const method  = label.split('.').pop();
    if (!ALLOWED.has(method)) throw new SeamEvalError(`Method not allowed: ${method}`);
    if (method==='length') return (target??'').length;
    if (typeof target?.[method]==='function') return target[method](...args);
    return undefined;
  }

  _safeProp(obj, key) {
    if (obj === null || obj === undefined) return undefined;
    return obj[key];
  }

  _lookupRoot(name) {
    if (Object.prototype.hasOwnProperty.call(this._ctx, name)) return this._ctx[name];
    const dash = name.replace(/_/g, '-');
    if (Object.prototype.hasOwnProperty.call(this._ctx, dash)) return this._ctx[dash];
    return undefined;
  }
}

class SeamEvalError extends Error { constructor(m) { super(m); this.name = 'SeamEvalError'; } }

function seamEval(expr, ctx = {}) {
  if (typeof expr !== 'string') return !!expr;
  const tokens = tokenise(expr.trim());
  return new SeamEvaluator(tokens, ctx).eval();
}

function seamEvalSafe(expr, ctx = {}) {
  try { return !!seamEval(expr, ctx); }
  catch (_) { return false; }
}

function validateExpr(expr) {
  try { tokenise(expr.trim()); return { valid: true, error: null }; }
  catch (e) { return { valid: false, error: e.message }; }
}

// ══════════════════════════════════════════════════════════════════════
// SEAM COMPILER — Pass 0 (web path) + Pass 1 (constraint field) + Pass 2 (JS)
// ══════════════════════════════════════════════════════════════════════

// SEAM web nodes (ring 1 → ring 2)
const SEAM_WEB = {
  // Ring 1 primitives
  'make': { ring:1, pos:'NW', adjacent:['set','write','emit','if'] },
  'set':  { ring:1, pos:'NW', adjacent:['make','write','emit','if'] },
  'write':{ ring:1, pos:'NW', adjacent:['make','read','define'] },
  'read': { ring:1, pos:'NW', adjacent:['write','find','lens'] },
  'emit': { ring:1, pos:'NE', adjacent:['watch','make','set','when'] },
  'watch':{ ring:1, pos:'NE', adjacent:['emit','when','if'] },
  'when': { ring:1, pos:'S',  adjacent:['if','emit','watch','find','tension'] },
  'if':   { ring:1, pos:'S',  adjacent:['when','otherwise','tension','find'] },
  'otherwise':{ ring:1, pos:'S', adjacent:['if','when'] },
  'gap':  { ring:1, pos:'E',  adjacent:['fill','find','where'] },
  'fill': { ring:1, pos:'E',  adjacent:['gap','find'] },
  'find': { ring:1, pos:'SE', adjacent:['where','if','gap','first','last'] },
  'where':{ ring:1, pos:'SE', adjacent:['find','if','for-each','count'] },
  'tension':  { ring:1, pos:'SW', adjacent:['constrain','if','when'] },
  'constrain':{ ring:1, pos:'SW', adjacent:['tension','gap'] },
  'lens':     { ring:1, pos:'W',  adjacent:['field','read','find'] },
  'field':    { ring:1, pos:'W',  adjacent:['lens','constrain'] },
  'show':     { ring:1, pos:'N',  adjacent:['make','define','snr'] },
  // Ring 2 composites
  'define':    { ring:2, pos:'N',  adjacent:['using','given','make','blueprint'] },
  'using':     { ring:2, pos:'N',  adjacent:['define','given'] },
  'given':     { ring:2, pos:'N',  adjacent:['define','using'] },
  'blueprint': { ring:2, pos:'NE', adjacent:['compress','define','snr'] },
  'compress':  { ring:2, pos:'NE', adjacent:['blueprint','decompress','write'] },
  'decompress':{ ring:2, pos:'NE', adjacent:['compress','read'] },
  'hook':      { ring:2, pos:'NE', adjacent:['wire','emit','watch','call'] },
  'wire':      { ring:2, pos:'NE', adjacent:['hook','emit'] },
  'call':      { ring:2, pos:'NE', adjacent:['hook','stream','make'] },
  'stream':    { ring:2, pos:'NE', adjacent:['call','watch'] },
  'replay':    { ring:2, pos:'SE', adjacent:['rewind','clip','until'] },
  'rewind':    { ring:2, pos:'SE', adjacent:['replay','clip'] },
  'clip':      { ring:2, pos:'SE', adjacent:['replay','rewind','compress'] },
  'translate': { ring:2, pos:'W',  adjacent:['clip','field','lens'] },
  'snr':       { ring:2, pos:'S',  adjacent:['route','blueprint','when','if'] },
  'route':     { ring:2, pos:'S',  adjacent:['snr','emit'] },
  'propose':   { ring:2, pos:'SW', adjacent:['accept','reject','tension'] },
  'accept':    { ring:2, pos:'SW', adjacent:['propose','reject'] },
  'reject':    { ring:2, pos:'SW', adjacent:['propose','accept'] },
  'bridge':    { ring:2, pos:'ANY', adjacent:[] }, // explicit non-adjacent jump
};

class SeamCompiler {
  constructor() {
    this.keywords = new Map(Object.entries(SEAM_WEB));
    this.grammar  = new Map(); // custom keyword → node
  }

  // ── Pass 0: Web Path Extraction ──────────────────────────────────
  pass0(source) {
    const lines  = source.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const path   = [];
    const violations = [];
    const gaps   = [];

    for (const line of lines) {
      const tokens = line.trim().split(/\s+/);
      const kw     = tokens[0].toLowerCase();
      const node   = this.keywords.get(kw) ?? this.grammar.get(kw);
      if (!node) {
        // Unknown keyword → seam proposal event
        gaps.push({ type: 'UNKNOWN-KEYWORD', keyword: kw, pressure: 0.5,
          suggestion: `propose "${kw}" meaning: ...` });
        continue;
      }
      // Adjacency check
      if (path.length > 0) {
        const prev     = path[path.length - 1];
        const prevNode = this.keywords.get(prev) ?? this.grammar.get(prev);
        if (prevNode && !prevNode.adjacent.includes(kw) && kw !== 'bridge') {
          violations.push({ from: prev, to: kw, pressure: 0.8,
            fix: `bridge ${prev} to ${kw}: ...` });
        }
      }
      path.push(kw);
    }

    const shape = this._nameShape(path);
    return { path, shape, violations, gaps };
  }

  // ── Pass 1: Constraint Field ──────────────────────────────────────
  pass1(source) {
    const constraints = [];
    const states      = [];
    const fieldGaps   = [];
    const lines = source.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

    for (const line of lines) {
      const l = line.trim();
      // make name = value
      const makeM = l.match(/^make\s+(\w+)\s*=\s*(.+)$/);
      if (makeM) {
        states.push({ name: makeM[1], value: makeM[2].trim() });
        constraints.push({ type:'hard', name:`${makeM[1]}-declared`,
          condition: { declared: makeM[1], value: makeM[2].trim() } });
        continue;
      }
      // constrain name by (...)
      const conM = l.match(/^constrain\s+(\S+)\s+by\s+(.+)$/);
      if (conM) {
        constraints.push({ type:'hard', name:`${conM[1]}-range`,
          condition: { name: conM[1], constraint: conM[2].trim() } });
        continue;
      }
      // gap "id" with pressure N
      const gapM = l.match(/^gap\s+"([^"]+)"\s+with\s+pressure\s+([\d.]+)/);
      if (gapM) {
        fieldGaps.push({ id: gapM[1], pressure: parseFloat(gapM[2]), status:'open' });
        continue;
      }
      // if condition
      const ifM = l.match(/^if\s+(.+):$/);
      if (ifM) {
        constraints.push({ type:'branch', condition: ifM[1].trim(),
          branches: { then: [], otherwise: [] } });
        continue;
      }
    }

    return { constraints, states, gaps: fieldGaps };
  }

  // ── Pass 2: JavaScript Projection ────────────────────────────────
  pass2(source, field) {
    const lines = [];
    lines.push(`// SEAM compiled — ${new Date().toISOString()}`);
    lines.push(`// ${field.constraints.length} constraints, ${field.gaps.length} gaps`);
    lines.push('');
    lines.push(`const __field = ${JSON.stringify({ constraints: field.constraints, gaps: field.gaps }, null, 2)};`);
    lines.push('');

    for (const st of field.states) {
      let val = st.value;
      if (!isNaN(val)) val = val;
      else if (val === 'yes' || val === 'true') val = 'true';
      else if (val === 'no' || val === 'false') val = 'false';
      else if (val === 'nothing') val = 'undefined';
      else val = JSON.stringify(val);
      lines.push(`let ${st.name} = ${val};`);
    }

    for (const g of field.gaps) {
      lines.push(`// GAP: ${g.id} | pressure: ${g.pressure}`);
      lines.push(`__emit?.('forge.gap.opened', ${JSON.stringify({ id: g.id, pressure: g.pressure })});`);
    }

    return lines.join('\n');
  }

  // ── Full compile ──────────────────────────────────────────────────
  compile(source) {
    const webPath    = this.pass0(source);
    const field      = this.pass1(source);
    const js         = this.pass2(source, field);
    return { webPath, field, js, hasViolations: webPath.violations.length > 0 };
  }

  // ── Shape naming ──────────────────────────────────────────────────
  _nameShape(path) {
    if (path.length === 0) return 'empty';
    if (path[0]==='make' && path.includes('write')) return 'declare-and-persist';
    if (path[0]==='make' && path.includes('emit'))  return 'declare-and-emit';
    if (path[0]==='find' && path.includes('if'))    return 'query-and-branch';
    if (path.includes('snr') && path.includes('route')) return 'quality-check';
    if (path.includes('gap') && path.includes('fill'))  return 'gap-and-resolve';
    if (path.includes('make') && path.includes('emit') && path.includes('gap')
        && path.includes('find') && path.includes('tension')) return 'full-sweep';
    if (path.includes('write') && path.includes('define') && path.includes('blueprint') && path.includes('snr')) return 'meaning-arc';
    return `path-${path.length}`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// VARIABLE RESOLVER — {{template.vars}} → values
// ══════════════════════════════════════════════════════════════════════

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

class VariableResolver {
  constructor({ jaa, bus, guardian, idearium } = {}) {
    this._jaa      = jaa;
    this._bus      = bus;
    this._guardian = guardian;
    this._idearium = idearium;
  }

  async resolveObject(obj, ctx) {
    if (typeof obj === 'string') return this.resolveString(obj, ctx);
    if (Array.isArray(obj))     return Promise.all(obj.map(v => this.resolveObject(v, ctx)));
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = await this.resolveObject(v, ctx);
      return out;
    }
    return obj;
  }

  async resolveString(str, ctx) {
    if (typeof str !== 'string' || !str.includes('{{')) return str;
    const matches = [...str.matchAll(TEMPLATE_RE)];
    if (!matches.length) return str;
    const resolved = await Promise.all(matches.map(([, path]) => this._resolvePath(path.trim(), ctx)));
    let result = str;
    matches.forEach(([full], i) => {
      result = result.replace(full, resolved[i] == null ? '' : String(resolved[i]));
    });
    return result;
  }

  async _resolvePath(path, ctx) {
    const parts = path.split('.');
    const root  = parts[0];

    // System vars
    if (root === 'system') {
      if (parts[1]==='wall')  return Date.now();
      if (parts[1]==='tick')  return this._bus?.sample?.()?.tick ?? 0;
      if (parts[1]==='iso')   return new Date().toISOString();
      return undefined;
    }

    // Step results: step-<id>.result or step_id.result
    if (root.startsWith('step')) {
      const stepId = root.replace(/^step[-_]/, '');
      const sr     = ctx?.stepResults?.[stepId] ?? ctx?.stepResults?.[root];
      if (sr && parts[1]) return this._deepGet(sr, parts.slice(1));
      return sr;
    }

    // Trigger payload
    if (root === 'trigger') {
      return this._deepGet(ctx?.trigger ?? {}, parts.slice(1));
    }

    // JAA query: jaa.<table>.<field>
    if (root === 'jaa' && this._jaa) {
      const table = parts[1];
      if (parts[2]==='count') return this._jaa.count(table);
      if (parts[2]==='tail')  return this._jaa.tail(table, parseInt(parts[3]||'5'));
      return this._jaa.tail(table, 1)[0];
    }

    // Variable from context
    return this._deepGet(ctx, parts);
  }

  _deepGet(obj, parts) {
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  buildEvalContext(ctx) {
    return {
      trigger:       ctx?.trigger ?? {},
      trigger_payload: ctx?.trigger?.payload ?? {},
      ...Object.fromEntries(
        Object.entries(ctx?.stepResults ?? {}).map(([id, val]) => [`step_${id}`, val])
      ),
      system: { wall: Date.now(), tick: this._bus?.sample?.()?.tick ?? 0 },
    };
  }
}

// ══════════════════════════════════════════════════════════════════════
// PIPELINE ENGINE
// ══════════════════════════════════════════════════════════════════════

const NODE_TYPES = [
  'trigger','condition','transform','api_call','agent_call',
  'store','emit','loop','delay','seam_compile','gap',
  'notify','merge','fork','webhook_out',
];

class PipelineNode {
  constructor(def) {
    this.id      = def.id      ?? _uid();
    this.type    = def.type    ?? 'transform';
    this.label   = def.label   ?? def.type;
    this.enabled = def.enabled !== false;
    this.config  = def.config  ?? {};
    this.next    = def.next    ?? [];       // array of node ids (or { id, condition })
    this.x       = def.x      ?? 0;
    this.y       = def.y      ?? 0;
    this.width   = def.width  ?? 200;
    this.height  = def.height ?? 80;
  }
}

class Pipeline {
  constructor(def = {}) {
    this.id          = def.id         ?? _uid();
    this.name        = def.name       ?? 'Untitled Pipeline';
    this.description = def.description?? '';
    this.nodes       = new Map();     // id → PipelineNode
    this.variables   = def.variables  ?? {};  // global pipeline vars
    this.tags        = def.tags       ?? [];
    this.enabled     = def.enabled    !== false;
    this.createdAt   = def.createdAt  ?? Date.now();
    this.updatedAt   = Date.now();

    for (const nd of (def.nodes ?? [])) {
      const node = new PipelineNode(nd);
      this.nodes.set(node.id, node);
    }
  }

  addNode(def) {
    const node = new PipelineNode(def);
    this.nodes.set(node.id, node);
    this.updatedAt = Date.now();
    return node;
  }

  removeNode(id) {
    this.nodes.delete(id);
    // Remove references from other nodes
    for (const node of this.nodes.values()) {
      node.next = node.next.filter(n => (typeof n==='string' ? n : n.id) !== id);
    }
    this.updatedAt = Date.now();
  }

  connect(fromId, toId, condition = null) {
    const from = this.nodes.get(fromId);
    if (!from) throw new Error(`Node not found: ${fromId}`);
    const link = condition ? { id: toId, condition } : toId;
    if (!from.next.includes(link) && !from.next.some(n => (n.id ?? n) === toId)) {
      from.next.push(link);
    }
    this.updatedAt = Date.now();
  }

  disconnect(fromId, toId) {
    const from = this.nodes.get(fromId);
    if (!from) return;
    from.next = from.next.filter(n => (typeof n==='string' ? n : n.id) !== toId);
    this.updatedAt = Date.now();
  }

  // Find trigger node(s)
  triggers() {
    return [...this.nodes.values()].filter(n => n.type === 'trigger');
  }

  toJSON() {
    return {
      id: this.id, name: this.name, description: this.description,
      variables: this.variables, tags: this.tags,
      enabled: this.enabled, createdAt: this.createdAt, updatedAt: this.updatedAt,
      nodes: [...this.nodes.values()].map(n => ({ ...n })),
    };
  }
}

// ── Pipeline Executor ──────────────────────────────────────────────
class PipelineExecutor {
  constructor({ jaa, bus, guardian, idearium, compiler } = {}) {
    this._jaa      = jaa;
    this._bus      = bus;
    this._guardian = guardian;
    this._idearium = idearium;
    this._compiler = compiler ?? new SeamCompiler();
    this._vr       = new VariableResolver({ jaa, bus, guardian, idearium });
    this._running  = new Map(); // runId → { pipeline, ctx, status }
  }

  async run(pipeline, triggerPayload = {}, opts = {}) {
    const runId = _uid();
    const ctx = {
      runId,
      pipelineId: pipeline.id,
      trigger:    { payload: triggerPayload, ts: Date.now() },
      stepResults:{},
      variables:  { ...pipeline.variables, ...opts.variables },
      gaps:       [],
      log:        [],
    };

    // Write before behavior (LAW II)
    await this._jaa?.insert('pipeline_runs', {
      uuid: runId, pipelineId: pipeline.id,
      name: pipeline.name, status: 'running',
      triggerPayload, startedAt: Date.now(),
    });

    this._running.set(runId, { pipeline, ctx, status: 'running' });
    this._bus?.emit('pipeline.run.started', { runId, pipelineId: pipeline.id });

    let status = 'pass';
    try {
      // Start from trigger nodes
      const starts = pipeline.triggers();
      if (starts.length === 0 && pipeline.nodes.size > 0) {
        // No trigger — start from first node
        const first = [...pipeline.nodes.values()][0];
        await this._execNode(first, pipeline, ctx);
      }
      for (const trigger of starts) {
        await this._execFrom(trigger.id, pipeline, ctx);
      }
    } catch (err) {
      status = 'error';
      ctx.log.push({ type:'error', message: err.message, ts: Date.now() });
      this._bus?.emit('pipeline.run.error', { runId, error: err.message });
    }

    const latencyMs = Date.now() - ctx.trigger.ts;
    await this._jaa?.upsert('pipeline_runs', runId, {
      status, latencyMs, gaps: ctx.gaps,
      log: ctx.log.slice(-50), completedAt: Date.now(),
    });

    this._running.delete(runId);
    this._bus?.emit('pipeline.run.complete', { runId, status, latencyMs });
    return { runId, status, latencyMs, gaps: ctx.gaps, log: ctx.log };
  }

  async _execFrom(nodeId, pipeline, ctx, visited = new Set()) {
    if (visited.has(nodeId)) return; // cycle protection
    visited.add(nodeId);
    const node = pipeline.nodes.get(nodeId);
    if (!node || !node.enabled) return;
    const result = await this._execNode(node, pipeline, ctx);
    ctx.stepResults[node.id] = result;

    // Follow edges
    for (const edge of node.next) {
      const nextId  = typeof edge === 'string' ? edge : edge.id;
      const cond    = typeof edge === 'string' ? null  : edge.condition;
      if (cond) {
        const evalCtx = this._vr.buildEvalContext(ctx);
        if (!seamEvalSafe(cond, evalCtx)) continue;
      }
      await this._execFrom(nextId, pipeline, ctx, new Set(visited));
    }
  }

  async _execNode(node, pipeline, ctx) {
    const t0 = Date.now();
    ctx.log.push({ type:'step', nodeId: node.id, label: node.label, ts: t0 });
    this._bus?.emit('pipeline.step.started', { nodeId: node.id, type: node.type, runId: ctx.runId });

    let result;
    try {
      result = await this._dispatch(node, ctx);
    } catch (err) {
      ctx.log.push({ type:'step-error', nodeId: node.id, error: err.message, ts: Date.now() });
      if (!node.config.continueOnFail) throw err;
      return { status: 'fail', error: err.message };
    }

    const latencyMs = Date.now() - t0;
    this._bus?.emit('pipeline.step.done', { nodeId: node.id, latencyMs, runId: ctx.runId });
    return { status: 'pass', result, latencyMs };
  }

  async _dispatch(node, ctx) {
    const cfg = await this._vr.resolveObject(node.config, ctx);

    switch (node.type) {

      case 'trigger':
        return { triggered: true, payload: ctx.trigger.payload };

      case 'condition': {
        // SEAM if·when node — dual-branch constraint
        const evalCtx = this._vr.buildEvalContext(ctx);
        const passed  = seamEvalSafe(cfg.condition ?? 'true', evalCtx);
        return { condition: cfg.condition, passed, branch: passed ? 'then' : 'otherwise' };
      }

      case 'transform': {
        // Pure function transform over context data
        const input = cfg.input ? this._deepGet(ctx, cfg.input.split('.')) : ctx.stepResults;
        if (cfg.map) {
          // Simple field mapping: { output_field: '{{input.field}}' }
          const out = {};
          for (const [k, v] of Object.entries(cfg.map)) {
            out[k] = await this._vr.resolveString(v, ctx);
          }
          return out;
        }
        return { transformed: input };
      }

      case 'api_call': {
        // SEAM call·stream node
        const { url, method = 'GET', headers = {}, body, timeout = 30000 } = cfg;
        if (!url) throw new Error('api_call: url required');
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          signal: ctrl.signal,
          body: body ? JSON.stringify(body) : undefined,
        }).finally(() => clearTimeout(timer));

        const data = res.headers.get('content-type')?.includes('json')
          ? await res.json()
          : await res.text();
        return { status: res.status, ok: res.ok, data };
      }

      case 'agent_call': {
        // SEAM route·snr node — Guardian dispatch
        const { provider = 'claude', prompt, timeout = 90000 } = cfg;
        if (!prompt) throw new Error('agent_call: prompt required');
        if (!this._guardian) throw new Error('agent_call: Guardian not connected');
        const text = await this._guardian.dispatch(provider, prompt, { timeout });
        return { content: text, provider };
      }

      case 'store': {
        // SEAM write·read node — JAA insert
        const { table, record } = cfg;
        if (!table) throw new Error('store: table required');
        if (!this._jaa) throw new Error('store: JAA not available');
        const row = await this._jaa.insert(table, { ...record, _pipelineStep: node.id });
        return { table, uuid: row.uuid };
      }

      case 'emit': {
        // SEAM emit·watch node
        const { channel, payload: ePayload = {} } = cfg;
        if (!channel) throw new Error('emit: channel required');
        const ev = this._bus?.emit(channel, ePayload, { causedBy: ctx.runId });
        return { emitted: channel, eventId: ev?.id };
      }

      case 'loop': {
        // SEAM for-each node
        const { over, as = 'item', steps: subSteps } = cfg;
        const arr = this._deepGet(ctx, (over ?? '').split('.'));
        if (!Array.isArray(arr)) throw new Error(`loop: '${over}' is not an array`);
        const results = [];
        for (const item of arr) {
          const loopCtx = { ...ctx, stepResults: { ...ctx.stepResults, [as]: item } };
          results.push({ item, done: true });
        }
        return { looped: arr.length, results };
      }

      case 'delay': {
        const ms = cfg.ms ?? 1000;
        await _sleep(ms);
        return { delayed: ms };
      }

      case 'seam_compile': {
        const { source } = cfg;
        if (!source) throw new Error('seam_compile: source required');
        const result = this._compiler.compile(source);
        // Write to JAA
        if (this._jaa) {
          await this._jaa.insert('seam_programs', {
            source, ...result, compiledAt: Date.now(),
          });
        }
        return result;
      }

      case 'gap': {
        // SEAM gap·fill node — declare a gap
        const { id, pressure = 0.5, description = '' } = cfg;
        const gapRecord = { id: id ?? _uid(), pressure, description, status: 'open', ts: Date.now() };
        ctx.gaps.push(gapRecord);
        if (this._jaa) await this._jaa.insert('gaps', gapRecord);
        this._bus?.emit('forge.gap.opened', gapRecord);
        return gapRecord;
      }

      case 'notify': {
        const { message = '', level = 'info' } = cfg;
        this._bus?.emit('forge.notify', { message, level, nodeId: node.id });
        ctx.log.push({ type: 'notify', message, level, ts: Date.now() });
        return { notified: true, message };
      }

      case 'webhook_out': {
        const { url, method = 'POST', payload: whPayload = {} } = cfg;
        if (!url) throw new Error('webhook_out: url required');
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(whPayload),
        });
        return { status: res.status, ok: res.ok };
      }

      case 'merge':
        return { merged: true };

      case 'fork':
        return { forked: true };

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  _deepGet(obj, parts) {
    let cur = obj;
    for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
    return cur;
  }

  get runningCount() { return this._running.size; }
}

// ══════════════════════════════════════════════════════════════════════
// PIPELINE REGISTRY — live store of all pipelines + schedules
// ══════════════════════════════════════════════════════════════════════

class PipelineRegistry {
  constructor({ jaa, bus, executor } = {}) {
    this._jaa      = jaa;
    this._bus      = bus;
    this._executor = executor;
    this._pipelines= new Map(); // id → Pipeline
    this._schedules= new Map(); // pipelineId → timer/cleanup
  }

  async load() {
    if (!this._jaa) return;
    const rows = this._jaa.scan('pipelines');
    for (const row of rows) {
      const p = new Pipeline(row);
      this._pipelines.set(p.id, p);
    }
  }

  async save(pipeline) {
    await this._jaa?.upsert('pipelines', pipeline.id, pipeline.toJSON());
    this._pipelines.set(pipeline.id, pipeline);
    this._bus?.emit('pipeline.saved', { id: pipeline.id, name: pipeline.name });
    return pipeline;
  }

  async delete(id) {
    this.disarm(id);
    this._pipelines.delete(id);
    this._bus?.emit('pipeline.deleted', { id });
  }

  get(id)  { return this._pipelines.get(id) ?? null; }
  all()    { return [...this._pipelines.values()]; }
  count()  { return this._pipelines.size; }

  // ── Trigger arming ──────────────────────────────────────────────
  arm(pipelineId) {
    const pipeline = this.get(pipelineId);
    if (!pipeline || !pipeline.enabled) return;
    for (const trigger of pipeline.triggers()) {
      const cfg = trigger.config;
      switch (cfg.type) {
        case 'cron': {
          const nextFn = () => {
            const next = _nextCron(cfg.expression);
            if (!next) return;
            const h = setTimeout(async () => {
              await this._executor?.run(pipeline, {}, {});
              nextFn();
            }, Math.max(0, next - Date.now()));
            return h;
          };
          const handle = nextFn();
          this._schedules.set(pipelineId, { type:'cron', handle });
          break;
        }
        case 'interval': {
          const handle = setInterval(async () => {
            await this._executor?.run(pipeline, {}, {});
          }, cfg.every ?? 60000);
          this._schedules.set(pipelineId, { type:'interval', handle });
          break;
        }
        case 'event': {
          const unsub = this._bus?.on(cfg.channel, async (ev) => {
            if (cfg.filter && !seamEvalSafe(cfg.filter, { trigger: ev, payload: ev.payload ?? {} })) return;
            await this._executor?.run(pipeline, ev.payload ?? {}, {});
          });
          this._schedules.set(pipelineId, { type:'event', cleanup: unsub });
          break;
        }
        case 'webhook': {
          // Webhook ID used by HTTP server to route incoming requests
          this._bus?.emit('webhook.registered', { pipelineId, webhookId: cfg.webhookId });
          break;
        }
      }
    }
  }

  disarm(pipelineId) {
    const s = this._schedules.get(pipelineId);
    if (!s) return;
    if (s.handle) clearTimeout(s.handle), clearInterval(s.handle);
    if (s.cleanup) s.cleanup();
    this._schedules.delete(pipelineId);
  }

  trigger(pipelineId, payload = {}) {
    const pipeline = this.get(pipelineId);
    if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);
    return this._executor?.run(pipeline, payload, {});
  }
}

// ── Cron helpers (minimal, no dep) ──────────────────────────────────
function _parseCronField(f, min, max) {
  if (f==='*') return null;
  const s = new Set();
  for (const part of f.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const st = parseInt(step);
      const [lo, hi] = range==='*' ? [min,max] : range.split('-').map(Number);
      for (let i=lo; i<=hi; i+=st) s.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let i=lo; i<=hi; i++) s.add(i);
    } else s.add(parseInt(part));
  }
  return s;
}

function _nextCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const cron = {
    min:   _parseCronField(parts[0], 0, 59),
    hour:  _parseCronField(parts[1], 0, 23),
    dom:   _parseCronField(parts[2], 1, 31),
    month: _parseCronField(parts[3], 1, 12),
    dow:   _parseCronField(parts[4], 0, 6),
  };
  const m = (set, v) => set===null || set.has(v);
  const d = new Date(); d.setSeconds(0,0); d.setMinutes(d.getMinutes()+1);
  const limit = new Date(d.getTime() + 366*24*60*60*1000);
  while (d < limit) {
    if (m(cron.min,d.getMinutes())&&m(cron.hour,d.getHours())&&m(cron.dom,d.getDate())&&m(cron.month,d.getMonth()+1)&&m(cron.dow,d.getDay())) return d.getTime();
    d.setMinutes(d.getMinutes()+1);
  }
  return null;
}

const _uid  = () => typeof crypto!=='undefined'&&crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});
const _sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Exports ──────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SeamCompiler, SeamEvaluator, seamEval, seamEvalSafe, validateExpr,
    Pipeline, PipelineNode, PipelineExecutor, PipelineRegistry,
    VariableResolver, NODE_TYPES, SEAM_WEB,
  };
} else if (typeof window !== 'undefined') {
  Object.assign(window, {
    SeamCompiler, seamEval, seamEvalSafe, validateExpr,
    Pipeline, PipelineNode, PipelineExecutor, PipelineRegistry,
    VariableResolver, NODE_TYPES, SEAM_WEB,
  });
}
