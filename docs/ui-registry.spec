spec:
  meta:
    name:        ui-registry
    version:     1.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-ui-registry-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      UI session tracking. Any UI registers via POST /api/ui/register, gets sessionId. Heartbeat checked 30s, timeout 70s. Disconnect emits SSE event to all clients. Multiple UIs simultaneously.

