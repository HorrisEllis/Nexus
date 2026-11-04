# 0.60.390 (COS 0.6.0) — COS installs Nexus from GitHub itself

James, 2026-11-04, with COS 0.5.0 open on "no Nexus folder is linked yet" and the old window behind it:
> "okay. what is this ? where is the cos ui ? also, have it pull from the git. it should be installing the cos ui. this is redundant garbage."
>
> "i know i downloaded it. this is what i get."

## Grounded first

- **COS 0.5.0 opened as designed (MG36)**, on its starting page. With nothing linked it could only say "link a folder". He has no folder linked:
  his downloads are release zips.
- **The old window behind it was his earlier COS**, still running. 0.5.0 opens Versions & manual update only on request.

## Built (CA5)

- **`cos/app/install.js`.** It installs Nexus into `<COS root>\nexus`:
  - `git clone --filter=blob:none` when git is on the machine (a clone already there is pulled);
  - else the latest release's `nexus-<version>.zip` from GitHub, unpacked;
  - then `npm install`.
- **The controller's `installNexus`** installs, links the folder, sets it to start with COS, and starts it. The window then becomes the cockpit.
- **First launch with nothing linked installs by itself.** `autoInstall` is on by default and is his switch.
- **The starting page shows each step.** A failure is said with its reason and an **Install Nexus** button. Nothing half-done is linked.
- **Linking his own folder still works** (Versions & manual update).

## Proof

- `test-cos-install` 6/6:
  - IN-01: the git clone and npm commands, exactly; a clone already there is pulled.
  - IN-02: the release-zip path.
  - IN-03: a failure stops with its reason; a missing npm is said with where to get Node.js.
  - IN-04: the controller links and starts.
  - IN-05: the starting page's states.
  - IN-06: COS 0.6.0, and install.js in the exe.
- The COS app suites stay green.

## Not verified

- On Windows: there is no Windows here. His first launch of 0.6.0 is the test. It needs Node.js (with npm); git is optional.
