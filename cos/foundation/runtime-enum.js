/**
 * foundation/runtime-enum.js
 * COMPARTMENT OS — Supported Runtime Definitions
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 */

'use strict';

const RUNTIMES = Object.freeze([
  { id: 'node',     displayName: 'Node.js',    minVersion: '18.0.0',  entryPattern: ['index.js', 'main.js', 'server.js', 'app.js'] },
  { id: 'python',   displayName: 'Python',     minVersion: '3.10.0',  entryPattern: ['main.py', 'app.py', 'server.py', 'run.py']  },
  { id: 'deno',     displayName: 'Deno',       minVersion: '1.30.0',  entryPattern: ['main.ts', 'mod.ts', 'index.ts']              },
  { id: 'bun',      displayName: 'Bun',        minVersion: '1.0.0',   entryPattern: ['index.ts', 'index.js', 'server.ts']          },
  { id: 'html',     displayName: 'HTML/Browser', minVersion: null,    entryPattern: ['index.html', 'app.html']                     },
  { id: 'electron', displayName: 'Electron',   minVersion: '25.0.0',  entryPattern: ['main.js', 'electron.js']                    },
  { id: 'go',       displayName: 'Go',         minVersion: '1.20.0',  entryPattern: ['main.go']                                   },
  { id: 'rust',     displayName: 'Rust',       minVersion: '1.70.0',  entryPattern: ['src/main.rs']                               },
  { id: 'php',      displayName: 'PHP',        minVersion: '8.1.0',   entryPattern: ['index.php', 'server.php']                   },
  { id: 'ruby',     displayName: 'Ruby',       minVersion: '3.0.0',   entryPattern: ['app.rb', 'server.rb', 'config.ru']          },
  { id: 'java',     displayName: 'Java',       minVersion: '17.0.0',  entryPattern: ['pom.xml', 'build.gradle']                   },
  { id: 'dotnet',   displayName: '.NET',       minVersion: '7.0.0',   entryPattern: ['*.csproj', 'Program.cs']                    },
  { id: 'shell',    displayName: 'Shell',      minVersion: null,      entryPattern: ['run.sh', 'start.sh', 'Makefile']            },
  { id: 'wasm',     displayName: 'WASM',       minVersion: null,      entryPattern: ['*.wasm']                                    },
  // §BUGFIX 2026-09-06: archetype/registry.js's built-in 'exe-runner' and
  // 'max-isolation' archetypes have declared runtimeId: 'exe' since before
  // this checkout, but 'exe' was never added here — a require()-time crash
  // in archetype/registry.js's own schema validation, same failure class as
  // the isKnownRuntimeId bugfix above. 'exe' = native Windows executable
  // (.exe), matching archetype/registry.js's own description for the id.
  { id: 'exe',      displayName: 'Native Executable (.exe)', minVersion: null, entryPattern: ['*.exe'] },
  // §ADDED 2026-09-06 — compartment/qemu-runtime.js. A real isolated Windows
  // (or any guest OS) environment, cross-platform, backed by QEMU/KVM
  // hardware virtualization instead of a host process. entryPattern here
  // isn't a launcher script (see runtime-enum's other rows) — it's either a
  // vm.json config or the qcow2 disk itself; qemu-runtime.js's
  // resolveVmConfig() reads whichever is passed as entryFile.
  { id: 'qemu-windows', displayName: 'Isolated Windows (QEMU/KVM)', minVersion: null, entryPattern: ['vm.json', '*.qcow2'] },
]);

const RUNTIME_MAP = new Map(RUNTIMES.map(r => [r.id, r]));

const RUNTIME_IDS = Object.freeze(RUNTIMES.map(r => r.id));

// §BUGFIX 2026-07-04: cos/archetype/schema.js has required isKnownRuntimeId
// from this file since before this checkout — it was never defined here,
// only RUNTIMES/RUNTIME_MAP/RUNTIME_IDS were. That's a require()-time crash
// in archetype/schema.js, which crashes archetype/registry.js at require()
// time, which crashes cos/cli/index.js at require() time — every single
// `cos` CLI command failed before argument parsing ever ran.
function isKnownRuntimeId(id) {
  return RUNTIME_IDS.includes(id);
}

module.exports = Object.freeze({ RUNTIMES, RUNTIME_MAP, RUNTIME_IDS, isKnownRuntimeId });
