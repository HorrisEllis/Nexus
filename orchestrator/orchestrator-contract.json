{
  "id": "orchestrator-v1",
  "version": "2.0.0",
  "namespace": "orchestrator",
  "port": 9000,
  "uuid": "orch-contract-v1-0000-4000-0000-000000000001",
  "role": "\u00a7AXIOM source of truth \u2014 control & command layer, system registry, recall",
  "health": {
    "method": "GET",
    "path": "/health",
    "returns": {
      "ok": true,
      "online": 0,
      "total": 6,
      "uptime": 0
    }
  },
  "axioms": [
    "Orchestrator starts first \u2014 all other systems register to it",
    "All CLIs use /api/recall to restore context (read-only)",
    "All state mutations are persisted to data/ledger/orchestrator.jsonl",
    "Ledger is append-only \u2014 never truncated"
  ],
  "siso": {
    "emits": [
      "orchestrator.booted",
      "orchestrator.system.registered",
      "orchestrator.ui.hotswap",
      "orchestrator.cli.terminal.opened"
    ],
    "consumes": [
      "*"
    ]
  },
  "routes": [
    {
      "method": "GET",
      "path": "/health"
    },
    {
      "method": "GET",
      "path": "/api/status"
    },
    {
      "method": "GET",
      "path": "/api/recall",
      "params": [
        "system",
        "type",
        "n",
        "since",
        "before"
      ],
      "note": "\u00a7AXIOM: all CLIs use this"
    },
    {
      "method": "POST",
      "path": "/api/register",
      "body": [
        "systemId",
        "port",
        "meta"
      ],
      "note": "\u00a7AXIOM: all systems call this on boot"
    },
    {
      "method": "GET",
      "path": "/api/registry"
    },
    {
      "method": "POST",
      "path": "/api/heartbeat",
      "body": [
        "systemId",
        "port",
        "status"
      ]
    },
    {
      "method": "GET",
      "path": "/api/ledger",
      "params": [
        "system",
        "n"
      ]
    },
    {
      "method": "POST",
      "path": "/api/ledger",
      "body": [
        "system",
        "type",
        "payload"
      ]
    },
    {
      "method": "GET",
      "path": "/api/channels"
    },
    {
      "method": "GET",
      "path": "/api/bus",
      "params": [
        "system",
        "n"
      ]
    },
    {
      "method": "POST",
      "path": "/api/exec",
      "body": [
        "cmd",
        "args"
      ]
    },
    {
      "method": "GET",
      "path": "/api/cli"
    },
    {
      "method": "GET",
      "path": "/api/api-map"
    },
    {
      "method": "GET",
      "path": "/sse"
    },
    {
      "method": "GET",
      "path": "/ports.js"
    },
    {
      "method": "GET",
      "path": "/ui/:system"
    },
    {
      "method": "GET",
      "path": "/api/cortex/*",
      "note": "proxied to :3748"
    },
    {
      "method": "GET",
      "path": "/api/guardian/*",
      "note": "proxied to :7820"
    },
    {
      "method": "GET",
      "path": "/api/idearium/*",
      "note": "proxied to :4800"
    },
    {
      "method": "GET",
      "path": "/cfr/health",
      "note": "orchestrator kernel CFR"
    },
    {
      "method": "GET",
      "path": "/cfr/state"
    },
    {
      "method": "GET",
      "path": "/cfr/stream"
    }
  ]
}