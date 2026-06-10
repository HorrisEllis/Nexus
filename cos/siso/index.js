/**
 * siso/index.js
 * COMPARTMENT OS — SISO Core barrel export (CJS)
 *
 * The four primitives. No dependencies beyond COS foundation/constants.js.
 * Everything in COS that processes events is built from these.
 *
 * →E→E→
 */

'use strict';

const { Event }     = require('./Event.js');
const { Gate }      = require('./Gate.js');
const { Stream }    = require('./Stream.js');
const { StreamLog } = require('./StreamLog.js');

module.exports = { Event, Gate, Stream, StreamLog };
