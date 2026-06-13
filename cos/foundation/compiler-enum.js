/**
 * foundation/compiler-enum.js
 * COMPARTMENT OS — Supported Compiler/Bundler Definitions
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 */

'use strict';

const COMPILERS = Object.freeze([
  { id: 'tsc',              displayName: 'TypeScript',        configFile: 'tsconfig.json'         },
  { id: 'esbuild',          displayName: 'esbuild',           configFile: null                    },
  { id: 'vite',             displayName: 'Vite',              configFile: 'vite.config.*'         },
  { id: 'webpack',          displayName: 'Webpack',           configFile: 'webpack.config.js'     },
  { id: 'rollup',           displayName: 'Rollup',            configFile: 'rollup.config.*'       },
  { id: 'parcel',           displayName: 'Parcel',            configFile: null                    },
  { id: 'swc',              displayName: 'SWC',               configFile: '.swcrc'                },
  { id: 'babel',            displayName: 'Babel',             configFile: 'babel.config.*'        },
  { id: 'electron-builder', displayName: 'Electron Builder',  configFile: 'electron-builder.yml'  },
  { id: 'pyinstaller',      displayName: 'PyInstaller',       configFile: null                    },
  { id: 'pkg',              displayName: 'pkg (Node→binary)', configFile: null                    },
  { id: 'go-build',         displayName: 'go build',          configFile: 'go.mod'                },
  { id: 'cargo',            displayName: 'cargo build',       configFile: 'Cargo.toml'            },
  { id: 'make',             displayName: 'Make',              configFile: 'Makefile'              },
  { id: 'gradle',           displayName: 'Gradle',            configFile: 'build.gradle'          },
  { id: 'maven',            displayName: 'Maven',             configFile: 'pom.xml'               },
  { id: 'docker',           displayName: 'Docker (build)',    configFile: 'Dockerfile'            },
  { id: 'wasm-pack',        displayName: 'WASM Pack',         configFile: null                    },
]);

const COMPILER_MAP = new Map(COMPILERS.map(c => [c.id, c]));
const COMPILER_IDS = Object.freeze(COMPILERS.map(c => c.id));

module.exports = Object.freeze({ COMPILERS, COMPILER_MAP, COMPILER_IDS });
