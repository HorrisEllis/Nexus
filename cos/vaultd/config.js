/**
 * vaultd/config.js
 * COMPARTMENT OS — vaultd Configuration (spec §66)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE, flagged: spec's `cos vaultd install/uninstall` means
 * registering vaultd as a real Windows service (sc.exe / native service
 * APIs) — not reachable from this dev environment, and "real but
 * unverified" isn't honest enough here since there's no Windows to even
 * attempt it against. install/uninstall are NOT built.
 *
 * start/stop/status ARE built for real: vaultd runs as a genuine detached
 * child process (not a Windows service, but a real separate OS process
 * with its own PID, survives the parent CLI invocation exiting), tracked
 * via a PID file — the same honest substitute pattern used elsewhere in
 * this build when a platform-specific primitive isn't reachable.
 */

'use strict';

const path = require('path');
const { COS_STATE_DIR, COS_VAULT_DIR } = require('../foundation/constants.js');

const DEFAULT_VAULTD_PORT = 3750; // matches spec's stated default
const VAULTD_PID_FILE = path.join(COS_VAULT_DIR, 'vaultd.pid');
const VAULTD_LOG_FILE = path.join(COS_VAULT_DIR, 'vaultd.log');
const VAULTD_CONFIG_FILE = path.join(COS_VAULT_DIR, 'vaultd.config.json');

const DEFAULT_VAULTD_CONFIG = Object.freeze({
  enabled: false,
  storePath: null,        // null = use the real COS_VAULT_STORE_FILE
  httpEnabled: true,      // this build only implements the HTTP surface —
                           // the named-pipe surface (\\.\pipe\cos-vault) is
                           // a Windows-only primitive, not reachable here
  httpPort: DEFAULT_VAULTD_PORT,
  httpTlsEnabled: false,
  httpTlsCertPath: null,
  tpmEnabled: false,      // TPM binding already deferred — see vault/crypto.js
  autoStartWithCos: false,
  logPath: VAULTD_LOG_FILE,
  logLevel: 'info',
});

module.exports = {
  DEFAULT_VAULTD_PORT,
  VAULTD_PID_FILE,
  VAULTD_LOG_FILE,
  VAULTD_CONFIG_FILE,
  DEFAULT_VAULTD_CONFIG,
};
