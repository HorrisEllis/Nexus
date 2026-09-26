@echo off
rem ============================================================================
rem  cos\testenv\setup-vm.bat - set up the COS test VM on Windows. Run it once.
rem  comp_id: nexus.cos.testenv.setup-vm-bat    (0.39.264)
rem
rem  1. installs QEMU with winget if it is not already installed
rem  2. makes the base image with cos\testenv\provision.js (all JavaScript: it
rem     downloads a Debian cloud image, boots it once to install
rem     qemu-guest-agent + Node + Python, then boots it again to verify)
rem  3. Idearium's COS run menu then offers "Run all tests in a VM"
rem
rem  Extra runtimes:   setup-vm.bat --with go,ruby,php,rust
rem  Pick Node:        setup-vm.bat --node 22
rem  Check only:       setup-vm.bat --status
rem  The image lives in %%LOCALAPPDATA%%\nexus\cos-testenv (not in the repo).
rem
rem  Speed: with "Windows Hypervisor Platform" enabled (Windows Features) QEMU
rem  uses WHPX; without it, it falls back to TCG software emulation - it still
rem  works, the first setup just takes longer (20-40 min instead of 5-10).
rem ============================================================================
setlocal
set "HERE=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [cos-testenv] Node.js is not on PATH. Install it from https://nodejs.org and run this again.
  exit /b 1
)

if /i "%~1"=="--status" (
  node "%HERE%provision.js" --status
  exit /b %errorlevel%
)

rem QEMU: PATH, then the default install folder
set "QEMU_OK="
where qemu-system-x86_64 >nul 2>nul && set "QEMU_OK=1"
if not defined QEMU_OK if exist "%ProgramFiles%\qemu\qemu-system-x86_64.exe" set "QEMU_OK=1"
if not defined QEMU_OK (
  echo [cos-testenv] QEMU is not installed. Installing it with winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [cos-testenv] winget is not available. Install QEMU from https://qemu.weilnetz.de/w64/ and run this again.
    exit /b 1
  )
  winget install --id SoftwareFreedomConservancy.QEMU -e --accept-package-agreements --accept-source-agreements
  if not exist "%ProgramFiles%\qemu\qemu-system-x86_64.exe" (
    where qemu-system-x86_64 >nul 2>nul
    if errorlevel 1 (
      echo [cos-testenv] QEMU did not install. Install it from https://qemu.weilnetz.de/w64/ and run this again.
      exit /b 1
    )
  )
)

echo [cos-testenv] Making the base image. The first boot installs packages inside the VM;
echo [cos-testenv] leave this window open until it says the test VM is ready.
node "%HERE%provision.js" %*
set "RC=%errorlevel%"
if "%RC%"=="0" (
  echo.
  echo [cos-testenv] Done. Restart Nexus if it was running, then use Run ^> "Run all tests in a VM".
) else (
  echo.
  echo [cos-testenv] Setup failed ^(exit %RC%^). The lines above say where.
)
endlocal & exit /b %RC%
