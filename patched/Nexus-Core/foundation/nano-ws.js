// ═══════════════════════════════════════════════════
// NEXUS — NanoWS
// foundation/nano-ws.js
//
// Replaces the 'ws' npm package. Zero dependencies.
// Uses Node's built-in 'net' and 'http' modules only.
//
// DESIGN:
//   The 'ws' package is 45KB + 3 transitive deps for
//   WebSocket. Node's built-in http module exposes the
//   'upgrade' event — everything else is RFC 6455
//   framing in pure JS. That's all ws does internally.
//
//   NanoWS implements:
//     - HTTP → WS upgrade handshake (RFC 6455 §4)
//     - Frame encode/decode (opcodes: text, binary, ping, pong, close)
//     - Masking (client→server RFC requirement)
//     - NanoWSServer: drop-in for new ws.Server({ port })
//     - NanoWSClient: drop-in for new ws(url)
//
//   API surface used by NEXUS tauri/ws-server.js:
//     server.on('connection', (socket) => { ... })
//     socket.send(str)
//     socket.on('message', handler)
//     socket.on('close', handler)
//     socket.close()
//
//   LEVERAGE: Port 7771 bridge runs on this. Every
//   Guardian ↔ NEXUS message flows through here.
//   Zero npm. Zero audit surface.
// ═══════════════════════════════════════════════════

'use strict';

