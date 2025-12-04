#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

clear
echo "========================================"
echo "  Bulwk Liquidity Agent"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Please install Node.js first:"
    echo "1. Visit: https://nodejs.org"
    echo "2. Download the LTS version (v18 or higher)"
    echo "3. Run the installer"
    echo "4. Then double-click this file again"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[OK] Node.js is installed"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    echo "This may take a minute..."
    echo ""
    npm install --production
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Failed to install dependencies"
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
    echo "[OK] Dependencies installed"
    echo ""
fi

# Build if dist folder doesn't exist
if [ ! -d "dist" ]; then
    echo "Building web interface..."
    npm run build
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Failed to build"
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
fi

echo "Starting Trading Agent..."
echo ""
echo "IMPORTANT:"
echo "  - Keep this window open for trading"
echo "  - Your browser will open automatically"
echo "  - Press Ctrl+C to stop"
echo ""
echo "========================================"
echo ""

# Start the server
npm start

echo ""
echo "Trading agent stopped."
echo ""
read -p "Press Enter to exit..."
