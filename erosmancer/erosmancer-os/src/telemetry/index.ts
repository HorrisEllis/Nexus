// ============================================================
// ErosmancerOS — Telemetry
// Structured JSONL logger. In-memory ring buffer + disk flush.
// ============================================================

import { randomUUID } from "crypto";
import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, rmSync } from "fs";
import { dirname } from "path";
import type { TelemetryEvent, OSConfig } from "../types/index.ts";

export class Telemetry {
  private readonly config: OSConfig["telemetry"];
  private buffer: TelemetryEvent[] = [];
  // §0.39.285 — events not yet on disk. flush() used to append the WHOLE ring buffer (up to maxEvents) every
  // flushIntervalMs and never mark it written, so each event was rewritten thousands of times: James's
  // data/erosmancer/telemetry.jsonl reached 8.6 GB. Now each event is written once, debug is not persisted
  // (EROS_PERSIST_LEVEL, default info), and the file rotates at a cap (EROS_TELEMETRY_MAX_MB, default 25)
  // keeping one previous file (telemetry.1.jsonl).
  private pending: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OSConfig["telemetry"]) {
    this.config = config;

    if (config.persistPath) {
      const dir = dirname(config.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    this.flushTimer = setInterval(() => this.flush(), config.flushIntervalMs);
    if (typeof this.flushTimer.unref === "function") this.flushTimer.unref();
    this.rotateIfOver();
  }

  private static readonly RANK: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

  private maxBytes(): number {
    const mb = Number(process.env.EROS_TELEMETRY_MAX_MB ?? this.config.maxFileMB ?? 25);
    return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
  }

  /** rotate: telemetry.jsonl → telemetry.1.jsonl (the older .1 is dropped) once the file passes the cap */
  private rotateIfOver(): void {
    const p = this.config.persistPath;
    if (!p) return;
    try {
      if (!existsSync(p) || statSync(p).size < this.maxBytes()) return;
      const prev = p.replace(/\.jsonl$/, "") + ".1.jsonl";
      if (existsSync(prev)) rmSync(prev, { force: true });
      renameSync(p, prev);
    } catch (err) {
      console.error("[Telemetry] rotate failed:", err);
    }
  }

  emit(
    category: TelemetryEvent["category"],
    level: TelemetryEvent["level"],
    message: string,
    data?: unknown,
    ctx?: { tabId?: string; nodeUuid?: string; commandId?: string }
  ): void {
    const event: TelemetryEvent = {
      id: randomUUID(),
      ts: Date.now(),
      category,
      level,
      message,
      data,
      ...ctx,
    };

    this.buffer.push(event);

    // Ring buffer: evict oldest when over limit
    if (this.buffer.length > this.config.maxEvents) {
      this.buffer.shift();
    }
    const RANK = Telemetry.RANK;
    const keep = RANK[String(process.env.EROS_PERSIST_LEVEL ?? "info").toLowerCase()] ?? 1;
    if (this.config.persistPath && (RANK[level] ?? 0) >= keep) {
      this.pending.push(event);
      if (this.pending.length > this.config.maxEvents) this.pending.shift();
    }

    // Printed so it's visible without file config. §0.39.264: EROS_LOG_LEVEL
    // (debug|info|warn|error, default debug) limits what is PRINTED — every
    // event is still buffered and persisted. Clear Glass starts ErosmancerOS
    // with info, so each CDP message does not flood its console.
    const floor = RANK[String(process.env.EROS_LOG_LEVEL ?? "debug").toLowerCase()] ?? 0;
    if ((RANK[level] ?? 0) < floor) return;
    const prefix = `[${level.toUpperCase()}][${category}]`;
    if (level === "error" || level === "warn") {
      console.error(`${prefix} ${message}`, data ?? "");
    } else {
      console.log(`${prefix} ${message}`, data ?? "");
    }
  }

  debug(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "debug", msg, data, ctx as never);
  }
  info(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "info", msg, data, ctx as never);
  }
  warn(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "warn", msg, data, ctx as never);
  }
  error(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "error", msg, data, ctx as never);
  }

  private flush(): void {
    if (!this.config.persistPath || this.pending.length === 0) return;

    const batch = this.pending;
    this.pending = [];
    const lines = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
    try {
      this.rotateIfOver();
      appendFileSync(this.config.persistPath, lines, "utf8");
    } catch (err) {
      console.error("[Telemetry] flush failed:", err);
    }
  }

  getEvents(filter?: Partial<Pick<TelemetryEvent, "category" | "level">>): TelemetryEvent[] {
    if (!filter) return [...this.buffer];
    return this.buffer.filter((e) => {
      if (filter.category && e.category !== filter.category) return false;
      if (filter.level && e.level !== filter.level) return false;
      return true;
    });
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(); // final flush on shutdown
  }
}
