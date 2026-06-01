#!/usr/bin/env node
/**
 * DROP ZONE CLI — dropzone
 *
 * Commands:
 *   start           Start the server
 *   stop            Stop the server (sends SIGTERM to stored PID)
 *   status          Show running server status
 *   list            List active files
 *   upload <file>   Upload a file from the CLI
 *   delete <token>  Delete a file by token
 *   config          Show current config
 *   config set <k> <v>  Edit a config value
 *   qr              Print QR code for the server URL
 */

"use strict";

const { program } = require("commander");
const path        = require("path");
const fs          = require("fs");
const os          = require("os");
const http        = require("http");
const https       = require("https");

// ─── Lazy deps ──────────────────────────────────────────────────────────────
let chalk, ora, qrcode, open;
try { chalk  = require("chalk"); }         catch { chalk  = { green: s=>s, red: s=>s, yellow: s=>s, cyan: s=>s, bold: s=>s, gray: s=>s, dim: s=>s, white: s=>s }; }
try { ora    = require("ora"); }           catch { ora    = (t) => ({ start() { process.stdout.write(t + '...\n'); return this; }, succeed(m){ console.log('✓', m||''); }, fail(m){ console.error('✗', m||''); } }); }
try { qrcode = require("qrcode"); }        catch { qrcode = null; }
try { open   = require("open"); }          catch { open   = null; }

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, "dropzone.config.json");
const PID_PATH    = path.resolve(os.tmpdir(), "dropzone.pid");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    console.error(chalk.red("✗ Cannot read dropzone.config.json"));
    process.exit(1);
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── API helpers ─────────────────────────────────────────────────────────────
function apiGet(cfg, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: cfg.port, path: pathname, method: "GET" },
      res => {
        let body = "";
        res.on("data", d => (body += d));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve(body); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function apiDelete(cfg, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: cfg.port, path: pathname, method: "DELETE" },
      res => { resolve(res.statusCode); }
    );
    req.on("error", reject);
    req.end();
  });
}

