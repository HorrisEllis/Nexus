spec:
  meta:
    name:        heartbeat
    version:     2.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-heartbeat-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Three-tier health monitoring. Tier 1: health probe every 10s. Tier 2: API pulse every 30s. Tier 3: telemetry frame every 60s fed through meta layer (ALK, BDA, sigma, telemetry-codec). ServiceDriftEngine on tier 3.

