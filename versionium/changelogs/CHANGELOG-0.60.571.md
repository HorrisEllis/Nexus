# 0.60.571: CPU utilisation read (CP6a)

James, 2026-11-18: "also the cpu utilization doesn't work, can you hook that in now that its a service,"

Found: COS's usage said `cpuPct: null` for every system (the PowerShell reader gives CPU seconds, not a percent) and `load1: 0` for the host
(os.loadavg is always 0 on Windows).

- `cos/manager/usage.js`: each system's `cpuPct` from its CPU seconds between two readings (delta / elapsed / cores); the host's new
  `cpuPct` from os.cpus() times between two readings. The first reading has no interval and says null, never 0. No process or poll added: the
  sampler COS already runs gives the interval.

Mapped first: docs/2026-11-01-the-compartment-phasemap.spec, CP6a addendum 2026-11-18.
Proof: tests/modules/test-cos-usage-cpu.test.js 3/3. Loaded at COS's manager's next start.
