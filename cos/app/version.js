'use strict';
// cos/app/version.js — the version of the COS application itself (not of Nexus). COS is the small outer shell that changes rarely; Nexus releases do not rebuild it.
// James, 2026-10-16: "cos app for windows". 0.1.1 (Nexus 0.60.111): the store names a zip from its contents; 0.1.0 never got 0.60.103's fix. Bump this when cos/app/** changes in a way he should get as a new exe; .github/workflows/cos-app.yml publishes cos-v<version> once.
// 0.1.2 (Nexus 0.60.137): COS says when a newer COS is out (cos/app/app-update.js) — 0.1.0 never knew 0.1.1 existed, and
// refused his root-layout zips for a day because of it.
// 0.2.0 (Nexus 0.60.364, MG35): James, 2026-11-01: "need the exe for cos. its how were going to start nexus from now on". COS links his own Nexus folder
// (the git folder he updates in place), starts it with the system node (never Electron-as-node, which would break Clear Glass), and starts it when COS
// opens if he ticks it.
// 0.3.0 (Nexus 0.60.365, MG36/MG37): James, 2026-11-02: "no i mean cos ui as the app. like a full orchastration application. since it's like vmware.
// not the old one. but maybe add the old one as an manual update feature." · "cos starts up with windows, minimizes to tray unless disabled. admin
// access and a service if applicable." The window is COS's cockpit; the old page is Versions & manual update; COS starts at logon, elevated, to the tray.
// 0.4.0 (Nexus 0.60.377, CE6): James, 2026-11-02: "Look cos 0.3.0". 0.60.376 changed main.js and settings.js (close and minimize are his, the
// Windows notification while COS is in the tray) and left this at 0.3.0, so the workflow would have refused it and his 0.3.0 exe would never get them.
module.exports = { version: '0.4.0' };
