'use strict';
const { Event }     = require('./Event.js');
const { Gate }      = require('./Gate.js');
const { Stream }    = require('./Stream.js');
const { StreamLog } = require('./StreamLog.js');
module.exports = { Event, Gate, Stream, StreamLog };

// ── Bus — named-stream factory (used by emerge-ide.js) ────────────────────────
class Bus {
  constructor() { this._streams = new Map(); }
  stream(name) {
    if (!this._streams.has(name)) this._streams.set(name, new Stream());
    return this._streams.get(name);
  }
}
module.exports = { Bus, Event, Gate, Stream, StreamLog };
