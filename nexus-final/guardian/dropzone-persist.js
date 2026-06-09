'use strict';
// dropzone-persist.js — stub
// Full implementation: persistent dropzone registry with JAA backing
// UUID: guardian-dropzone-persist-stub-v1
class DropzoneRegistry {
  constructor() { this._store = new Map(); }
  register(id, meta) { this._store.set(id, { ...meta, ts: Date.now() }); return id; }
  get(id)            { return this._store.get(id) || null; }
  all()              { return [...this._store.values()]; }
  remove(id)         { return this._store.delete(id); }
}
module.exports = { DropzoneRegistry };
