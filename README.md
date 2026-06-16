# Fadix

A local-first, multi-agent desktop code assistant built with Tauri 2.0, React, and Rust. Fadix runs a concurrent, role-based agent workflow on your project directory, routing LLM requests between NVIDIA NIM cloud APIs and local Ollama/LM Studio instances.

## What It Does

Fadix orchestrates four specialized AI agents to understand, plan, code, and validate changes against your codebase:

- **The Architect** — Parses your request, scans the workspace, generates an execution blueprint
- **The Coder** — Reads the blueprint, writes code blocks, performs targeted file mutations
- **The Backend Specialist** — Validates architectural endpoints, state logic, data structures
- **The UI Specialist** — Reviews layout, Tailwind tokens, component integration

All agents communicate through a shared state ledger, executing sequentially through a task pipeline with automatic remediation on failure.

## Architecture

| Layer | Technology |
|---|---|
| Desktop Runtime | Tauri 2.0 (Rust) |
| Frontend | React 19 + TypeScript + Zustand |
| Styling | Tailwind CSS + shadcn/ui |
| LLM Streaming | SSE via `reqwest` + Tauri event channel |
| File Engine | Atomic writes with backup-on-fail |
| State Machine | Tokio async orchestrator with mpsc channels |

## Features

- **Hybrid LLM Router** — Toggle between NVIDIA NIM cloud and local Ollama/LM Studio at runtime
- **Real-time Streaming** — Token-by-token LLM output via Tauri event bus
- **Atomic File Writes** — Temp file → fsync → rename with automatic rollback
- **Workspace Scanning** — Async recursive directory walker with smart ignore filters
- **Binary Detection** — Rejects non-text files before they reach agent context
- **Event-Driven UI** — Phase changes, agent status, and streaming tokens broadcast live to React

## Quick Start

### Windows

```powershell
git clone https://github.com/YOUR_USERNAME/fadix.git
cd fadix
setup.bat
```

### macOS / Linux

```bash
git clone https://github.com/YOUR_USERNAME/fadix.git
cd fadix
chmod +x setup.sh
./setup.sh
```

### Manual Setup

```bash
# Prerequisites: Git, Node.js 18+, Rust (via rustup)

npm install
npm install -D @tauri-apps/cli@latest
npm run desktop
```

## Project Structure

```
fadix/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── agents/         # Multi-agent orchestrator
│   │   ├── commands/       # Tauri command handlers
│   │   ├── llm/            # LLM provider router
│   │   ├── state/          # State ledger schemas
│   │   └── workspace/      # File engine (scan, read, write)
│   └── Cargo.toml
├── src/                    # React frontend
│   ├── lib/                # IPC bridge + types
│   ├── stores/             # Zustand state stores
│   └── hooks/              # React hooks
├── setup.bat               # Windows setup
├── setup.sh                # Unix/macOS setup
└── package.json
```

## Configuration

### LLM Providers

**NVIDIA NIM (Cloud)**
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
- Requires API key (`nvapi-...`)

**Ollama (Local)**
- Endpoint: `http://localhost:11434/v1/chat/completions`
- No authentication required

**LM Studio (Local)**
- Endpoint: `http://localhost:1234/v1/chat/completions`
- No authentication required

### Supported Models

Any model available through your chosen provider. Examples:
- NVIDIA NIM: `meta/llama-3.1-8b-instruct`, `mistralai/mistral-7b-instruct-v0.3`
- Ollama: `llama3.1`, `codellama`, `mistral`

## License

MIT
