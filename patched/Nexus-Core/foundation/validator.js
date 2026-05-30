// ═══════════════════════════════════════════════════
// NEXUS — NanoValidator
// foundation/validator.js
//
// Replaces AJV. Zero external dependencies.
//
// DESIGN PHILOSOPHY:
//   AJV is 150KB of spec compliance NEXUS doesn't need.
//   NanoValidator is ~120 lines. It validates exactly
//   the shapes NEXUS actually uses. Fails loudly (§1.2).
//
//   Supports: type, required, properties (nested),
//             enum, minimum, maximum, minLength,
//             maxLength, pattern, items (array),
//             additionalProperties: false.
//
//   Returns: { valid: bool, errors: string[] }
//   (same shape as AJV for drop-in compatibility)
//
//   LEVERAGE: Every schema check in NEXUS routes here.
//   No network. No install. Boots in microseconds.
// ═══════════════════════════════════════════════════

'use strict';

// ── Type checkers ──────────────────────────────────
const TYPE = {
  string:  v => typeof v === 'string',
  number:  v => typeof v === 'number' && isFinite(v),
  integer: v => Number.isInteger(v),
  boolean: v => typeof v === 'boolean',
  object:  v => v !== null && typeof v === 'object' && !Array.isArray(v),
  array:   v => Array.isArray(v),
  null:    v => v === null,
};

// ── Core validate (recursive) ──────────────────────
function validate(schema, data, path = '') {
  const errors = [];

  if (!schema || typeof schema !== 'object') return errors;

  // type check
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => TYPE[t]?.(data))) {
      errors.push(`${path || 'root'}: expected ${types.join('|')}, got ${data === null ? 'null' : typeof data}`);
      return errors; // further checks meaningless
    }
  }

  // null short-circuit
  if (data === null || data === undefined) return errors;

  // enum
  if (schema.enum) {
    if (!schema.enum.includes(data))
      errors.push(`${path || 'root'}: must be one of [${schema.enum.join(', ')}], got ${JSON.stringify(data)}`);
  }

  // string constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength)
      errors.push(`${path}: length ${data.length} < minLength ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength)
      errors.push(`${path}: length ${data.length} > maxLength ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(data))
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
  }

  // number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum)
      errors.push(`${path}: ${data} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum)
      errors.push(`${path}: ${data} > maximum ${schema.maximum}`);
    if (schema.multipleOf !== undefined && data % schema.multipleOf !== 0)
      errors.push(`${path}: ${data} is not a multiple of ${schema.multipleOf}`);
  }

  // object constraints
  if (TYPE.object(data)) {
    // required fields
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in data))
          errors.push(`${path ? path + '.' : ''}${key}: required field missing`);
      }
    }

    // properties (recursive)
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const subPath = path ? `${path}.${key}` : key;
          errors.push(...validate(subSchema, data[key], subPath));
        }
      }
    }

    // additionalProperties: false
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key))
          errors.push(`${path ? path + '.' : ''}${key}: additional property not allowed`);
      }
    }
  }

  // array constraints
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems)
      errors.push(`${path}: array length ${data.length} < minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems)
      errors.push(`${path}: array length ${data.length} > maxItems ${schema.maxItems}`);
    if (schema.items) {
      data.forEach((item, i) =>
        errors.push(...validate(schema.items, item, `${path}[${i}]`))
      );
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      data.forEach((item, i) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${path}[${i}]: duplicate item`);
        seen.add(key);
      });
    }
  }

  return errors;
}

// ── Compiled validator (AJV-compatible API) ────────
function compile(schema) {
  // Returns a function: (data) → boolean
  // Attaches .errors on failure (same shape as AJV)
  const fn = (data) => {
    const errors = validate(schema, data);
    fn.errors = errors.length ? errors.map(msg => ({ message: msg })) : null;
    return errors.length === 0;
  };
  fn.errors = null;
  return fn;
}

// ── errorsText helper (AJV-compatible) ────────────
function errorsText(errors) {
  if (!errors) return 'No errors';
  return errors.map(e => e.message || String(e)).join('; ');
}

// ── NanoValidator class (for direct instantiation) ─
class NanoValidator {
  compile(schema) { return compile(schema); }
  validate(schema, data) {
    const errors = validate(schema, data);
    return { valid: errors.length === 0, errors };
  }
  errorsText(errors) { return errorsText(errors); }
}

module.exports = { NanoValidator, compile, validate, errorsText };
