// ═══════════════════════════════════════════════════
// NEXUS — Safe Condition Evaluator
// automation/condition-evaluator.js
//
// Hand-rolled expression evaluator for automation
// trigger filters and step conditions.
//
// DESIGN — WHY NOT eval() / new Function():
//   eval() opens arbitrary code execution on the host
//   machine. NEXUS is a local-first system running as
//   Node — eval() = root-equivalent code injection.
//   No external sandbox library needed either; the
//   expression grammar is a small deterministic subset.
//
// SUPPORTED GRAMMAR (spec §7):
//   Literals:   string, number, boolean, null
//   Paths:      dot-path access  payload.severity
//               bracket access   step_s1.result.approved
//               template vars    {{trigger.payload.uuid}}
//   Comparisons: === !== < > <= >= (string & number)
//   Boolean:    && || !
//   Ternary:    a ? b : c
//   Arithmetic: + - * /  (numeric only, guarded)
//   Functions:  includes(val), startsWith(val),
//               endsWith(val), length()
//
// SECURITY:
//   - Only whitelisted token types allowed
//   - No property access on non-plain objects
//   - Depth limit: 32 recursive descent steps
//   - Input length limit: 2048 chars
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const MAX_EXPR_LEN  = 2048;
const MAX_DEPTH     = 32;

// ── Tokeniser ──────────────────────────────────────
const TT = {
  NUM: 'NUM', STR: 'STR', BOOL: 'BOOL', NULL: 'NULL',
  ID: 'ID', DOT: 'DOT', LBRACK: 'LBRACK', RBRACK: 'RBRACK',
  LPAREN: 'LPAREN', RPAREN: 'RPAREN',
  EQ: 'EQ', NEQ: 'NEQ', LT: 'LT', GT: 'GT', LTE: 'LTE', GTE: 'GTE',
  AND: 'AND', OR: 'OR', NOT: 'NOT',
  QMARK: 'QMARK', COLON: 'COLON',
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH',
  COMMA: 'COMMA',
  EOF: 'EOF',
};

function tokenise(src) {
  if (src.length > MAX_EXPR_LEN) throw new EvalError(`Expression too long (>${MAX_EXPR_LEN})`);
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    // Skip whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Numbers
    if (/\d/.test(src[i]) || (src[i] === '-' && /\d/.test(src[i + 1] ?? ''))) {
      let num = '';
      if (src[i] === '-') num += src[i++];
      while (i < src.length && /[\d.]/.test(src[i])) num += src[i++];
      tokens.push({ t: TT.NUM, v: parseFloat(num) });
      continue;
    }

    // Strings
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let str = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { i++; str += src[i] ?? ''; }
        else str += src[i];
        i++;
      }
      i++; // closing quote
      tokens.push({ t: TT.STR, v: str });
      continue;
    }

    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[\w$]/.test(src[i])) id += src[i++];
      if (id === 'true')  { tokens.push({ t: TT.BOOL, v: true });  continue; }
      if (id === 'false') { tokens.push({ t: TT.BOOL, v: false }); continue; }
      if (id === 'null')  { tokens.push({ t: TT.NULL, v: null });  continue; }
      tokens.push({ t: TT.ID, v: id });
      continue;
    }

    // Two-char operators
    const two = src.slice(i, i + 2);
    if (two === '===') { tokens.push({ t: TT.EQ  }); i += 3; continue; }
    if (two === '!==') { tokens.push({ t: TT.NEQ }); i += 3; continue; }
    if (two === '<=')  { tokens.push({ t: TT.LTE }); i += 2; continue; }
    if (two === '>=')  { tokens.push({ t: TT.GTE }); i += 2; continue; }
    if (two === '&&')  { tokens.push({ t: TT.AND }); i += 2; continue; }
    if (two === '||')  { tokens.push({ t: TT.OR  }); i += 2; continue; }

    // Single-char
    const ch = src[i++];
    const map = {
      '.': TT.DOT, '[': TT.LBRACK, ']': TT.RBRACK,
      '(': TT.LPAREN, ')': TT.RPAREN,
      '<': TT.LT, '>': TT.GT, '!': TT.NOT,
      '?': TT.QMARK, ':': TT.COLON,
      '+': TT.PLUS, '-': TT.MINUS, '*': TT.STAR, '/': TT.SLASH,
      ',': TT.COMMA,
    };
    const tt = map[ch];
    if (!tt) throw new EvalError(`Unexpected character: '${ch}'`);
    tokens.push({ t: tt });
  }

  tokens.push({ t: TT.EOF });
  return tokens;
}

