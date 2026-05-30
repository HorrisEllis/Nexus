// ═══════════════════════════════════════════════════
// NEXUS — Tauri WebSocket Server
// tauri/src-tauri/main.rs
//
// Serves as the bridge between:
//   Extension ↔ WebSocket ↔ NEXUS Node.js core
//
// Fixed port 7771. All messages are typed JSON.
// Spawns nexus core as child process.
// Forwards bus events to extension via WebSocket.
// ═══════════════════════════════════════════════════

// [Rust source — compiled by cargo as part of Tauri build]

/*
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use futures::{StreamExt, SinkExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Manager, State};

const WS_PORT: u16 = 7771;

// ── Message shapes (schema-validated) ─────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
struct NexusMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id:       Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service:  Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload:  Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content:  Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error:    Option<String>,
}

// ── Shared state ──────────────────────────────────
struct AppState {
    tx: broadcast::Sender<String>,
    connections: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<String>>>>,
}

#[tokio::main]
async fn main() {
    let (tx, _rx) = broadcast::channel::<String>(1000);
    let state = Arc::new(AppState {
        tx: tx.clone(),
        connections: Arc::new(Mutex::new(HashMap::new())),
    });

    // Spawn WebSocket server on fixed port
    let ws_state = state.clone();
    tokio::spawn(async move {
        start_ws_server(ws_state, WS_PORT).await;
    });

    // Start Tauri
    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            emit_to_bus,
            get_bus_status,
            ping_guardian,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── WebSocket server ───────────────────────────────
async fn start_ws_server(state: Arc<AppState>, port: u16) {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await
        .expect(&format!("Cannot bind to {}", addr));

    println!("[NEXUS] WebSocket server on ws://{}", addr);

    loop {
        let (stream, addr) = listener.accept().await.unwrap();
        let state = state.clone();
        let conn_id = format!("{}", addr);

        tokio::spawn(async move {
            handle_connection(stream, state, conn_id).await;
        });
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    state: Arc<AppState>,
    conn_id: String,
) {
    let ws_stream = accept_async(stream).await.unwrap();
    let (mut write, mut read) = ws_stream.split();

    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(100);

    // Register connection
    state.connections.lock().unwrap().insert(conn_id.clone(), tx);

    // Broadcast receiver for this connection
    let mut broadcast_rx = state.tx.subscribe();

    // Send welcome
    let welcome = json!({
        "type": "nexus.connected",
        "version": "1.0.0",
        "port": WS_PORT,
        "laws": ["I", "II", "III", "IV"]
    });
    write.send(Message::Text(welcome.to_string())).await.ok();

    loop {
        tokio::select! {
            // Incoming from client (extension)
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_message(&text, &state).await;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        write.send(Message::Pong(data)).await.ok();
                    }
                    None | Some(Err(_)) => break,
                    _ => {}
                }
            }
            // Outgoing from broadcast channel
            msg = broadcast_rx.recv() => {
                if let Ok(text) = msg {
                    if write.send(Message::Text(text)).await.is_err() { break; }
                }
            }
            // Outgoing from direct channel
            msg = rx.recv() => {
                if let Some(text) = msg {
                    if write.send(Message::Text(text)).await.is_err() { break; }
                }
            }
        }
    }

    // Cleanup
    state.connections.lock().unwrap().remove(&conn_id);
}

async fn handle_message(text: &str, state: &Arc<AppState>) {
    let msg: Result<NexusMessage, _> = serde_json::from_str(text);
    match msg {
        Ok(m) => {
            // Forward all messages to Node.js core via HTTP
            // (In production: use IPC or shared memory)
            let client = reqwest::Client::new();
            let _ = client.post("http://localhost:7772/bus")
                .json(&m)
                .send()
                .await;

            // Broadcast to all other connections
            let _ = state.tx.send(text.to_string());
        }
        Err(e) => {
            eprintln!("[NEXUS WS] Parse error: {}", e);
        }
    }
}

// ── Tauri commands (JS → Rust) ─────────────────────
#[tauri::command]
async fn emit_to_bus(
    state: State<'_, Arc<AppState>>,
    event_type: String,
    payload: Value,
) -> Result<(), String> {
    let msg = json!({ "type": event_type, "payload": payload });
    state.tx.send(msg.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_bus_status() -> Value {
    json!({ "port": WS_PORT, "status": "live", "laws": ["I","II","III","IV"] })
}

#[tauri::command]
async fn ping_guardian() -> Value {
    match reqwest::get("http://localhost:7771/ping").await {
        Ok(r) => json!({ "ok": r.status().is_success() }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}
*/

// ═══════════════════════════════════════════════════
// Node.js WebSocket server (development / no Tauri)
// tauri/ws-server.js
//
// Run with: node tauri/ws-server.js
// Used in dev before Tauri is compiled.
// Identical message protocol to Rust server.
// ═══════════════════════════════════════════════════

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const WS_PORT  = parseInt(process.env.GUARDIAN_PORT || '7771');
const BUS_PORT = 7772;  // Node.js NEXUS core HTTP endpoint

// ── State ──────────────────────────────────────────
const clients    = new Map();  // id → ws
let   clientSeq  = 0;

// ── HTTP server (for Tauri commands + /ping) ───────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', port: WS_PORT, clients: clients.size }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/complete') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const msg = JSON.parse(body);
        // Forward to NEXUS bus — handled by agent routing
        const result = await forwardToNexus(msg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/bus') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        broadcast(msg);
        res.writeHead(200); res.end('ok');
      } catch { res.writeHead(400); res.end('bad json'); }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

// ── WebSocket server ───────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const id = `client-${++clientSeq}`;
  clients.set(id, ws);

  // Welcome
  ws.send(JSON.stringify({
    type:    'nexus.connected',
    version: '1.0.0',
    port:    WS_PORT,
    laws:    ['I', 'II', 'III', 'IV'],
    id,
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg, id, ws);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: `Invalid JSON: ${e.message}` }));
    }
  });

  ws.on('close', () => { clients.delete(id); });
  ws.on('error', (e) => { console.error(`[WS:${id}] Error:`, e.message); clients.delete(id); });

  console.log(`[NEXUS WS] Client connected: ${id} (total: ${clients.size})`);
});

function handleMessage(msg, senderId, ws) {
  // Broadcast to all other clients
  broadcast(msg, senderId);

  // Handle ping
  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
    return;
  }

  // Guardian pulse (peer discovery)
  if (msg.type === 'guardian.pulse') {
    broadcast({ type: 'guardian.peer_seen', peerId: msg.id, services: msg.services });
    return;
  }
}

function broadcast(msg, excludeId = null) {
  const text = JSON.stringify(msg);
  for (const [id, client] of clients) {
    if (id !== excludeId && client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

async function forwardToNexus(msg) {
  // In dev: route to the NEXUS core via HTTP on port 7772
  // In production: direct IPC with Tauri Rust process
  try {
    const res = await fetch(`http://localhost:${BUS_PORT}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(60000),
    });
    return res.json();
  } catch (e) {
    // If NEXUS core not running, return simulated response for development
    return { content: `[NEXUS dev mode] Would route to ${msg.service}: ${msg.prompt?.slice(0,50)}…` };
  }
}

// ── Start ──────────────────────────────────────────
httpServer.listen(WS_PORT, '127.0.0.1', () => {
  console.log(`[NEXUS] Guardian bridge live on localhost:${WS_PORT}`);
  console.log(`[NEXUS] HTTP: /ping  /api/complete  /bus`);
  console.log(`[NEXUS] WS:  ws://localhost:${WS_PORT}`);
});

module.exports = { broadcast, clients };
