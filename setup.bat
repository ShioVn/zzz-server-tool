@echo off
chcp 1252 >nul
title ZZZ Server Tool Setup
setlocal enabledelayedexpansion

set "TOOL_DIR=%~dp0"
cd /d "%TOOL_DIR%"

net session >nul 2>&1
if %errorlevel% equ 0 ( set "IS_ADMIN=1" ) else ( set "IS_ADMIN=0" )

cls
echo =============================================
echo     ZZZ Server Tool - Auto Setup
echo =============================================
echo.

:: ---------- 1. Check Node.js ----------
:check_node
echo [1/3] Checking Node.js ...
where node >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
    echo     + Node.js !NODE_VER! found
    goto :check_npm
)

echo.
echo     ! Node.js not found.
echo.

if "%IS_ADMIN%"=="0" (
    echo This script needs Admin rights to install Node.js.
    echo.
    echo Options:
    echo   [O] - Open https://nodejs.org to download manually
    echo   [R] - Restart with admin rights (recommended)
    echo.
    choice /c OR /n /m "Choice [O/R]: "
    if errorlevel 2 (
        echo Restarting with admin privileges...
        powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%TOOL_DIR%\" ^&^& setup.bat' -Verb RunAs"
        exit /b 0
    ) else (
        start https://nodejs.org
        echo Install Node.js, then run setup.bat again.
        pause
        exit /b 0
    )
)

:: Admin path: download + install
echo     Downloading Node.js (LTS) ...
echo.

if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set "NODE_URL=https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-arm64.msi"
) else (
    set "NODE_URL=https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi"
)

set "INSTALLER=%TEMP%\node_install.msi"

echo     Downloading (this is ~60 MB) ...
powershell -Command "try { $wc = New-Object System.Net.WebClient; $wc.DownloadFile('%NODE_URL%', '%INSTALLER%'); Write-Host 'OK' } catch { Write-Host 'FAIL'; exit 1 }" >nul 2>&1
if not exist "%INSTALLER%" (
    echo     ! Download failed. Check internet.
    echo     Download manually: https://nodejs.org
    pause
    exit /b 1
)

echo     Installing Node.js ...
start /wait msiexec /i "%INSTALLER%" /quiet /norestart
set "INSTALL_EXIT=%errorlevel%"

if %INSTALL_EXIT% neq 0 (
    echo     ! Installation failed (code: %INSTALL_EXIT%)
    echo     Download manually: https://nodejs.org
    pause
    exit /b 1
)

set "PATH=%PROGRAMFILES%\nodejs;%APPDATA%\npm;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
    echo     + Installed. Close cmd + reopen, run setup.bat again.
    pause
    exit /b 0
)

for /f "tokens=*" %%i in ('node -v') do set "NODE_VER=%%i"
echo     + Node.js !NODE_VER! installed

del "%INSTALLER%" 2>nul

:: ---------- 2. Check npm ----------
:check_npm
echo.
echo [2/3] Checking npm ...

where npm >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%i in ('npm -v') do set "NPM_VER=%%i"
    echo     + npm v!NPM_VER! found
) else (
    echo     ! npm not found. Reinstall Node.js.
    pause
    exit /b 1
)

:: ---------- 3. npm install ----------
echo.
echo [3/3] Running npm install ...
echo.

cd /d "%TOOL_DIR%"

if not exist "package.json" (
    echo     ! package.json not found
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo.
    echo     ! npm install failed
    pause
    exit /b 1
)

echo.
echo =============================================
echo     Setup complete!
echo.
echo     Run:   npm run dev
echo =============================================
echo.

choice /c YN /n /m "Start dev server now? [Y/N]: "
if errorlevel 2 goto :eof

echo.
call npx vite dev
pause
