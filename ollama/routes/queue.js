'use strict';
/**
 * ollama/routes/queue.js
 * GET /api/queue — matches registry-components.js: queue.status
 */

const { state } = require('../lib/state.js');
const { json } = require('../lib/http-utils.js');

async function handle(req, res, { method, pathname }) {
  if (method === 'GET' && pathname === '/api/queue') {
    json(res, 200, {
      ok: true,
      depth: state.queue.length,
      running: state.running.size,
      completed_today: state.statsToday.completed,
      failed_today: state.statsToday.failed,
    });
    return true;
  }
  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/api/queue' },
];
