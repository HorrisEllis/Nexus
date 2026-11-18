# 0.60.576: a build no longer depends on RAID being up at that second (OL4a decoupled)

James, 2026-11-18: "coupled. thats going to kill nexus. we are so close to nexus being able to be nexus after 7 months"

Found: after COS restarted, RAID (in Cortex) was degraded for a few minutes; NM1's automatic retry at 09:16 asked RAID, got no answer, and the
fallback (0.60.574's strict rule) refused DeepSeek again, so the build went to the cloud agents.

- `idearium/api/index.js`: RAID's last fit rule is kept in Idearium's own data (`raid-fit-rule.json`) each time RAID answers; when RAID does not,
  that rule decides and the run says so ("RAID's last rule (resident) decided here").

Proof: test-plan-code-run-attention 48/48.
The couplings seen the same day, to remove one by one (his order): COS's restart restarting Idearium mid-build; RAID's absence changing a build's
models; Intelligence's crash loop; his own Ollama use evicting a build's model (OL5c gives his clients the line).
