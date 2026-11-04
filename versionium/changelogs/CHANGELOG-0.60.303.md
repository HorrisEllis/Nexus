# 0.60.303 — CIE-EG's component registry is the systems' spine

James, 2026-10-30:
> "the component registry in the cie-eg slots into the systems spine. i have been removing as much friction within my systems as possible"

## Read field by field (Emerge's `CIE-EG_Specification_v0_3_1.md` against the Nexus tree)

| CIE-EG | Nexus | Same? |
|---|---|---|
| §5.1 record `id, namespace, name, version, uuid` | Component (`loom/schema/component.js`) plus the uuid axiom | the same five fields |
| hooks `{dir, shape}` | Hook `{component_id, name, type, direction}` | CIE-EG adds payload **shape**; Nexus adds an open transport **type** |
| road (out hook → in hook; "wire compiles to a road") | Wire `{from_hook_id, to_hook_id}` | the same edge |
| registry hash + contract hash | `registryVersion` (components, spine, event bus, contract) | the same idea |
| gate pipeline: typed gaps with pressure; `block_at` closes a road | dependency gate (RULE D), handshake (§5.11), circuit breaker | one mechanism instead of three |

## Recorded
- **On DB21** (one registry schema at every level, open): CIE-EG §5 is its component level.
  - Nexus's hook `type` stays as an optional transport field.
  - Payload shapes are added to Nexus's hooks. These are RULE A's behaviour schemas, at the hook.
  - COS's registry bus (MG_D7) is the CIE-EG gate.
- **To confirm, two readings:**
  1. Emerge's spec is the source of truth, and Nexus conforms to it.
  2. Nexus's transport `type` either goes into CIE-EG upstream or stays a Nexus extension.

Record only. Nothing is built.
