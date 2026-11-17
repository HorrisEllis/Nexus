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
// 0.4.0 (Nexus 0.60.377–0.60.378, CE6, CE7: borderless, James 2026-11-02 "Also make it borderless."): James, 2026-11-02: "Look cos 0.3.0". 0.60.376 changed main.js and settings.js (close and minimize are his, the
// Windows notification while COS is in the tray) and left this at 0.3.0, so the workflow would have refused it and his 0.3.0 exe would never get them.
// 0.5.0 (Nexus 0.60.389, CA4): James, 2026-11-04: "run in service with admin privilages for more control and power." · "run on startup with an option to
// disable." Nexus's headless part as the Windows service NexusCOS through NSSM (LocalSystem, at boot), his tray switch; Clear Glass started in his session.
// 0.6.0 (Nexus 0.60.390, CA5): James, 2026-11-04: "have it pull from the git. it should be installing the cos ui. this is redundant garbage." Nothing
// linked: COS installs Nexus from GitHub itself (git clone, else the latest release zip; npm install), links it and starts it, so the cockpit opens.
// 0.7.0 (Nexus 0.60.391, CA6): James, 2026-11-05, with 0.6.0 showing "'C:\\Program' is not recognized as an internal or external command": "needs
// to ask for install location also." npm.cmd under Program Files now runs quoted through cmd.exe; every install asks where.
// 0.7.1 (Nexus 0.60.418, MG35b): James, 2026-11-06, with COS saying "Nexus did not start: nexus linked is already running (pid 7492): stop it first":
// "opening cos gives this error. can you make it so  only one can and will open to the same instance." COS uses the Nexus already running when it
// answers; one running but silent is said, with Restart Nexus.
// 0.8.0 (Nexus 0.60.514): James, 2026-11-13: "Can you push and release CLS like as an update? So I could, let's make it a service." (CLS read
// as COS.) The exe had changed since cos-v0.7.1 with no bump, so the cos-app workflow refused it and his 0.7.1 never got: SC16 (0.60.460,
// "also can we have cos.exe run the command prompts in the background?": Clear Glass started through electron.exe, no console window) and SC7
// (0.60.464: Settings › Startup and services in the cockpit, with "Run Nexus as a Windows service", NexusCOS through nssm.exe, CA4 0.5.0).
// 0.8.1 (Nexus 0.60.518–0.60.525): James, 2026-11-13: "then merge push and release cos.exe and nexus." · "when you are done". The exe changed in
// cos/app/runtime.js (SW5a, 0.60.518: a release whose duties live in cos/manager/duties.js is recognised as one that hands over to COS's manager,
// not only one with lib/nexus/core-duties.js), so it is a new exe; without it, his COS would start a 0.60.518+ Nexus as an old self-supervising one.
// 0.9.0 (Nexus 0.60.528, CA8; numbered 0.60.516 on its branch): James, 2026-11-13, told the service switch needs nssm.exe, which is not on his machine and not in his NSSM.zip
// (that is his NSM v2): "need to build it from scratch." COS carries its own service host, cos/app/bin/cos-svc.exe (C#, built with the compiler
// Windows carries): it answers the service control manager, runs node + autopilot as NexusCOS (LocalSystem, at boot), rotates the logs, starts
// Nexus again when it exits or stops answering its health URL (his NSM v2's rule). The switch no longer needs nssm.exe.
// 0.10.0 (Nexus 0.60.540, CA10): James, 2026-11-14, told the COS app only says a newer COS is out and he installs it by hand: "so this cant use the
// update tool?" · offered COS updating itself: "yes." Settings › Update gains COS itself: Install downloads the newest cos-v setup and its SHA256SUMS
// into COS's folder (cos-updates/<version>), runs it only when its SHA-256 is the release's, silently (/S --force-run), and COS closes and starts
// again; a private release uses the GitHub sign-in git keeps. The last installer is kept for a roll back.
// 0.10.1 (Nexus 0.60.545): James, 2026-11-15, Settings › Update still saying "an unzipped release folder (no .git yet)": "you fixed this right? like
// do i reinstall? this needs to be automatic." The fix in lib/nexus-update.js lives in his Nexus folder, which only that broken updater could update.
// COS's exe is what reaches him: when it opens it tells git, once, to trust exactly his linked folder for every user (git config --system
// safe.directory; elevated, or one UAC prompt remembered), so the service's check works and the automatic update brings the new code (git-trust.js).
// 0.10.2 (Nexus 0.60.556): James, 2026-11-17, with COS saying "Nexus did not start: ports 7799, 7820, 4800, 9000 already in use by another program":
// "it needs to just do that not have a button. or not make another copy period. like it should be a projection ontop of the service". Nexus ran as
// the Windows service (NexusCOS, 0.5.0), so COS had no run record and tried a second copy. COS now asks the status port who holds it: when it is
// Nexus (COS's manager answers /api/cos/health), COS attaches to it and shows it; only ports held by something else still stop the start.
// 0.10.3 (Nexus 0.60.557): James, 2026-11-17: "the ui keeps crashing and kicking me out of the pipeline tab. i want that to stop, also keeps refreshing the overview of the systems." · "cos ui needs to stop refreshing and kicking me off the page when it reloads. pissing me off." The window re-checked the cockpit every 2 s with a 1.5 s wait; one slow
// answer (96% memory) flipped it to the starting page and the next reloaded the cockpit's home. Now ~10 s of misses before it leaves, and back on his page.
module.exports = { version: '0.10.3' };
