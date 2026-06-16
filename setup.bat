@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Fadix - Multi-Agent Desktop Code Assistant
echo   Windows Setup Script
echo ============================================
echo.

:: Check Git
echo [1/5] Checking Git...
call git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH.
    echo         Download from: https://git-scm.com/download/win
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('call git --version') do set "GIT_VER=%%i"
echo [OK] !GIT_VER!
echo.

:: Check Node.js
echo [2/5] Checking Node.js...
call node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Download from: https://nodejs.org/en/download
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('call node -v') do set "NODE_VER=%%i"
echo [OK] Node.js !NODE_VER!

call npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not available.
    echo         Reinstall Node.js from: https://nodejs.org/en/download
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('call npm -v') do set "NPM_VER=%%i"
echo [OK] npm !NPM_VER!
echo.

:: Check Rust
echo [3/5] Checking Rust toolchain...
call cargo --version >nul 2>&1
if errorlevel 1 (
    echo [INFO] Rust not found. Downloading rustup-init.exe...

    set "RUSTUP_PATH=%TEMP%\rustup-init.exe"

    call powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile '!RUSTUP_PATH!'"

    if not exist "!RUSTUP_PATH!" (
        echo [ERROR] Failed to download rustup-init.exe
        echo         Install manually from: https://rustup.rs
        pause
        exit /b 1
    )

    echo [INFO] Launching Rust installer (follow the prompts)...
    start /wait "" "!RUSTUP_PATH!" -y

    :: Refresh PATH to include .cargo\bin
    if exist "%USERPROFILE%\.cargo\bin" (
        set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
    )

    :: Verify cargo is now available
    call cargo --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Rust installation failed or cargo not in PATH.
        echo         Close this window, open a NEW terminal, and run setup.bat again.
        echo         Or install manually from: https://rustup.rs
        pause
        exit /b 1
    )
    for /f "tokens=*" %%i in ('call cargo -V') do set "CARGO_VER=%%i"
    echo [OK] !CARGO_VER!
) else (
    for /f "tokens=*" %%i in ('call cargo -V') do set "CARGO_VER=%%i"
    echo [OK] !CARGO_VER!
)
echo.

:: Install npm dependencies
echo [4/5] Installing npm dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
call npm install -D @tauri-apps/cli@latest
if errorlevel 1 (
    echo [ERROR] Tauri CLI install failed.
    pause
    exit /b 1
)
echo [OK] Dependencies installed.
echo.

:: Build and run
echo [5/5] Starting Fadix...
echo ============================================
call npm run desktop
