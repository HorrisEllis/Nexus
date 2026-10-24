@echo off
REM stop-signal-background.bat — companion to start-signal-background.bat.
REM Kills by PID from logs\signal.pid, not by image name, so it doesn't
REM take down unrelated node.exe processes on the same machine.

setlocal
cd /d "%~dp0.."

if not exist logs\signal.pid (
  echo No logs\signal.pid found — nothing to stop ^(or it wasn't started via
  echo start-signal-background.bat^).
  exit /b 1
)

set /p PID=<logs\signal.pid
taskkill /PID %PID% /F >nul 2>&1
if errorlevel 1 (
  echo Could not stop PID %PID% — it may have already exited.
) else (
  echo Stopped signaling server ^(PID %PID%^).
)
del logs\signal.pid
endlocal
