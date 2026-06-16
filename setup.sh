#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo "  Fadix - Multi-Agent Desktop Code Assistant"
echo "  Unix/macOS Setup Script"
echo "============================================"
echo ""

# Check curl
echo "[1/5] Checking curl..."
if ! command -v curl &> /dev/null; then
    echo "[ERROR] curl is not installed."
    echo "Install via your package manager (apt, brew, etc.)"
    exit 1
fi
echo "[OK] curl found."

# Check Git
echo "[2/5] Checking Git..."
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git is not installed."
    echo "Install via: sudo apt install git  OR  brew install git"
    exit 1
fi
echo "[OK] Git found."

# Check Node.js
echo "[3/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Install from: https://nodejs.org/en/download"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not available."
    echo "Reinstall Node.js from: https://nodejs.org/en/download"
    exit 1
fi
echo "[OK] Node.js and npm found."

# Check Rust
echo "[4/5] Checking Rust toolchain..."
if ! command -v cargo &> /dev/null; then
    echo "[INFO] Rust not found. Installing via rustup..."
    curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    if ! command -v cargo &> /dev/null; then
        echo "[ERROR] Rust installation failed."
        echo "Install manually from: https://rustup.rs"
        exit 1
    fi
    echo "[OK] Rust installed successfully."
else
    echo "[OK] Rust found."
fi

# Ensure cargo is on PATH for this session
export PATH="$HOME/.cargo/bin:$PATH"

# Install npm dependencies
echo "[5/5] Installing npm dependencies and starting Fadix..."
npm install
npm install -D @tauri-apps/cli@latest
npm run desktop
