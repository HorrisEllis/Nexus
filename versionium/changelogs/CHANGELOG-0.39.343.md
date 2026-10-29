# 0.39.343 — 2026-10-05

James: "the setup desktop envirement. the cos test env. the setup needs, select operating system. with the offocial downloads for each versions,. all the languages, dependancies from the the repos dependancies, every coding language, etc. also the log keeps pulling to the top, can you pull it down to the current outputs of the log." · `[idearium/config] desktop.password -> "nexus" (actor: user)` "should that be hashed?"

- **The setup log** (`idearium/ui/js/desktop-setup.js`). Every repaint rebuilt it at the top. It now follows the newest line. When he has scrolled up to read, it stays where he is; back at the bottom, it follows again. DS-09 tests this in Clear Glass; test-desktop-setup-popup passes 9/9.
- **The password.** `desktop.password` is marked `secret` (`idearium/lib/config-core.cjs`).
  - Its value is never written to the log or the `idearium.config.set` event, only that it was set.
  - It is still stored as plain text, because the desktop viewer shows it so he can sign in. Whether to hash it is his call: a hash can still set the VM's password (`chpasswd -e`), but the viewer could no longer show it.
  - test-config-governance is 3/10 both before and after this change; its failures were already there.
- **Mapped, not built** (`docs/2026-10-05-cos-machines-phasemap.spec` 1.1.0):
  - SU1: the setup asks for the OS and its version, from official releases with their published checksums.
  - SU2: every language the OS packages is offered, the repo's own manifests tick what it needs, and its dependencies are installed by its own package manager in its compartment.
  - Each phase carries the coder's pushback: cloud-image Linux first, Windows needs OS1; and not every language in one image.