const http   = require('http');
const net    = require('net');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ── WS Frame constants (RFC 6455) ──────────────────
const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── Frame encoder ──────────────────────────────────
function encodeFrame(data, opcode = OP.TEXT, mask = false) {
  const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const len     = payload.length;

  // Header: FIN(1) + RSV(3) + opcode(4) + MASK(1) + len
  let header;
  if (len < 126) {
    header = Buffer.alloc(mask ? 6 : 2);
    header[0] = 0x80 | opcode;
    header[1] = (mask ? 0x80 : 0) | len;
    if (mask) { const k = randKey(); k.copy(header, 2); return applyMask(payload, k, header); }
  } else if (len < 65536) {
    header = Buffer.alloc(mask ? 8 : 4);
    header[0] = 0x80 | opcode;
    header[1] = (mask ? 0x80 : 0) | 126;
    header.writeUInt16BE(len, 2);
    if (mask) { const k = randKey(); k.copy(header, 4); return applyMask(payload, k, header); }
  } else {
    header = Buffer.alloc(mask ? 14 : 10);
    header[0] = 0x80 | opcode;
    header[1] = (mask ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    if (mask) { const k = randKey(); k.copy(header, 10); return applyMask(payload, k, header); }
  }
  return Buffer.concat([header, payload]);
}

function applyMask(payload, key, header) {
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ key[i % 4];
  return Buffer.concat([header, masked]);
}

function randKey() { return crypto.randomBytes(4); }

// ── Frame decoder ──────────────────────────────────
// Returns { opcode, payload, consumed } or null if incomplete
function decodeFrame(buf) {
  if (buf.length < 2) return null;

  const fin    = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let   lenByte = buf[1] & 0x7f;
  let   offset  = 2;

  let payloadLen;
  if (lenByte < 126) {
    payloadLen = lenByte;
  } else if (lenByte === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (masked) {
    if (buf.length < offset + 4 + payloadLen) return null;
    const key     = buf.slice(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) payload[i] = buf[offset + i] ^ key[i % 4];
    return { opcode, payload, consumed: offset + payloadLen, fin };
  } else {
    if (buf.length < offset + payloadLen) return null;
    return { opcode, payload: buf.slice(offset, offset + payloadLen), consumed: offset + payloadLen, fin };
  }
}

// ── NanoSocket — wraps a net.Socket into WS protocol ──
class NanoSocket extends EventEmitter {
  constructor(socket) {
    super();
    this._socket   = socket;
    this._buf      = Buffer.alloc(0);
    this._closed   = false;

    socket.on('data', (chunk) => {
      this._buf = Buffer.concat([this._buf, chunk]);
      this._drain();
    });

    socket.on('close', () => { this._closed = true; this.emit('close'); });
    socket.on('error', (e) => this.emit('error', e));
  }

  _drain() {
    while (this._buf.length > 0) {
      const frame = decodeFrame(this._buf);
      if (!frame) break;
      this._buf = this._buf.slice(frame.consumed);

      switch (frame.opcode) {
        case OP.TEXT:
          this.emit('message', frame.payload.toString('utf8'));
          break;
        case OP.BINARY:
          this.emit('message', frame.payload);
          break;
        case OP.PING:
          this._socket.write(encodeFrame(frame.payload, OP.PONG));
          break;
        case OP.PONG:
          break; // heartbeat ack
        case OP.CLOSE:
          this.close();
          break;
      }
    }
  }

  send(data) {
    if (this._closed) return;
    const buf = encodeFrame(data, typeof data === 'string' ? OP.TEXT : OP.BINARY);
    this._socket.write(buf);
  }

  ping() {
    if (!this._closed) this._socket.write(encodeFrame(Buffer.alloc(0), OP.PING));
  }

  close(code = 1000, reason = '') {
    if (this._closed) return;
    this._closed = true;
    const payload = Buffer.alloc(2 + reason.length);
    payload.writeUInt16BE(code, 0);
    payload.write(reason, 2);
    this._socket.write(encodeFrame(payload, OP.CLOSE));
    this._socket.end();
    this.emit('close', code, reason);
  }

  get readyState() { return this._closed ? 3 : 1; } // OPEN=1, CLOSED=3
}

// ── NanoWSServer ───────────────────────────────────
class NanoWSServer extends EventEmitter {
  constructor(opts = {}) {
    super();
    const { port = 7771, host = '127.0.0.1', server: externalServer } = opts;

    this._server = externalServer || http.createServer((req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('WebSocket endpoint. Use ws://');
    });

    this._server.on('upgrade', (req, socket, head) => {
      if (!this._validateUpgrade(req)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const key    = req.headers['sec-websocket-key'];
      const accept = crypto.createHash('sha1')
        .update(key + GUID).digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n'
      );

      const ws = new NanoSocket(socket);
      this.emit('connection', ws, req);
    });

    if (!externalServer) {
      this._server.listen(port, host, () =>
        this.emit('listening', { port, host })
      );
    }
  }

  _validateUpgrade(req) {
    return (
      req.headers.upgrade?.toLowerCase() === 'websocket' &&
      req.headers['sec-websocket-key'] &&
      req.headers['sec-websocket-version'] === '13'
    );
  }

  close(cb) { this._server.close(cb); }
  get address() { return this._server.address(); }
}

// ── NanoWSClient ───────────────────────────────────
class NanoWSClient extends EventEmitter {
  constructor(url, protocols = []) {
    super();
    this._url    = typeof url === 'string' ? new URL(url) : url;
    this._closed = false;
    this._socket = null;
    this._connect();
  }

  _connect() {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: this._url.hostname,
      port:     this._url.port || 80,
      path:     this._url.pathname + this._url.search,
      headers: {
        'Connection':            'Upgrade',
        'Upgrade':               'websocket',
        'Sec-WebSocket-Key':     key,
        'Sec-WebSocket-Version': '13',
      },
    });

    req.on('upgrade', (res, socket) => {
      this._socket = new NanoSocket(socket);
      this._socket.on('message', m => this.emit('message', m));
      this._socket.on('close',   () => { this._closed = true; this.emit('close'); });
      this._socket.on('error',   e  => this.emit('error', e));
      this.emit('open');
    });

    req.on('error', e => this.emit('error', e));
    req.end();
  }

  send(data)   { this._socket?.send(data); }
  close(c, r)  { this._socket?.close(c, r); }
  ping()       { this._socket?.ping(); }
  get readyState() { return this._socket?.readyState ?? 0; }
}

module.exports = { NanoWSServer, NanoWSClient, NanoSocket, encodeFrame, decodeFrame };
