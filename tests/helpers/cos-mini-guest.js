'use strict';
/**
 * tests/helpers/cos-mini-guest.js — a real, tiny Linux guest for proving the COS
 * test VM end to end on a Linux host that has QEMU, without downloading anything.
 * §0.39.264
 *
 * It is a kernel + initramfs (direct kernel boot — the manifest's "boot"), built
 * from the HOST's own files: its kernel (/boot/vmlinuz-*), a static busybox, the
 * host's qemu-ga and node with their shared libraries. The initramfs is written
 * as a cpio "newc" archive by the JS below. /init mounts the basics, finds the
 * guest-agent port by name in /sys/class/virtio-ports, and runs qemu-ga — so the
 * guest speaks exactly the protocol a provisioned Debian image does.
 *
 * build(outDir) -> { ok, kernel, initrd, baseImage, manifest } | { ok:false, reason }
 * This is test infrastructure: the product path for making a base image is
 * cos/testenv/provision.js.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function _which(bin) { try { return execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).trim() || null; } catch (_) { return null; } }

function _libs(bin) {
  let out = '';
  try { out = execFileSync('ldd', [bin], { encoding: 'utf8' }); } catch (_) { return []; }
  return out.split('\n').map(l => (l.match(/=>\s*(\/\S+)/) || l.match(/^\s*(\/\S+)/) || [])[1]).filter(Boolean);
}

/** a cpio newc archive of { path: { data|link|dir, mode } } */
function cpio(entries) {
  const chunks = [];
  let ino = 1;
  const pad4 = (n) => (4 - (n % 4)) % 4;
  const hex = (n) => n.toString(16).padStart(8, '0');
  const put = (name, mode, data) => {
    const nameBuf = Buffer.from(name + '\0');
    const h = '070701' + [ino++, mode, 0, 0, 1, Math.floor(Date.now() / 1000), data.length, 0, 0, 0, 0, nameBuf.length, 0].map(hex).join('');
    chunks.push(Buffer.from(h), nameBuf, Buffer.alloc(pad4(110 + nameBuf.length)), data, Buffer.alloc(pad4(data.length)));
  };
  for (const [name, e] of Object.entries(entries)) {
    if (e.dir) put(name, 0o040755, Buffer.alloc(0));
    else if (e.link) put(name, 0o120777, Buffer.from(e.link));
    else put(name, 0o100000 | (e.mode || 0o644), e.data);
  }
  put('TRAILER!!!', 0, Buffer.alloc(0));
  return Buffer.concat(chunks);
}

const INIT = `#!/bin/sh
/bin/busybox mkdir -p /proc /sys /dev /tmp /mnt /run /var/run
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox mount -t tmpfs tmpfs /tmp
/bin/busybox --install -s /bin
export PATH=/usr/local/bin:/usr/bin:/bin:/sbin
echo "[mini-guest] up"
PORT=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  for d in /sys/class/virtio-ports/*; do
    [ -f "$d/name" ] && [ "$(cat $d/name)" = "org.qemu.guest_agent.0" ] && PORT="/dev/$(basename $d)"
  done
  [ -n "$PORT" ] && [ -e "$PORT" ] && break
  sleep 0.5
done
echo "[mini-guest] guest agent port: $PORT"
exec /usr/bin/qemu-ga -m virtio-serial -p "$PORT"
`;

function build(outDir) {
  if (process.platform !== 'linux') return { ok: false, reason: 'the mini guest is built from a Linux host\'s own files' };
  const kernel = fs.existsSync('/boot') ? fs.readdirSync('/boot').filter(f => /^vmlinuz-/.test(f)).map(f => path.join('/boot', f)).find(f => { try { fs.accessSync(f, fs.constants.R_OK); return true; } catch (_) { return false; } }) : null;
  const busybox = ['/usr/bin/busybox', '/bin/busybox'].find(f => fs.existsSync(f));
  const qga = _which('qemu-ga') || ['/usr/sbin/qemu-ga', '/usr/bin/qemu-ga'].find(f => fs.existsSync(f));
  const node = process.execPath;
  const missing = [!kernel && 'a readable /boot/vmlinuz-*', !busybox && 'busybox (static)', !qga && 'qemu-ga (qemu-guest-agent)'].filter(Boolean);
  if (missing.length) return { ok: false, reason: `cannot build the mini guest: no ${missing.join(', ')}` };
  const entries = {};
  const dir = (p) => { const parts = p.split('/').filter(Boolean); for (let i = 1; i <= parts.length; i++) entries[parts.slice(0, i).join('/')] = entries[parts.slice(0, i).join('/')] || { dir: true }; };
  const file = (dest, src, mode) => { dir(path.posix.dirname(dest)); entries[dest.replace(/^\//, '')] = { data: fs.readFileSync(src), mode: mode || (fs.statSync(src).mode & 0o777) }; };
  for (const d of ['bin', 'sbin', 'usr/bin', 'usr/local/bin', 'lib', 'lib64', 'etc', 'proc', 'sys', 'dev', 'tmp', 'mnt', 'root']) dir(d);
  file('/bin/busybox', busybox, 0o755);
  entries['bin/sh'] = { link: '/bin/busybox' };
  file('/usr/bin/qemu-ga', qga, 0o755);
  file('/usr/local/bin/node', node, 0o755);
  // npm, so a repo's "npm test" runs in the guest as it would on a provisioned image
  const npmDir = path.join(path.dirname(path.dirname(node)), 'lib', 'node_modules', 'npm');
  if (fs.existsSync(path.join(npmDir, 'bin', 'npm-cli.js'))) {
    const walk = (abs, rel) => { for (const e of fs.readdirSync(abs, { withFileTypes: true })) { const a = path.join(abs, e.name), r = `${rel}/${e.name}`; if (e.isDirectory()) walk(a, r); else if (e.isFile()) file(r, a); } };
    walk(npmDir, '/usr/local/lib/node_modules/npm');
    entries['usr/local/bin/npm'] = { data: Buffer.from('#!/bin/sh\nexec /usr/local/bin/node /usr/local/lib/node_modules/npm/bin/npm-cli.js "$@"\n'), mode: 0o755 };
  }
  const libs = new Set([..._libs(qga), ..._libs(node)]);
  for (const l of libs) { const real = fs.realpathSync(l); file(l, real, 0o755); }
  entries['init'] = { data: Buffer.from(INIT), mode: 0o755 };
  entries['etc/passwd'] = { data: Buffer.from('root:x:0:0:root:/root:/bin/sh\n'), mode: 0o644 };
  fs.mkdirSync(outDir, { recursive: true });
  const initrd = path.join(outDir, 'mini-initrd.cpio');
  fs.writeFileSync(initrd, cpio(entries));
  const kcopy = path.join(outDir, 'vmlinuz');
  fs.copyFileSync(kernel, kcopy);
  // the overlay needs a qcow2 base even though the guest never mounts it
  const baseImage = path.join(outDir, 'base.qcow2');
  const Q = require('../../cos/compartment/qemu-runtime.js');
  if (!fs.existsSync(baseImage)) Q.createBlankDisk(baseImage, '64M');
  const manifest = { image: baseImage, boot: { kernel: kcopy, initrd, append: 'console=ttyS0 quiet panic=-1' }, runtimes: { node: process.version, sh: 'busybox' }, share: 'disk', by: 'tests/helpers/cos-mini-guest.js' };
  return { ok: true, kernel: kcopy, initrd, baseImage, manifest };
}

module.exports = { build, cpio };