function apiUpload(cfg, filePath, ttl) {
  return new Promise((resolve, reject) => {
    const boundary = "---DropZoneBoundary" + Date.now();
    const filename  = path.basename(filePath);
    const fileData  = fs.readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const ttlPart = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="ttl"\r\n\r\n` +
      `${ttl}`
    );
    const footer  = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body    = Buffer.concat([header, fileData, ttlPart, footer]);

    const req = http.request(
      {
        host: "127.0.0.1", port: cfg.port, path: "/api/upload", method: "POST",
        headers: {
          "Content-Type":   `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      res => {
        let d = "";
        res.on("data", c => (d += c));
        res.on("end", () => {
          if (res.statusCode === 200) resolve(JSON.parse(d));
          else reject(new Error(d));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function fmtSize(b) {
  if (b < 1024)       return b + " B";
  if (b < 1048576)    return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
}

function fmtCountdown(expiresAt) {
  const diff = Math.max(0, expiresAt - Date.now());
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function isServerRunning(cfg) {
  return new Promise(resolve => {
    const req = http.request(
      { host: "127.0.0.1", port: cfg.port, path: "/api/info", method: "GET", timeout: 1000 },
      res => resolve(res.statusCode === 200)
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

function printBanner(cfg) {
  const ips = getLocalIPs();
  console.log();
  console.log(chalk.cyan.bold("  ██████╗ ██████╗  ██████╗ ██████╗      ███████╗ ██████╗ ███╗   ██╗███████╗"));
  console.log(chalk.cyan.bold("  ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗     ╚══███╔╝██╔═══██╗████╗  ██║██╔════╝"));
  console.log(chalk.cyan.bold("  ██║  ██║██████╔╝██║   ██║██████╔╝       ███╔╝ ██║   ██║██╔██╗ ██║█████╗  "));
  console.log(chalk.cyan.bold("  ██║  ██║██╔══██╗██║   ██║██╔═══╝       ███╔╝  ██║   ██║██║╚██╗██║██╔══╝  "));
  console.log(chalk.cyan.bold("  ██████╔╝██║  ██║╚██████╔╝██║          ███████╗╚██████╔╝██║ ╚████║███████╗"));
  console.log(chalk.cyan.bold("  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝          ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝"));
  console.log();
  console.log(chalk.gray("  Disposable File Sharing Server"));
  console.log();
  console.log(chalk.green("  ✓ Listening on"), chalk.white(`${cfg.host}:${cfg.port}`));
  console.log(chalk.green("  ✓ Upload dir:  "), chalk.white(path.resolve(cfg.uploadDir)));
  console.log(chalk.green("  ✓ Max file:    "), chalk.white(`${cfg.maxFileSizeMB} MB`));
  console.log();
  console.log(chalk.bold("  Access URLs:"));
  console.log(chalk.cyan(`    http://localhost:${cfg.port}`));
  ips.forEach(ip => {
    console.log(chalk.cyan(`    http://${ip.address}:${cfg.port}`) + chalk.gray(`  (${ip.name})`));
  });
  console.log();
  console.log(chalk.gray("  Press Ctrl+C to stop.\n"));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Definition
// ─────────────────────────────────────────────────────────────────────────────

program
  .name("dropzone")
  .description("DROP ZONE — Disposable file sharing server")
  .version("2.0.0");

// ── start ────────────────────────────────────────────────────────────────────
program
  .command("start")
  .description("Start the DROP ZONE server")
  .option("-p, --port <number>", "Override port from config")
  .option("-d, --dir <path>",    "Override upload directory")
  .option("--no-open",           "Don't open browser automatically")
  .action(async (opts) => {
    const cfg = loadConfig();
    if (opts.port) cfg.port = parseInt(opts.port);
    if (opts.dir)  cfg.uploadDir = opts.dir;

    const already = await isServerRunning(cfg);
    if (already) {
      console.log(chalk.yellow(`\n  ⚠ Server already running on port ${cfg.port}\n`));
      process.exit(0);
    }

    const { createServer } = require("./server.js");
    const server = createServer(cfg);

    server.on("listening", () => {
      fs.writeFileSync(PID_PATH, String(process.pid));
      printBanner(cfg);
      if (opts.open !== false && open) {
        open(`http://localhost:${cfg.port}`).catch(() => {});
      }
    });
    server.on("error", err => {
      console.error(chalk.red(`\n  ✗ Server error: ${err.message}\n`));
      process.exit(1);
    });

    process.on("SIGINT",  () => shutdown(server));
    process.on("SIGTERM", () => shutdown(server));
  });

function shutdown(server) {
  console.log(chalk.yellow("\n  Shutting down DROP ZONE..."));
  clearInterval(server._cleanupInterval);
  // Delete any remaining uploaded files
  for (const [, entry] of server._registry) {
    try { fs.unlinkSync(entry.filepath); } catch {}
  }
  server.close(() => {
    try { fs.unlinkSync(PID_PATH); } catch {}
    console.log(chalk.green("  ✓ Stopped cleanly.\n"));
    process.exit(0);
  });
}

// ── status ───────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Check if the server is running")
  .action(async () => {
    const cfg = loadConfig();
    const spin = ora("Checking server...").start();
    const running = await isServerRunning(cfg);
    if (running) {
      spin.succeed(chalk.green(`Server is RUNNING on port ${cfg.port}`));
      try {
        const info  = await apiGet(cfg, "/api/info");
        const files = await apiGet(cfg, "/api/files");
        console.log(chalk.gray(`  IPs:   `) + info.ips.map(i => chalk.cyan(i.address)).join(", "));
        console.log(chalk.gray(`  Files: `) + chalk.white(files.length + " active"));
        const totalSize = files.reduce((s, f) => s + f.size, 0);
        console.log(chalk.gray(`  Size:  `) + chalk.white(fmtSize(totalSize)));
      } catch {}
    } else {
      spin.fail(chalk.red(`Server is NOT running on port ${cfg.port}`));
    }
    console.log();
  });

// ── stop ─────────────────────────────────────────────────────────────────────
program
  .command("stop")
  .description("Stop the running server")
  .action(async () => {
    const cfg = loadConfig();
    try {
      const pid = parseInt(fs.readFileSync(PID_PATH, "utf8").trim());
      process.kill(pid, "SIGTERM");
      console.log(chalk.green(`\n  ✓ Sent stop signal to PID ${pid}\n`));
    } catch {
      console.log(chalk.yellow("\n  ⚠ Could not find PID file. Server may not be running via CLI.\n"));
    }
  });

// ── list ─────────────────────────────────────────────────────────────────────
program
  .command("list")
  .alias("ls")
  .description("List all active files on the running server")
  .action(async () => {
    const cfg = loadConfig();
    const spin = ora("Fetching files...").start();
    try {
      const files = await apiGet(cfg, "/api/files");
      spin.stop();
      if (files.length === 0) {
        console.log(chalk.gray("\n  No active files.\n"));
        return;
      }
      console.log();
      console.log(
        chalk.bold(pad("TOKEN", 12)) +
        chalk.bold(pad("FILENAME", 36)) +
        chalk.bold(pad("SIZE", 10)) +
        chalk.bold(pad("DL", 5)) +
        chalk.bold("EXPIRES")
      );
      console.log(chalk.gray("─".repeat(80)));
      for (const f of files) {
        const url = `http://localhost:${cfg.port}/d/${f.token}`;
        console.log(
          chalk.cyan(pad(f.token, 12)) +
          chalk.white(pad(f.filename.slice(0, 34), 36)) +
          chalk.gray(pad(fmtSize(f.size), 10)) +
          chalk.yellow(pad(String(f.downloads), 5)) +
          chalk.green(fmtCountdown(f.expiresAt))
        );
        console.log(chalk.gray("  " + url));
      }
      console.log();
    } catch {
      spin.fail(chalk.red("Could not connect to server. Is it running?"));
    }
  });

function pad(str, len) {
  return String(str).padEnd(len).slice(0, len);
}

// ── upload ───────────────────────────────────────────────────────────────────
program
  .command("upload <file>")
  .alias("up")
  .description("Upload a file to the running server")
  .option("-t, --ttl <seconds>", "Time-to-live in seconds", "3600")
  .action(async (filePath, opts) => {
    const cfg = loadConfig();
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(chalk.red(`\n  ✗ File not found: ${resolved}\n`));
      process.exit(1);
    }
    const spin = ora(`Uploading ${path.basename(resolved)}...`).start();
    try {
      const result = await apiUpload(cfg, resolved, parseInt(opts.ttl));
      spin.succeed(chalk.green("Uploaded successfully!"));
      const url = `http://localhost:${cfg.port}/d/${result.token}`;
      const ips  = getLocalIPs();
      console.log();
      console.log(chalk.gray("  Token:   ") + chalk.cyan(result.token));
      console.log(chalk.gray("  Size:    ") + chalk.white(fmtSize(result.size)));
      console.log(chalk.gray("  Expires: ") + chalk.green(fmtCountdown(result.expiresAt)));
      console.log();
      console.log(chalk.bold("  Share Links:"));
      console.log(chalk.cyan(`    http://localhost:${cfg.port}/d/${result.token}`));
      ips.forEach(ip => {
        console.log(chalk.cyan(`    http://${ip.address}:${cfg.port}/d/${result.token}`));
      });
      if (qrcode) {
        console.log();
        const mainUrl = ips[0]
          ? `http://${ips[0].address}:${cfg.port}/d/${result.token}`
          : url;
        const qr = await qrcode.toString(mainUrl, { type: "terminal", small: true });
        console.log(qr);
      }
      console.log();
    } catch (err) {
      spin.fail(chalk.red("Upload failed: " + err.message));
    }
  });

// ── delete ───────────────────────────────────────────────────────────────────
program
  .command("delete <token>")
  .alias("del")
  .alias("rm")
  .description("Delete a file by token")
  .action(async (token) => {
    const cfg = loadConfig();
    const spin = ora("Deleting...").start();
    try {
      const status = await apiDelete(cfg, `/api/files/${token}`);
      if (status === 200) spin.succeed(chalk.green(`File ${token} deleted.`));
      else spin.fail(chalk.red(`Failed (HTTP ${status})`));
    } catch {
      spin.fail(chalk.red("Could not connect to server."));
    }
    console.log();
  });

// ── config ────────────────────────────────────────────────────────────────────
program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const cfg = loadConfig();
    console.log();
    console.log(chalk.bold("  Current configuration:") + chalk.gray(`  (${CONFIG_PATH})`));
    console.log(chalk.gray("  " + "─".repeat(50)));
    for (const [k, v] of Object.entries(cfg)) {
      console.log(`  ${chalk.cyan(k.padEnd(22))} ${chalk.white(JSON.stringify(v))}`);
    }
    console.log();
    console.log(chalk.gray("  Edit dropzone.config.json directly, or use:"));
    console.log(chalk.gray("  node dropzone.js config:set <key> <value>"));
    console.log();
  });

program
  .command("config:set <key> <value>")
  .description("Set a config value")
  .action((key, value) => {
    const cfg = loadConfig();
    if (!(key in cfg)) {
      console.error(chalk.red(`\n  ✗ Unknown key: ${key}\n`));
      process.exit(1);
    }
    const original = cfg[key];
    if (typeof original === "number") cfg[key] = Number(value);
    else if (typeof original === "boolean") cfg[key] = value === "true";
    else cfg[key] = value;
    saveConfig(cfg);
    console.log(chalk.green(`\n  ✓ ${key} = ${JSON.stringify(cfg[key])}\n`));
  });

// ── qr ────────────────────────────────────────────────────────────────────────
program
  .command("qr")
  .description("Print QR code for the server URL")
  .action(async () => {
    if (!qrcode) {
      console.error(chalk.red("\n  ✗ qrcode package not installed. Run: npm install qrcode\n"));
      process.exit(1);
    }
    const cfg  = loadConfig();
    const ips  = getLocalIPs();
    const addr = ips[0] ? ips[0].address : "localhost";
    const url  = `http://${addr}:${cfg.port}`;
    console.log(chalk.cyan(`\n  QR code for: ${url}\n`));
    const qr = await qrcode.toString(url, { type: "terminal", small: true });
    console.log(qr);
  });

program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
