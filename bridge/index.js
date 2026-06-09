#!/usr/bin/env node
'use strict';
/**
 * sovereign-node v1.0.1
 *
 * Usage:
 *   node index.js
 *   node index.js --cli       # boot + attach interactive CLI
 *
 * Env:
 *   NEXUS_PORT NEXUS_DATA_DIR NEXUS_GROUP NEXUS_API_KEY
 *   NEXUS_PLAYWRIGHT NEXUS_LOG OLLAMA_HOST NEXUS_CLI=true
 */

const { boot, attachShutdown } = require('./bridge-node/boot');
const CFR = require('./bridge-cfr/index');

const args    = process.argv.slice(2);
const withCLI = args.includes('--cli') || process.env.NEXUS_CLI === 'true';

boot().then(async (ctx) => {
    const { server, identity, busEmit } = ctx;

    // Wire CFR module
    try {
        CFR.install(ctx);
        console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'INFO', msg: 'bridge-cfr online', uuid: CFR.MODULE_UUID }));
    } catch (e) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', msg: 'bridge-cfr skipped', error: e.message }));
    }

    // Wire bridge-ai-identity
    let aiIdentity = null;
    try {
        aiIdentity = require('./bridge-ai-identity/index');
        aiIdentity.registerWithDataBus(ctx.dataBus, ctx.busEmit);
        console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'INFO', msg: 'bridge-ai-identity online' }));
    } catch (e) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', msg: 'bridge-ai-identity skipped', error: e.message }));
    }

    // Wire bridge-swarm
    try {
        const { SwarmEngine } = require('./bridge-swarm/index');
        const swarmEngine = new SwarmEngine({ dataDir: ctx.config && ctx.config.dataDir });
        swarmEngine.init(ctx.bus, {
            gate:      ctx.gate      || null,
            ime:       ctx.ime       || null,
            transport: ctx.routing   || null,
            dataBus:   ctx.dataBus   || null,
            identity:  ctx.identity  || null,
            ollama:    null,
            ai:        aiIdentity    || null,
        });
        ctx.swarm = swarmEngine;
        console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'INFO', msg: 'bridge-swarm online' }));
    } catch (e) {
        console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'WARN', msg: 'bridge-swarm skipped', error: e.message }));
    }

    // Intercept HTTP before boot 404 handler
    const bootListeners = server.rawListeners('request');
    server.removeAllListeners('request');

    server.on('request', async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key' });
            return res.end();
        }

        const urlParts = (req.url || '/').split('?')[0].split('/').filter(Boolean);
        const method   = req.method;
        const top      = urlParts[0];

        const readBody = async () => {
            if (!['POST','PUT'].includes(method)) return {};
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
        };

        const jsonOut = (code, obj) => {
            if (res.headersSent) return;
            const d = JSON.stringify(obj, null, 2);
            res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Content-Length': Buffer.byteLength(d) });
            res.end(d);
        };

        // /cfr/*
        if (top === 'cfr') {
            const body = await readBody();
            const result = CFR.route(method, urlParts, body, req, res);
            if (result !== null) return jsonOut(result && result.ok === false ? 400 : 200, result || { ok: false, error: 'null result' });
            return jsonOut(404, { ok: false, error: 'Unknown CFR route' });
        }

        // /canvas/* via canvas module
        if (top === 'canvas' && ctx.canvas && ctx.canvas.handle) {
            const handled = await ctx.canvas.handle(req, res, urlParts, method);
            if (handled) return;
        }

        // /ai/* — bridge-ai-identity routes
        if (top === 'ai' && aiIdentity) {
            const body = await readBody();
            if (urlParts[1] === 'classify' && method === 'POST') {
                const result = aiIdentity.classifyIntent(body.prompt || '');
                return jsonOut(200, { ok: true, ...result });
            }
            if (urlParts[1] === 'dispatch' && method === 'POST') {
                try {
                    const result = await aiIdentity.dispatch(body.provider, body.prompt, body);
                    return jsonOut(200, { ok: true, ...result });
                } catch (e) { return jsonOut(500, { ok: false, error: e.message }); }
            }
        }

        // /swarm/* — bridge-swarm routes
        if (top === 'swarm' && ctx.swarm) {
            const body = await readBody();
            if (urlParts[1] === 'run' && method === 'POST') {
                try {
                    const runId = await ctx.swarm.runSwarm(body.swarmId, { input: body.input });
                    return jsonOut(200, { ok: true, runId });
                } catch (e) { return jsonOut(500, { ok: false, error: e.message }); }
            }
            if (urlParts[1] === 'pipeline' && method === 'POST') {
                try {
                    const runId = await ctx.swarm.runPipeline(body.pipelineId, { input: body.input });
                    return jsonOut(200, { ok: true, runId });
                } catch (e) { return jsonOut(500, { ok: false, error: e.message }); }
            }
            if (urlParts[1] === 'status' && method === 'GET') {
                return jsonOut(200, { ok: true, pipelines: ctx.swarm._pipelines?.size ?? 0, swarms: ctx.swarm._swarms?.size ?? 0 });
            }
        }

        // /cli/command — HTTP CLI
        if (top === 'cli' && method === 'POST' && urlParts[1] === 'command') {
            const body   = await readBody();
            const cmd    = body.command;
            if (!cmd) return jsonOut(400, { ok: false, error: 'command required' });
            const { dispatch } = require('./bridge-cli/nexus-cli');
            const port   = Number(process.env.NEXUS_PORT) || 3747;
            const captured = [];
            const origWrite = process.stdout.write.bind(process.stdout);
            process.stdout.write = (d) => { captured.push(String(d)); return true; };
            try { await dispatch(cmd, { port, host: 'localhost', bus: ctx.bus, busEmit: ctx.busEmit, ctx }); }
            finally { process.stdout.write = origWrite; }
            const output = captured.join('').replace(/\x1b\[[0-9;]*m/g, '');
            return jsonOut(200, { ok: true, command: cmd, output });
        }

        // Pass to boot listeners
        let handled = false;
        for (const listener of bootListeners) {
            if (!res.headersSent) listener.call(server, req, res);
            else { handled = true; break; }
        }
    });

    attachShutdown(server, busEmit, identity.uuid);

    if (withCLI) {
        const { startCLI } = require('./bridge-cli/nexus-cli');
        const port = Number(process.env.NEXUS_PORT) || 3747;
        setTimeout(() => startCLI({ port, host: 'localhost', bus: ctx.bus, busEmit: ctx.busEmit, ctx }), 350);
    }

}).catch(err => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'FATAL', msg: 'Boot failed', error: err.message, stack: err.stack }));
    process.exit(1);
});
