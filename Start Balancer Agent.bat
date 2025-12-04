@echo off
cls
echo ========================================
echo   Bulwk Liquidity Agent
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo 1. Visit: https://nodejs.org
    echo 2. Download the LTS version ^(v18 or higher^)
    echo 3. Run the installer
    echo 4. Then double-click this file again
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js is installed
echo.

:: Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    echo This may take a minute...
    echo.
    call npm install --production
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Failed to install dependencies
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed
    echo.
)

:: Build if dist folder doesn't exist
if not exist "dist" (
    echo Building web interface...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Failed to build
        echo.
        pause
        exit /b 1
    )
    echo.
)

echo Starting Trading Agent...
echo.
echo IMPORTANT:
echo   - Keep this window open for trading
echo   - Your browser will open automatically
echo   - Press Ctrl+C to stop
echo.
echo ========================================
echo.

:: Start the server
call npm start

echo.
echo Trading agent stopped.
echo.
pause
