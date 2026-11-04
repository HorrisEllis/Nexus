# NEXUS Bridge — NSSM Service Install (Windows)

NSSM (Non-Sucking Service Manager) is the most reliable way to run the NEXUS bridge as a Windows service. It handles restarts, log rotation, and runs before any user logs in.

## Install NSSM

Download from https://nssm.cc/download — put `nssm.exe` in `C:\Windows\System32\` or add to PATH.

## Install the Service

Open **PowerShell as Administrator**:

```powershell
# Install the service
nssm install NexusBridge "C:\path\to\node.exe" "C:\path\to\nexus\bridge\nexus-bridge-server.js"

# Set working directory
nssm set NexusBridge AppDirectory "C:\path\to\nexus\bridge"

# Set environment variables
nssm set NexusBridge AppEnvironmentExtra NEXUS_PORT=3747 NEXUS_HOST=127.0.0.1 DATA_DIR=C:\path\to\nexus\bridge\data

# Set display name
nssm set NexusBridge DisplayName "NEXUS Bridge Server"
nssm set NexusBridge Description "NEXUS Cognitive OS - Bridge Server (port 3747)"

# Log output
nssm set NexusBridge AppStdout "C:\path\to\nexus\bridge\data\bridge.log"
nssm set NexusBridge AppStderr "C:\path\to\nexus\bridge\data\bridge-error.log"
nssm set NexusBridge AppRotateFiles 1
nssm set NexusBridge AppRotateBytes 10485760

# Restart on crash
nssm set NexusBridge AppRestartDelay 2000

# Start type: automatic (at boot)
nssm set NexusBridge Start SERVICE_AUTO_START

# Start the service
nssm start NexusBridge
```

## Verify

```powershell
# Check status
nssm status NexusBridge

# Or check via health endpoint
curl http://127.0.0.1:3747/health
```

## Manage

```powershell
nssm start   NexusBridge
nssm stop    NexusBridge
nssm restart NexusBridge
nssm remove  NexusBridge confirm
```

## From NEXUS UI

OPTIONS → BRIDGE → SERVICE tab shows service status and install/uninstall buttons (requires node-windows or NSSM to be pre-installed).

## node-windows Alternative

If you prefer node-windows over NSSM:

```powershell
npm install -g node-windows
npm link node-windows
node service/nexus-service.js install
```

## Startup Behaviour

When installed as a service:
- Bridge starts at Windows boot (before any user logs in)
- Bridge restarts automatically on crash (2 second delay)
- Bridge survives the Electron UI window closing
- Guardian can pulse even when NEXUS UI is not open
- Logs rotate at 10MB
