@echo off
REM start-signal-background.bat — headless alternative to bridge-electron
REM for a machine that just needs to host without a GUI/tray (e.g. a
REM server closet box). Runs signal.js detached, no console window stays
REM open, logs to logs\signal.log, PID recorded so stop script is reliable
REM (doesn't just taskkill every node.exe on the box).

setlocal
cd /d "%~dp0.."

if not exist logs mkdir logs
if exist logs\signal.pid (
  echo A PID file already exists at logs\signal.pid — is it already running?
  echo Run stop-signal-background.bat first if you want to restart it.
  exit /b 1
)

start "BridgeSignal" /min cmd /c "node signal.js > logs\signal.log 2>&1"

REM give it a moment to actually spawn before we go looking for its PID
timeout /t 1 /nobreak >nul

for /f "tokens=2" %%p in ('tasklist /v /fi "windowtitle eq BridgeSignal*" /fo list ^| find "PID:"') do set PID=%%p

if "%PID%"=="" (
  echo Could not determine the PID — check logs\signal.log for a startup error.
  exit /b 1
)

echo %PID% > logs\signal.pid
echo Started signaling server in the background ^(PID %PID%^).
echo Logs: logs\signal.log
echo Stop it with: scripts\stop-signal-background.bat
endlocal
