@echo off
setlocal enabledelayedexpansion

:: Kill any stale backend server left on port 3001 before starting
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 "') do (
    taskkill /f /pid %%a >nul 2>nul
)

echo ============================================
echo   Fadix - Multi-Agent Code Assistant
echo   Setup Script
echo ============================================
echo.

:: ============================================
:: Phase 1: Check Git
:: ============================================
echo [1/4] Checking Git...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo         Download from: https://git-scm.com/download/win
    goto :fail
)
set "GIT_VER="
for /f "tokens=*" %%g in ('call git --version 2^>nul') do set "GIT_VER=%%g"
echo [OK] %GIT_VER%
echo.

:: ============================================
:: Phase 2: Check Node.js
:: ============================================
echo [2/4] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Download from: https://nodejs.org/en/download
    goto :fail
)
set "NODE_VER="
for /f "tokens=*" %%n in ('call node -v 2^>nul') do set "NODE_VER=%%n"
echo [OK] Node.js %NODE_VER%

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not available.
    echo         Reinstall Node.js from: https://nodejs.org/en/download
    goto :fail
)
set "NPM_VER="
for /f "tokens=*" %%p in ('call npm -v 2^>nul') do set "NPM_VER=%%p"
echo [OK] npm %NPM_VER%
echo.

:: ============================================
:: Phase 3: Install npm dependencies
:: ============================================
echo [3/4] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed.
    goto :fail
)
echo [OK] Dependencies installed.
echo.

:: ============================================
:: Phase 4: Start dev server
:: ============================================
echo [4/4] Starting Fadix...
echo ============================================
call npm run dev

:: ── Cleanup: kill backend server when script exits ──
echo.
echo [CLEANUP] Shutting down backend server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 "') do (
    taskkill /f /pid %%a >nul 2>nul
)
echo [OK] Server terminated.
goto :eof

:fail
echo.
echo Setup failed. Press any key to exit.
pause >nul
exit /b 1
