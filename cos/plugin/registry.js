/**
 * plugin/registry.js
 * COMPARTMENT OS — Built-in Plugin Manifest Registry (spec §62.2 / §62.3)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * All 14 runtime manifests + 16 compiler manifests, transcribed from spec.
 * Same id situation as archetype/blueprint registries: spec's JSON Schema
 * requires format:uuid, the listing used mnemonic strings — real UUID v4s
 * minted once, hardcoded below.
 *
 * These are DATA, not code — entryPoint: 'index.js' is a placeholder the
 * spec itself uses for every built-in (no actual plugin code ships for
 * built-ins; the runtime/compiler integration logic already lives in
 * foundation/runtime-enum.js and foundation/compiler-enum.js). Built-ins
 * are registered as PluginRecord entries with state:'active' and no
 * sandbox compartment — they're foundation-trusted, not third-party code
 * that needs isolating. The vm-sandboxed Plugin Host API (plugin/host-api.js)
 * is exercised by CUSTOM plugins installed via plugin/installer.js, not by
 * these.
 */

'use strict';

const { validateManifest } = require('./schema.js');

const RUNTIME_MANIFESTS_RAW = [
  {
    id: '5f75be8a-ff7f-401f-9076-c640314f8d03', name: 'node-runtime', version: '1.0.0',
    displayName: 'Node.js Runtime', description: 'Node.js v18/v20/v22',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'node', displayName: 'Node.js', version: '20.x',
      executablePath: '%PROGRAMFILES%\\nodejs\\node.exe',
      startCommand: 'node {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['PATH=%PROGRAMFILES%\\nodejs;%PATH%'],
      detectionHints: ['package.json', 'node_modules', '.nvmrc', '.node-version'],
      compilerIds: ['tsc', 'esbuild', 'vite', 'webpack', 'rollup', 'parcel', 'swc', 'babel', 'pkg'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '98b0c18c-ab0c-4bc1-9859-25e2caee267e', name: 'python-runtime', version: '1.0.0',
    displayName: 'Python Runtime', description: 'Python 3.10+, venv isolation',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'python', displayName: 'Python 3', version: '3.12.x',
      executablePath: '%LOCALAPPDATA%\\Programs\\Python\\Python312\\python.exe',
      startCommand: 'python {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['PYTHONUNBUFFERED=1'],
      detectionHints: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', '*.py'],
      compilerIds: ['pyinstaller'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '2b7e5768-5b9c-4d07-8e38-cba640240c4e', name: 'electron-runtime', version: '1.0.0',
    displayName: 'Electron Runtime', description: 'Electron v28+ with contextIsolation',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'electron', displayName: 'Electron', version: '28.x',
      executablePath: 'node_modules\\.bin\\electron.cmd',
      startCommand: 'electron {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['ELECTRON_DISABLE_SECURITY_WARNINGS=1'],
      detectionHints: ['electron', 'main.js + BrowserWindow', 'app.asar'],
      compilerIds: ['electron-builder'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '5cd665d6-31bc-4b2d-971f-425f40f13732', name: 'html-runtime', version: '1.0.0',
    displayName: 'HTML Runtime', description: 'Serves static HTML via built-in dev server',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'html', displayName: 'HTML', version: '1.0.0',
      executablePath: '%PROGRAMFILES%\\nodejs\\node.exe',
      startCommand: 'npx serve . -p {{port}}', stopCommand: 'SIGTERM',
      envSetup: [], detectionHints: ['index.html', '*.html'],
      compilerIds: ['vite', 'webpack', 'esbuild', 'parcel'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'ec8df95c-72a5-42da-b297-2a841c0cf7a6', name: 'deno-runtime', version: '1.0.0',
    displayName: 'Deno Runtime', description: 'Deno 1.x / 2.x with permissions model',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'deno', displayName: 'Deno', version: '2.x',
      executablePath: '%USERPROFILE%\\.deno\\bin\\deno.exe',
      startCommand: 'deno run --allow-read --allow-net {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['DENO_DIR=%APPDATA%\\deno'],
      detectionHints: ['deno.json', 'deno.lock', 'import_map.json'], compilerIds: [],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '614c9a27-a099-4f24-b824-6d9ad1f6769b', name: 'bun-runtime', version: '1.0.0',
    displayName: 'Bun Runtime', description: 'Bun 1.x — fast all-in-one JS runtime',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'bun', displayName: 'Bun', version: '1.x',
      executablePath: '%USERPROFILE%\\.bun\\bin\\bun.exe',
      startCommand: 'bun run {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: [], detectionHints: ['bun.lockb', 'bunfig.toml'], compilerIds: [],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'fe86a4b8-74cf-476e-a401-ee39d70523fd', name: 'go-runtime', version: '1.0.0',
    displayName: 'Go Runtime', description: 'Go 1.21+ — go run and go build',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'go', displayName: 'Go', version: '1.22.x',
      executablePath: '%PROGRAMFILES%\\Go\\bin\\go.exe',
      startCommand: 'go run {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['GOPATH=%USERPROFILE%\\go', 'CGO_ENABLED=0'],
      detectionHints: ['go.mod', 'go.sum', '*.go', 'main.go'], compilerIds: ['go-build'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'a65286eb-9536-4f62-a7b3-635e0a0d3936', name: 'rust-runtime', version: '1.0.0',
    displayName: 'Rust Runtime', description: 'Rust 1.75+ — cargo run and cargo build',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'rust', displayName: 'Rust', version: '1.78.x',
      executablePath: '%USERPROFILE%\\.cargo\\bin\\cargo.exe',
      startCommand: 'cargo run -- {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['CARGO_HOME=%USERPROFILE%\\.cargo', 'RUSTUP_HOME=%USERPROFILE%\\.rustup'],
      detectionHints: ['Cargo.toml', 'Cargo.lock', 'src/main.rs'], compilerIds: ['cargo'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: true },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'b19fac82-953e-4b4c-b8c0-8c195e9b62b1', name: 'dotnet-runtime', version: '1.0.0',
    displayName: '.NET Runtime', description: '.NET 6/7/8 — dotnet run',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'dotnet', displayName: '.NET', version: '8.x',
      executablePath: '%PROGRAMFILES%\\dotnet\\dotnet.exe',
      startCommand: 'dotnet run {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['DOTNET_CLI_TELEMETRY_OPTOUT=1'],
      detectionHints: ['*.csproj', '*.fsproj', '*.sln', 'Program.cs'], compilerIds: [],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '906cc98f-551f-4d75-815d-c611a33285a9', name: 'php-runtime', version: '1.0.0',
    displayName: 'PHP Runtime', description: 'PHP 8.x with built-in server',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'php', displayName: 'PHP', version: '8.3.x',
      executablePath: 'C:\\php\\php.exe',
      startCommand: 'php -S 0.0.0.0:{{port}} {{entryFile}}', stopCommand: 'SIGTERM',
      envSetup: [], detectionHints: ['composer.json', 'index.php', '*.php'], compilerIds: [],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'fddc3a8e-6f09-4a57-87aa-963b71200e09', name: 'ruby-runtime', version: '1.0.0',
    displayName: 'Ruby Runtime', description: 'Ruby 3.x with bundler',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'ruby', displayName: 'Ruby', version: '3.3.x',
      executablePath: 'C:\\Ruby33\\bin\\ruby.exe',
      startCommand: 'bundle exec ruby {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['GEM_HOME=%APPDATA%\\ruby_gems'],
      detectionHints: ['Gemfile', 'Gemfile.lock', '*.rb', 'config.ru'], compilerIds: [],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '5ea8cfb1-e46d-4fb2-b62c-537f1ad52d05', name: 'java-runtime', version: '1.0.0',
    displayName: 'Java Runtime', description: 'JDK 17 / 21 with Maven and Gradle',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'java', displayName: 'Java', version: '21.x',
      executablePath: '%PROGRAMFILES%\\Eclipse Adoptium\\jdk-21\\bin\\java.exe',
      startCommand: 'java -jar {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: ['JAVA_HOME=%PROGRAMFILES%\\Eclipse Adoptium\\jdk-21'],
      detectionHints: ['pom.xml', 'build.gradle', '*.java', 'gradlew'], compilerIds: ['gradle', 'maven'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'f029c1b7-ca0b-457f-8405-ab80aa4c7447', name: 'shell-runtime', version: '1.0.0',
    displayName: 'Shell Runtime', description: 'bash / PowerShell / fish',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { runtimes: [{
      id: 'shell', displayName: 'Shell', version: '1.0.0',
      executablePath: 'C:\\Program Files\\Git\\bin\\bash.exe',
      startCommand: 'bash {{entryFile}} {{entryArgs}}', stopCommand: 'SIGTERM',
      envSetup: [], detectionHints: ['*.sh', '*.ps1', '*.fish', 'Makefile'], compilerIds: ['make'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '4a445862-0893-4112-be1a-d473ba2cdbdd', name: 'exe-runtime', version: '1.0.0',
    displayName: 'EXE Runtime', description: 'Native Windows executable — PE32/PE32+',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.5.0',
    contributes: { runtimes: [{
      id: 'exe', displayName: 'Windows EXE', version: '1.0.0',
      executablePath: '{{exePath}}', startCommand: '{{exePath}} {{entryArgs}}', stopCommand: 'TerminateProcess',
      envSetup: [], detectionHints: ['*.exe', 'PE32 magic bytes 0x4D5A'],
      compilerIds: ['pkg', 'electron-builder', 'pyinstaller', 'cargo', 'go-build'],
    }] },
    permissions: { hostFs: true, network: true, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: 'exe_runner.dll',
  },
];

const COMPILER_MANIFESTS_RAW = [
  {
    id: 'd8b6a0dd-c0ac-4f68-a733-de6820ef59d5', name: 'tsc-compiler', version: '1.0.0',
    displayName: 'TypeScript Compiler', description: 'tsc — TypeScript to JavaScript',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'tsc', displayName: 'TypeScript (tsc)', buildCommand: 'npx tsc', watchCommand: 'npx tsc --watch',
      outputDir: 'dist', flags: ['--strict', '--sourceMap'], configFile: 'tsconfig.json',
      detectionHints: ['tsconfig.json', '*.ts', '*.tsx'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '9fa5720b-cff2-4d9b-8c76-d213857d8edd', name: 'esbuild-compiler', version: '1.0.0',
    displayName: 'esbuild', description: 'esbuild — extremely fast JS/TS bundler',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'esbuild', displayName: 'esbuild',
      buildCommand: 'npx esbuild {{entryFile}} --bundle --outdir=dist',
      watchCommand: 'npx esbuild {{entryFile}} --bundle --outdir=dist --watch',
      outputDir: 'dist', flags: ['--minify'], configFile: null,
      detectionHints: ['esbuild.config.js', 'esbuild.config.ts'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '147bf0a1-fc6f-477a-851c-c254802d58c5', name: 'vite-compiler', version: '1.0.0',
    displayName: 'Vite', description: 'Vite — next generation frontend tooling',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'vite', displayName: 'Vite', buildCommand: 'npx vite build', watchCommand: 'npx vite',
      outputDir: 'dist', flags: [], configFile: 'vite.config.ts',
      detectionHints: ['vite.config.ts', 'vite.config.js'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '72cca3e2-9111-4976-99fe-5fa9ce6b118c', name: 'webpack-compiler', version: '1.0.0',
    displayName: 'Webpack', description: 'Webpack 5 — module bundler',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'webpack', displayName: 'Webpack', buildCommand: 'npx webpack', watchCommand: 'npx webpack --watch',
      outputDir: 'dist', flags: ['--mode=production'], configFile: 'webpack.config.js',
      detectionHints: ['webpack.config.js', 'webpack.config.ts'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '484e7a0d-95ac-4776-a084-1f0661cec414', name: 'rollup-compiler', version: '1.0.0',
    displayName: 'Rollup', description: 'Rollup — module bundler for libraries',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'rollup', displayName: 'Rollup', buildCommand: 'npx rollup -c', watchCommand: 'npx rollup -c --watch',
      outputDir: 'dist', flags: [], configFile: 'rollup.config.js',
      detectionHints: ['rollup.config.js', 'rollup.config.ts'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '7455ad85-9c60-4b8b-8a9c-802a25f42f3b', name: 'parcel-compiler', version: '1.0.0',
    displayName: 'Parcel', description: 'Parcel — zero-config web app bundler',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'parcel', displayName: 'Parcel', buildCommand: 'npx parcel build {{entryFile}}',
      watchCommand: 'npx parcel {{entryFile}}', outputDir: 'dist', flags: [], configFile: '.parcelrc',
      detectionHints: ['.parcelrc'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '16936e19-e1cd-4e80-a532-cf5f425dd515', name: 'swc-compiler', version: '1.0.0',
    displayName: 'SWC', description: 'SWC — Rust-based super-fast JS/TS compiler',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'swc', displayName: 'SWC', buildCommand: 'npx swc src -d dist',
      watchCommand: 'npx swc src -d dist --watch', outputDir: 'dist', flags: [], configFile: '.swcrc',
      detectionHints: ['.swcrc'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '47df27c9-d6b9-4bc5-808a-955fbfd5577a', name: 'electron-builder-compiler', version: '1.0.0',
    displayName: 'electron-builder', description: 'electron-builder — package Electron apps as EXE/NSIS',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'electron-builder', displayName: 'electron-builder', buildCommand: 'npx electron-builder --win',
      watchCommand: 'npx electron-builder --win --dir', outputDir: 'release', flags: [],
      configFile: 'electron-builder.json', detectionHints: ['electron-builder.json', 'electron-builder.yml'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: true },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '683d76bb-babb-481e-804c-736a524afce4', name: 'pyinstaller-compiler', version: '1.0.0',
    displayName: 'PyInstaller', description: 'PyInstaller — package Python apps as Windows EXE',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'pyinstaller', displayName: 'PyInstaller', buildCommand: 'pyinstaller --onefile {{entryFile}}',
      watchCommand: '', outputDir: 'dist', flags: ['--noconsole'], configFile: '*.spec',
      detectionHints: ['*.spec', 'pyinstaller'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '5a66ae33-a96d-4fbe-a712-9ec7d1b03657', name: 'pkg-compiler', version: '1.0.0',
    displayName: 'pkg', description: 'pkg — package Node.js apps as Windows EXE',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'pkg', displayName: 'pkg (Node→EXE)',
      buildCommand: 'npx pkg {{entryFile}} --target win --output dist/{{name}}.exe',
      watchCommand: '', outputDir: 'dist', flags: [], configFile: null,
      detectionHints: ['pkg config in package.json'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '06a52356-0f81-4658-9fe4-a1f1702ea791', name: 'go-build-compiler', version: '1.0.0',
    displayName: 'go build', description: 'go build — compile Go programs',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'go-build', displayName: 'go build', buildCommand: 'go build -o dist/{{name}}.exe ./...',
      watchCommand: '', outputDir: 'dist', flags: ['-v'], configFile: 'go.mod',
      detectionHints: ['go.mod', 'go.sum'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'ebfe6be1-b648-4dae-af2c-4674a975b874', name: 'cargo-compiler', version: '1.0.0',
    displayName: 'Cargo', description: 'cargo build — compile Rust programs',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'cargo', displayName: 'Cargo (Rust)', buildCommand: 'cargo build --release',
      watchCommand: 'cargo watch -x run', outputDir: 'target/release', flags: [], configFile: 'Cargo.toml',
      detectionHints: ['Cargo.toml', 'Cargo.lock'],
    }] },
    permissions: { hostFs: true, network: true, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: '2b55556c-7552-438d-8e5a-fd58b0289a24', name: 'gradle-compiler', version: '1.0.0',
    displayName: 'Gradle', description: 'Gradle — JVM build tool',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'gradle', displayName: 'Gradle', buildCommand: '.\\gradlew build',
      watchCommand: '.\\gradlew build --continuous', outputDir: 'build/libs', flags: [],
      configFile: 'build.gradle', detectionHints: ['build.gradle', 'build.gradle.kts', 'gradlew'],
    }] },
    permissions: { hostFs: true, network: true, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'ed40d971-7a72-4276-b4f7-ac1a0d6b525b', name: 'maven-compiler', version: '1.0.0',
    displayName: 'Maven', description: 'mvn — Java/Maven build tool',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'maven', displayName: 'Maven (mvn)', buildCommand: 'mvn package -DskipTests',
      watchCommand: '', outputDir: 'target', flags: [], configFile: 'pom.xml',
      detectionHints: ['pom.xml'],
    }] },
    permissions: { hostFs: true, network: true, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'ffdcd4af-4a6b-4266-bdac-f14aac7ae066', name: 'make-compiler', version: '1.0.0',
    displayName: 'Make', description: 'make / nmake — universal build tool',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'make', displayName: 'Make', buildCommand: 'make', watchCommand: '', outputDir: '.', flags: [],
      configFile: 'Makefile', detectionHints: ['Makefile', 'makefile', 'GNUmakefile'],
    }] },
    permissions: { hostFs: true, network: false, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
  {
    id: 'ce2753d4-d3ba-4d00-aef3-10e5e2c9fe49', name: 'wasm-pack-compiler', version: '1.0.0',
    displayName: 'wasm-pack', description: 'wasm-pack — build Rust → WebAssembly',
    author: 'Compartment OS', license: 'MIT', cosVersion: '>=1.0.0',
    contributes: { compilers: [{
      id: 'wasm-pack', displayName: 'wasm-pack', buildCommand: 'wasm-pack build --target web',
      watchCommand: '', outputDir: 'pkg', flags: [], configFile: 'Cargo.toml',
      detectionHints: ['wasm-pack', 'wasm_bindgen'],
    }] },
    permissions: { hostFs: true, network: true, spawnProcess: true, adminRequired: false },
    entryPoint: 'index.js', uiBundlePath: null, nativeModule: null,
  },
];

const ALL_MANIFESTS_RAW = [...RUNTIME_MANIFESTS_RAW, ...COMPILER_MANIFESTS_RAW];

for (const m of ALL_MANIFESTS_RAW) {
  validateManifest(m);
}

const RUNTIME_MANIFESTS  = Object.freeze(RUNTIME_MANIFESTS_RAW.map(m => Object.freeze(m)));
const COMPILER_MANIFESTS = Object.freeze(COMPILER_MANIFESTS_RAW.map(m => Object.freeze(m)));
const ALL_BUILTIN_MANIFESTS = Object.freeze([...RUNTIME_MANIFESTS, ...COMPILER_MANIFESTS]);
const BUILTIN_MANIFEST_MAP = new Map(ALL_BUILTIN_MANIFESTS.map(m => [m.id, m]));
const BUILTIN_MANIFEST_NAME_MAP = new Map(ALL_BUILTIN_MANIFESTS.map(m => [m.name, m]));

function getBuiltInManifest(idOrName) {
  return BUILTIN_MANIFEST_MAP.get(idOrName) || BUILTIN_MANIFEST_NAME_MAP.get(idOrName) || null;
}

module.exports = {
  RUNTIME_MANIFESTS,
  COMPILER_MANIFESTS,
  ALL_BUILTIN_MANIFESTS,
  BUILTIN_MANIFEST_MAP,
  BUILTIN_MANIFEST_NAME_MAP,
  getBuiltInManifest,
};
