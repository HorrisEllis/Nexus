/**
 * ui/tv-shell/components/guardian.js
 * Guardian channel component. Reads from /contract first, then polls
 * only routes the contract declares. Shows dispatch + provider status.
 */
class GuardianComponent extends SystemComponent {
  constructor(ports) {
    super('guardian', ports.gd || 7820, ports);
    this.pollInterval = 4000;
  }

  async fetchLive() {
    const [health, jobs, provs] = await Promise.allSettled([
      this.fetchHealth(),
      this.fetchRoute('/api/jobs'),
      this.fetchRoute('/api/providers'),
    ]);
    return {
      health: health.status === 'fulfilled' ? health.value : null,
      jobs:   jobs.status   === 'fulfilled' ? jobs.value   : null,
      provs:  provs.status  === 'fulfilled' ? provs.value  : null,
    };
  }

  updateLive(el, health, live) {
    this._updateStatusDot(el, health);

    const jobs  = live?.jobs  || health?.jobs  || {};
    const provs = live?.provs || health?.providers || {};
    const jobCount  = typeof jobs === 'object' ? (Array.isArray(jobs) ? jobs.length : (jobs.active || jobs.count || 0)) : jobs;
    const provCount = typeof provs === 'object' ? (Array.isArray(provs) ? provs.filter(p => p.connected).length : (provs.connected || Object.keys(provs).length)) : provs;

    this._setMetrics(el, [
      [jobCount  ?? '—', 'Active Jobs'],
      [provCount ?? '—', 'Providers'],
    ]);

    // Live job list
    if (Array.isArray(live?.jobs) && live.jobs.length > 0) {
      this._setLive(el, `
        <div class="comp-section-head">Recent Jobs</div>
        ${live.jobs.slice(0, 5).map(j => `
          <div style="display:flex;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
            <span style="font-family:'Space Mono',monospace;font-size:9px;color:rgba(255,255,255,.2)">${(j.id||'').slice(0,8)}</span>
            <span style="font-size:10px;color:rgba(255,255,255,.5)">${j.provider || j.agent || '—'}</span>
            <span style="font-family:'Space Mono',monospace;font-size:9px;color:${j.status==='complete'?'#00e5ff':j.status==='error'?'#ff4444':'#ffaa00'};margin-left:auto">${j.status||'—'}</span>
          </div>
        `).join('')}
      `);
    }
  }
}
registerComponent('guardian', GuardianComponent);
