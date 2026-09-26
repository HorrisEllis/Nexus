'use strict';
/**
 * clear-glass/src/autofill/store.js — Autofill Profile Store
 * UUID: cg-autofill-store-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "autofill." Deliberately NOT named
 * 'profile' alone — clear-glass/src/fingerprint/*.js already owns that
 * word for browser-fingerprint spoofing profiles (checked directly:
 * bookmarks/browser.js's real "Firefox profile import" flow calls
 * context.fp.switch({mode:'firefox', profilePath}) — a completely
 * different real feature, spoofing Firefox's font/canvas signature,
 * not importing bookmarks/history/passwords). Naming this
 * AutofillProfile throughout, never bare "profile," to avoid repeating
 * the exact pat/bep_pattern, injection/inject_rule collision class
 * from earlier this session.
 *
 * Real, persistent, per-identity autofill data for form-filling
 * (job applications, contact forms, checkout — general forms, not
 * login credentials, which stay in passwords/vault.js untouched).
 * Distinct real entity from options/store.js's Account (a NEXUS
 * identity linking agent types + real provider logins) — an
 * AutofillProfile is what goes INTO a form, an Account is who's
 * operating the browser. A person may reasonably want several
 * AutofillProfiles under one Account (e.g. two different resumes/
 * cover-letter framings for different job types), so this is its own
 * store, not a field bolted onto Account.
 */

const path = require('path');
const fs   = require('fs');
const { JaaRows } = require('../storage/jaa');
const { randomUUID } = require('crypto');

const AUTOFILL_PATH = path.join(
  process.env.APPDATA || process.env.HOME || '.', '.clear-glass', 'autofill-profiles.json'
);

// §REAL STANDARD, NOT INVENTED — the WHATWG HTML Living Standard's own
// autocomplete attribute tokens (https://html.spec.whatwg.org/#autofill),
// restricted to the subset relevant to a real person filling a form
// (job application, contact form, checkout) — excludes payment-card
// and mobile-network tokens as out of scope for this pass, named
// honestly below rather than silently omitted.
const FIELD_TYPES = Object.freeze({
  // Identity
  NAME:              'name',
  HONORIFIC_PREFIX:  'honorific-prefix',
  GIVEN_NAME:        'given-name',
  ADDITIONAL_NAME:   'additional-name',
  FAMILY_NAME:       'family-name',
  HONORIFIC_SUFFIX:  'honorific-suffix',
  NICKNAME:          'nickname',
  // Contact
  EMAIL:             'email',
  TEL:               'tel',
  TEL_COUNTRY_CODE:  'tel-country-code',
  TEL_NATIONAL:      'tel-national',
  URL:               'url', // portfolio/LinkedIn/personal site — real, standard token, real use here
  // Address
  STREET_ADDRESS:    'street-address',
  ADDRESS_LINE1:     'address-line1',
  ADDRESS_LINE2:     'address-line2',
  ADDRESS_LEVEL2:    'address-level2', // city
  ADDRESS_LEVEL1:    'address-level1', // state/province
  POSTAL_CODE:       'postal-code',
  COUNTRY:           'country',
  COUNTRY_NAME:      'country-name',
  // Professional — real WHATWG tokens, the two most load-bearing ones
  // for a job application specifically
  ORGANIZATION:       'organization',       // current/most recent employer
  ORGANIZATION_TITLE: 'organization-title', // current/most recent job title
});

// §NOT A WHATWG TOKEN — job-application-specific document fields.
// There is no real autocomplete standard for "attach your resume,"
// so these are named as this store's own real fields, documented as
// such rather than dressed up as a standard they aren't.
const DOCUMENT_FIELDS = Object.freeze({
  RESUME:            'resume',            // { path, filename } — a real file on disk; SEE HONEST LIMIT below
  COVER_LETTER:      'coverLetter',        // free text — a real template, filled per-application by the caller, not auto-generated here
  LINKEDIN_URL:      'linkedinUrl',
  PORTFOLIO_URL:     'portfolioUrl',
});

class AutofillStore {
  constructor() { this.data = { profiles: {} }; }

