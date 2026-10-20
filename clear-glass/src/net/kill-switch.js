'use strict';
/**
 * clear-glass/src/net/kill-switch.js — kill on disconnect for routed windows (CD4, 0.60.179). Spec: clear-glass/spec/compartment-downloads.spec
 * MOD-CDL-KILL. comp_id: cg.net.kill-switch
 *
 * James, 2026-10-21: "kill on disconnect." Earlier (2026-10-15): "maybe a kill if disconnected, like kills the sandbox or compartment
 * completely?" A routed window already fails closed when the transport drops (its PAC is the blackhole). This acts on top of that, on the
 * rung in the policy (compartmentOnDisconnect), kill_tabs by default (the coder's reading of "kill on disconnect", to confirm):
 *   block             nothing more than the blackhole; recorded
 *   kill_tabs         every compartment window closed, its in-flight downloads cancelled, the torrents it handed to qBittorrent stopped
 *   kill_compartment  kill_tabs, then the transport stopped with its data directory wiped, and the quarantine wiped
 * Only a drop it was not asked for counts: ready → failed/stopped while the host is not stopping on purpose. One drop, one record.
 */
const RUNGS = ['block', 'kill_tabs', 'kill_compartment'];

class KillSwitch {
  /**
   * @param {object} d host (TransportHost: on('state'), status(), intentional, stop()), rung() → string, closeWindows() → string[] partitions,
   *   quarantine (cancelAll, wipe), qbit() → QBit|null, handedHashes() → string[], emit, log, now
   */
  constructor(d = {}) {
    this.d = { rung: () => 'kill_tabs', closeWindows: () => [], quarantine: null, qbit: () => null, handedHashes: () => [], emit: () => {}, log: console.warn, now: Date.now, ...d };
    this.prev = null; this._records = []; this._handler = null;
  }
  arm() {
    const host = this.d.host; if (!host || typeof host.on !== 'function') return { disarm() {} };
    this.prev = host.status ? host.status().state : null;
    this._handler = (st) => {
      const was = this.prev; this.prev = st.state;
      if (was === 'ready' && (st.state === 'failed' || st.state === 'stopped') && !host.intentional) {
        this.trigger(st.error || `transport ${st.state}`).catch(e => this.d.log(`[kill-switch] ${e.message}`));
      }
    };
    host.on('state', this._handler);
    return { disarm: () => { try { host.removeListener('state', this._handler); } catch (_) {} } };
  }

  async trigger(why) {
    const rung = RUNGS.includes(this.d.rung()) ? this.d.rung() : 'kill_tabs';
    const rec = { at: this.d.now(), rung, why: String(why || ''), closed: [], cancelled: 0, paused: [], wiped: null, errors: [] };
    const step = async (name, fn) => { try { await fn(); } catch (e) { rec.errors.push(`${name}: ${e.message}`); } };
    if (rung !== 'block') {
      await step('close windows', async () => { rec.closed = (await this.d.closeWindows()) || []; });
      await step('cancel downloads', () => { rec.cancelled = this.d.quarantine ? this.d.quarantine.cancelAll() : 0; });
      await step('stop torrents', async () => {
        const hashes = this.d.handedHashes() || []; const q = this.d.qbit();
        if (hashes.length && q) { const r = await q.stop(hashes); if (r.ok) rec.paused = hashes; else rec.errors.push(`stop torrents: ${r.error}`); }
        else if (hashes.length) rec.errors.push('stop torrents: no qBittorrent connection to stop them with');
      });
    }
    if (rung === 'kill_compartment') {
      await step('wipe transport', async () => { const r = await this.d.host.stop({ wipe: true }); rec.wiped = r.wiped !== false; });
      await step('wipe quarantine', () => { const r = this.d.quarantine ? this.d.quarantine.wipe() : { ok: true }; if (!r.ok) { rec.wiped = false; throw new Error(r.error); } });
    }
    this._records.unshift(rec); this._records.length = Math.min(this._records.length, 10);
    this.d.emit('net.kill', { rung, closed: rec.closed.length, cancelled: rec.cancelled, paused: rec.paused.length });
    this.d.log(`[kill-switch] transport dropped (${rec.why}) → ${rung}: ${rec.closed.length} window(s) closed, ${rec.cancelled} download(s) cancelled, ${rec.paused.length} torrent(s) stopped${rec.errors.length ? `; failed: ${rec.errors.join('; ')}` : ''}`);
    return rec;
  }
  records() { return this._records.slice(); }
}

module.exports = { KillSwitch, RUNGS };