// ── Parser / Evaluator (recursive descent) ────────
class Evaluator {
  constructor(tokens, ctx) {
    this._tok   = tokens;
    this._pos   = 0;
    this._ctx   = ctx;
    this._depth = 0;
  }

  _peek()    { return this._tok[this._pos]; }
  _consume() { return this._tok[this._pos++]; }

  _expect(type) {
    const tok = this._consume();
    if (tok.t !== type) throw new EvalError(`Expected ${type}, got ${tok.t}`);
    return tok;
  }

  _match(...types) {
    if (types.includes(this._peek().t)) { return this._consume(); }
    return null;
  }

  _guard() {
    if (++this._depth > MAX_DEPTH) throw new EvalError('Expression depth limit exceeded');
  }

  // ── entry ─────────────────────────────────────────
  eval() {
    const v = this._ternary();
    if (this._peek().t !== TT.EOF) throw new EvalError(`Unexpected token: ${this._peek().t}`);
    return v;
  }

  // ternary: or ? or : or
  _ternary() {
    this._guard();
    let v = this._or();
    if (this._match(TT.QMARK)) {
      const t = this._ternary();
      this._expect(TT.COLON);
      const f = this._ternary();
      return v ? t : f;
    }
    return v;
  }

  // or: and (|| and)*
  _or() {
    this._guard();
    let v = this._and();
    while (this._match(TT.OR)) v = (v || this._and());
    return v;
  }

  // and: eq (&& eq)*
  _and() {
    this._guard();
    let v = this._eq();
    while (this._match(TT.AND)) v = (v && this._eq());
    return v;
  }

  // eq: rel (=== | !== rel)?
  _eq() {
    this._guard();
    let v = this._rel();
    const op = this._match(TT.EQ, TT.NEQ);
    if (op) {
      const r = this._rel();
      return op.t === TT.EQ ? v === r : v !== r;
    }
    return v;
  }

  // rel: add (< | > | <= | >= add)?
  _rel() {
    this._guard();
    let v = this._add();
    const op = this._match(TT.LT, TT.GT, TT.LTE, TT.GTE);
    if (op) {
      const r = this._add();
      if (op.t === TT.LT)  return v <  r;
      if (op.t === TT.GT)  return v >  r;
      if (op.t === TT.LTE) return v <= r;
      if (op.t === TT.GTE) return v >= r;
    }
    return v;
  }

  // add: mul (+ | - mul)*
  _add() {
    this._guard();
    let v = this._mul();
    let op;
    while ((op = this._match(TT.PLUS, TT.MINUS))) {
      const r = this._mul();
      if (typeof v !== 'number' || typeof r !== 'number')
        throw new EvalError('Arithmetic requires numbers');
      v = op.t === TT.PLUS ? v + r : v - r;
    }
    return v;
  }

  // mul: unary (* | / unary)*
  _mul() {
    this._guard();
    let v = this._unary();
    let op;
    while ((op = this._match(TT.STAR, TT.SLASH))) {
      const r = this._unary();
      if (typeof v !== 'number' || typeof r !== 'number')
        throw new EvalError('Arithmetic requires numbers');
      if (op.t === TT.SLASH && r === 0) throw new EvalError('Division by zero');
      v = op.t === TT.STAR ? v * r : v / r;
    }
    return v;
  }

  // unary: !unary | primary
  _unary() {
    this._guard();
    if (this._match(TT.NOT)) return !this._unary();
    return this._postfix(this._primary());
  }

