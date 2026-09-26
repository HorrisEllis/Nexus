#!/bin/sh
# cos/testenv/setup-vm.sh — set up the COS test VM on Linux or macOS. Run it once.
# comp_id: nexus.cos.testenv.setup-vm-sh    (0.39.264)
# Same as setup-vm.bat: checks QEMU (prints the install command if missing — it
# needs sudo, so it is not run for you), then node cos/testenv/provision.js "$@".
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "[cos-testenv] Node.js is not on PATH."; exit 1; }
[ "$1" = "--status" ] && exec node "$HERE/provision.js" --status
if ! command -v qemu-system-x86_64 >/dev/null 2>&1 || ! command -v qemu-img >/dev/null 2>&1; then
  echo "[cos-testenv] QEMU is not installed. Install it, then run this again:"
  if [ "$(uname)" = "Darwin" ]; then echo "  brew install qemu"
  elif command -v apt-get >/dev/null 2>&1; then echo "  sudo apt install qemu-system-x86 qemu-utils"
  elif command -v dnf >/dev/null 2>&1; then echo "  sudo dnf install qemu-system-x86 qemu-img"
  else echo "  (your package manager) qemu-system-x86_64 + qemu-img"; fi
  exit 1
fi
if [ "$(uname)" = "Linux" ] && [ ! -w /dev/kvm ]; then
  echo "[cos-testenv] /dev/kvm is not writable — the VM will use TCG (slower). To fix: sudo usermod -aG kvm \"$USER\" and log in again."
fi
exec node "$HERE/provision.js" "$@"