  // §JAA 2026-09-26 — James: "with clearglass, make it jaa. no json." Rows live in
  // the Clear Glass JAA store (src/storage/jaa.js); the old autofill-profiles.json is imported
  // once on first load and left on disk.
  _rows() {
    return this._jaa || (this._jaa = new JaaRows('cg_autofill_profiles', {
      legacyFile: AUTOFILL_PATH, fromLegacy: (raw) => Object.values((raw && raw.profiles) || {}),
    }));
  }

  load() {
    const profiles = {};
    for (const p of this._rows().load()) profiles[p.id] = p;
    this.data = { profiles };
    return { ...this.data };
  }

  _persist() {
    this._rows().replaceAll(Object.values(this.data.profiles || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  }

  listProfiles() {
    return Object.values(this.data.profiles || {}).sort((a, b) => a.createdAt - b.createdAt);
  }

  getProfile(id) {
    return this.data.profiles?.[id] || null;
  }

  /**
   * createProfile({label, fields, documents}) — fields is a real map of
   * FIELD_TYPES keys to string values (e.g. {'given-name': 'Ada'}) —
   * unknown keys are refused loudly (§1.2), not silently accepted and
   * later never matched against anything real.
   */
  createProfile({ label, fields = {}, documents = {} } = {}) {
    const fieldCheck = _validateFields(fields);
    if (fieldCheck.error) return fieldCheck;
    const docCheck = _validateDocuments(documents);
    if (docCheck.error) return docCheck;

    const id  = randomUUID();
    const now = Date.now();
    const profile = {
      id,
      label: label || `Profile ${Object.keys(this.data.profiles || {}).length + 1}`,
      fields: { ...fields },
      documents: { ...documents },
      createdAt: now,
      updatedAt: now,
    };
    this.data = { ...this.data, profiles: { ...this.data.profiles, [id]: profile } };
    this._persist();
    return { ...profile };
  }

  /** updateProfile(id, {label?, fields?, documents?}) — fields/documents are each a real, wholesale replace of that map, matching options/store.js's own established array-replace convention for the same reason: an additive PATCH here would hide which keys the caller actually meant to remove. */
  updateProfile(id, updates = {}) {
    const existing = this.data.profiles?.[id];
    if (!existing) return { error: `no autofill profile "${id}"` };
    if (updates.fields !== undefined) {
      const check = _validateFields(updates.fields);
      if (check.error) return check;
    }
    if (updates.documents !== undefined) {
      const check = _validateDocuments(updates.documents);
      if (check.error) return check;
    }
    const updated = {
      ...existing,
      ...(updates.label !== undefined ? { label: updates.label } : {}),
      ...(updates.fields !== undefined ? { fields: { ...updates.fields } } : {}),
      ...(updates.documents !== undefined ? { documents: { ...updates.documents } } : {}),
      updatedAt: Date.now(),
    };
    this.data = { ...this.data, profiles: { ...this.data.profiles, [id]: updated } };
    this._persist();
    return { ...updated };
  }

  deleteProfile(id) {
    if (!this.data.profiles?.[id]) return { error: `no autofill profile "${id}"` };
    const { [id]: _removed, ...rest } = this.data.profiles;
    this.data = { ...this.data, profiles: rest };
    this._persist();
    return { ok: true, id };
  }
}

function _validateFields(fields) {
  const known = new Set(Object.values(FIELD_TYPES));
  const bad = Object.keys(fields).filter(k => !known.has(k));
  if (bad.length) return { error: `unknown autofill field type(s): ${bad.join(', ')} — one of: ${[...known].join(', ')}` };
  return { ok: true };
}

function _validateDocuments(documents) {
  const known = new Set(Object.values(DOCUMENT_FIELDS));
  const bad = Object.keys(documents).filter(k => !known.has(k));
  if (bad.length) return { error: `unknown document field(s): ${bad.join(', ')} — one of: ${[...known].join(', ')}` };
  if (documents.resume && (!documents.resume.path || typeof documents.resume.path !== 'string')) {
    return { error: 'documents.resume needs a real {path, filename} — path is required' };
  }
  return { ok: true };
}

module.exports = { AutofillStore, FIELD_TYPES, DOCUMENT_FIELDS };
