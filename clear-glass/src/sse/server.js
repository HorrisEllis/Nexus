'use strict';
/**
 * src/sse/server.js — SSE Bus Bridge
 * UUID: cg-sse-server-v1-0000-0000-000000000004
 *
 * Subscribes to the SISO bus via bus.on('*', ...) and broadcasts
 * ALL events to connected SSE clients.
 * 
 * The bus is the source of truth. SSE is just a window into it.
 * NEXUS components subscribe here to receive the full event stream.
 */

const http    = require('http');
const express = require('express');
const { on }  = require('../core/bus');

class SseServer {
  constructor({ port, moduleId, moduleUuid }) {
    this.port       = port;
    this.moduleId   = moduleId;
    this.moduleUuid = moduleUuid;
    this.clients    = new Set();
    this.app        = express();
    this.server     = null;
    this.log        = [];
    this.MAX_LOG    = 1000;
    this._unsub     = null;
  }

  async start() {
    // Subscribe to ALL bus events and broadcast
    this._unsub = on('*', (event) => {
      this._broadcast(event.type, event.data);
    });

    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });

    this.app.get('/health', (req, res) => {
      res.json({ ok: true, clients: this.clients.size, module: this.moduleId });
    });

    this.app.get('/events', (req, res) => {
      res.setHeader('Content-Type',  'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');
      res.setHeader('X-Module-Id',   this.moduleId);
      res.flushHeaders();

      this._write(res, 'identity', { moduleId: this.moduleId, moduleUuid: this.moduleUuid, ts: Date.now() });

      // Replay on ?replay=N
      const n = parseInt(req.query.replay || '0');
      if (n > 0) this.log.slice(-Math.min(n, this.MAX_LOG)).forEach(e => this._write(res, e.type, e.data));

      this.clients.add(res);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 20000);
      req.on('close', () => { clearInterval(ping); this.clients.delete(res); });
    });

    this.app.use(express.json());
    this.app.post('/emit', (req, res) => {
      // Allow NEXUS to push events INTO the SSE stream (and optionally onto the bus)
      const { type, data } = req.body;
      if (!type) return res.status(400).json({ error: 'type required' });
      this._broadcast(type, data || {});
      res.json({ ok: true, clients: this.clients.size });
    });

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`[SSE] :${this.port}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  // Direct emit — for cases where we need to push without a bus event
  emit(type, data = {}) {
    this._broadcast(type, { ...data, _module: this.moduleId });
  }

  _broadcast(type, data) {
    const entry = { type, data };
    this.log.push(entry);
    if (this.log.length > this.MAX_LOG) this.log.shift();

    const dead = [];
    for (const client of this.clients) {
      try { this._write(client, type, data); }
      catch { dead.push(client); }
    }
    for (const d of dead) this.clients.delete(d);
  }

  _write(res, type, data) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async stop() {
    if (this._unsub) this._unsub();
    for (const c of this.clients) { try { c.end(); } catch {} }
    this.clients.clear();
    return new Promise(r => { if (this.server) this.server.close(r); else r(); });
  }
}

module.exports = SseServer;