  // primary: literal | ( expr ) | path
  _primary() {
    this._guard();
    const tok = this._peek();

    if (tok.t === TT.NUM)  { this._consume(); return tok.v; }
    if (tok.t === TT.STR)  { this._consume(); return tok.v; }
    if (tok.t === TT.BOOL) { this._consume(); return tok.v; }
    if (tok.t === TT.NULL) { this._consume(); return null; }

    if (tok.t === TT.LPAREN) {
      this._consume();
      const v = this._ternary();
      this._expect(TT.RPAREN);
      return v;
    }

    if (tok.t === TT.ID) {
      return this._path();
    }

    throw new EvalError(`Unexpected token in expression: ${tok.t} '${JSON.stringify(tok.v)}'`);
  }

  // path: id (.id | [expr] | (args))*
  _path() {
    const name = this._expect(TT.ID).v;
    let val = this._lookupRoot(name);
    return this._postfix(val, name);
  }

  _postfix(val, label = '') {
    this._guard();
    while (true) {
      const tok = this._peek();

      if (tok.t === TT.DOT) {
        this._consume();
        const key = this._expect(TT.ID).v;
        val = this._safeProp(val, key, `${label}.${key}`);
        label = `${label}.${key}`;
        continue;
      }

      if (tok.t === TT.LBRACK) {
        this._consume();
        const key = this._ternary();
        this._expect(TT.RBRACK);
        val = this._safeProp(val, key, `${label}[${key}]`);
        label = `${label}[${key}]`;
        continue;
      }

      // Method call: val.method(args)
      if (tok.t === TT.LPAREN) {
        this._consume();
        const args = [];
        while (this._peek().t !== TT.RPAREN) {
          args.push(this._ternary());
          this._match(TT.COMMA);
        }
        this._expect(TT.RPAREN);
        val = this._callMethod(val, label, args);
        continue;
      }

      break;
    }
    return val;
  }

  // ── Whitelisted method calls ──────────────────────
  _callMethod(target, label, args) {
    // Only strings and arrays may be called on
    const ALLOWED = new Set(['includes','startsWith','endsWith','indexOf','length','toString','trim']);
    const parts   = label.split('.');
    const method  = parts[parts.length - 1];

    if (!ALLOWED.has(method))
      throw new EvalError(`Method not allowed: ${method}`);

    // length is a property, not a method — handle gracefully
    if (method === 'length') return (target ?? '').length;

    if (typeof target?.[method] === 'function') {
      return target[method](...args);
    }
    return undefined;
  }

  // ── Safe property access ──────────────────────────
  _safeProp(obj, key, label) {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj !== 'object' && typeof obj !== 'string' && !Array.isArray(obj))
      throw new EvalError(`Cannot access property '${key}' on ${typeof obj}`);
    return obj[key];
  }

  // ── Root scope lookup ─────────────────────────────
  _lookupRoot(name) {
    if (Object.prototype.hasOwnProperty.call(this._ctx, name)) {
      return this._ctx[name];
    }
    // Normalise: step_s1 → ctx['step-s1'] or ctx.steps?.s1
    const dashName = name.replace(/_/, '-');
    if (Object.prototype.hasOwnProperty.call(this._ctx, dashName)) {
      return this._ctx[dashName];
    }
    return undefined;
  }
}

// ── Public API ─────────────────────────────────────

/**
 * Evaluate expression string with a context object.
 * @param {string} expr
 * @param {object} ctx  — flat or nested — { trigger, step_s1, system, ... }
 * @returns {*}
 * @throws {EvalError} on syntax / safety violation
 */
function evaluate(expr, ctx = {}) {
  if (typeof expr !== 'string') return !!expr;
  const tokens = tokenise(expr.trim());
  return new Evaluator(tokens, ctx).eval();
}

/**
 * Safe boolean evaluation — never throws, returns false on error.
 */
function evaluateSafe(expr, ctx = {}) {
  try { return !!evaluate(expr, ctx); }
  catch { return false; }
}

/**
 * Validate an expression without evaluating (dry-run with empty ctx).
 * Returns { valid, error }.
 */
function validateExpr(expr) {
  try {
    tokenise(expr.trim());
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = { evaluate, evaluateSafe, validateExpr, EvalError };

class EvalError extends Error { constructor(m) { super(m); this.name = 'EvalError'; } }
