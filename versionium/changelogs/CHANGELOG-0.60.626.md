# 0.60.626 — dynamic heap for a high-priority system

James, 2026-11-20: "we need idearium stablized using the chunking, and dynamic memory heap allocation" · "We need idwarium"

## What changed
Read the same day from COS's log of Idearium: every real build took its heap to 93% of the 1,024 MB his caps give it, and Idearium went down; the eleventh EMB3 build died with it.
- `heapMB` (cos/manager/resources.js): a system he set to priority `high` gets, at each start, the larger of his cap and half the memory free then, up to `policy.dynamicHeapMaxMB` (3072). His cap stays the floor; other systems keep their caps; `policy.dynamicHeap: false` turns it off. At today's free memory, about 2 GB for Idearium.

test-cos-resources 11/11, test-resource-adaptive 28/28.

## Files
- cos/manager/resources.js
