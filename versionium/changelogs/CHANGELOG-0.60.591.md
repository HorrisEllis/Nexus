# 0.60.591 — nexus://<system>.<surface>: each system's addresses are its own

James, 2026-11-19: "this is why we need to use nexus:// for each system instead of a port so we multiplex … so nothing is hardcoded. that way raid knows where to route, then have the naming convention saved to the genesis spec and my architecture spec."

## What changed
nexus://<system>.<surface>, each system's addresses its own: Open UI reached Clear Glass on its health address (:7704, its nexus-wire module) while its commands are on :7702 (its bridge), and failed "not found". Now one resolver in COS (addressOf) serves the pipeline's nexus:// steps and COS's own acts: nexus://<system> is the main address as before, nexus://<system>.<surface> the address the system declares under that name (runtime.process.addresses); Clear Glass declares cmd; Open UI asks for nexus://clear-glass.cmd. Proven by hand on his machine: window.open to :7702 was emitted. The convention recorded in the genesis spec (idearium/spec-engine/templates/genesis.spec, proposed 1.6.0) and the architecture spec: named, never numbered; each system declares its addresses in its own data, its .spec meta the target; RAID reads the same metadata to route. Not yet: COS writing the .spec meta at add/import, RAID reading it, retiring the port tables. test-cos-console 11/12 (CC-09, driven in Clear Glass, failed before), test-cos-service 11/11.

## Files
- cos/manager/server.js: addressOf, the resolver for nexus:// and Open UI
- clear-glass/compartment.json: addresses.cmd
- idearium/spec-engine/templates/genesis.spec, docs/architecture-spec/architecture-spec.spec: the convention
