@echo off
rem cos/app/service-host/build.cmd: builds COS's own service host (CA8) with the C# compiler Windows already carries. No downloads.
rem Writes cos\app\bin\cos-svc.exe and its SHA256 beside it. Run from anywhere. (ASCII only: cmd reads this file in the OEM code page.)
setlocal
set HERE=%~dp0
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (echo the .NET Framework 4 C# compiler was not found at %CSC% & exit /b 1)
if not exist "%HERE%..\bin" mkdir "%HERE%..\bin"
"%CSC%" /nologo /optimize+ /target:exe /platform:anycpu /out:"%HERE%..\bin\cos-svc.exe" /r:System.ServiceProcess.dll /r:System.Web.Extensions.dll "%HERE%cos-svc.cs"
if errorlevel 1 exit /b 1
for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%HERE%..\bin\cos-svc.exe" SHA256') do (
  if not defined SUM set SUM=%%h
)
> "%HERE%..\bin\cos-svc.exe.sha256" echo %SUM%  cos-svc.exe
echo built %HERE%..\bin\cos-svc.exe %SUM%
