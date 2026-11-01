'use strict';
// cos/app/version.js — the version of the COS application itself (not of Nexus). COS is the small outer shell that changes rarely; Nexus releases do not rebuild it.
// James, 2026-10-16: "cos app for windows". 0.1.1 (Nexus 0.60.111): the store names a zip from its contents; 0.1.0 never got 0.60.103's fix. Bump this when cos/app/** changes in a way he should get as a new exe; .github/workflows/cos-app.yml publishes cos-v<version> once.
// 0.1.2 (Nexus 0.60.137): COS says when a newer COS is out (cos/app/app-update.js) — 0.1.0 never knew 0.1.1 existed, and
// refused his root-layout zips for a day because of it.
// 0.2.0 (Nexus 0.60.364, MG35): James, 2026-11-01: "need the exe for cos. its how were going to start nexus from now on". COS links his own Nexus folder
// (the git folder he updates in place), starts it with the system node (never Electron-as-node, which would break Clear Glass), and starts it when COS
// opens if he ticks it.
module.exports = { version: '0.2.0' };
