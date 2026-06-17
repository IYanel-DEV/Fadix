# Fadix

**Multi-agent AI code assistant** — orchestrates a team of specialized LLM agents to understand, plan, and implement software changes directly in your project folder.

![Architect](https://img.shields.io/badge/agent-architect-violet)
![Coder](https://img.shields.io/badge/agent-coder-emerald)
![UI Specialist](https://img.shields.io/badge/agent-ui--specialist-sky)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Overview

Fadix runs a structured 3-agent pipeline inside your browser:

1. **Architect** — analyzes your request, scans the workspace, and creates an execution plan
2. **Coder** — implements backend/logic files (Python, TypeScript, Rust, Go, etc.)
3. **UI Specialist** — designs frontend files (CSS, TSX, JSX, HTML, layouts)

All file writes go through the browser's File System Access API — your code never leaves your machine. The LLM runs via NVIDIA NIM cloud API (or your own OpenAI-compatible endpoint).

---

## Features

- **Multi-agent orchestration** — structured 3-phase pipeline with role-based prompts
- **Live streaming** — token-by-token output with real-time agent status
- **Atomic file writes** — creates directories as needed, writes directly to disk
- **Workspace-aware** — agent sees your full file tree before planning changes
- **Per-project chat history** — conversations persist per workspace in localStorage
- **Web search integration** — optional Tavily API key for tasks needing current info
- **Hybrid LLM routing** — NVIDIA NIM cloud, local Ollama/LM Studio, or any OpenAI-compatible endpoint
- **Edit & resend** — revise your prompts mid-conversation
- **Premium dark theme** — polished UI with indigo accents, subtle glow effects

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ 
- An NVIDIA API key ([free tier available](https://build.nvidia.com/explore/discover)) — or any OpenAI-compatible LLM endpoint

### Setup

```bash
git clone https://github.com/IYanel-DEV/Fadix.git
cd fadix
npm install
```

### Run

```bash
npm run dev
```

This starts both:
- **Vite dev server** → `http://localhost:5173` (frontend)
- **Express proxy server** → `http://localhost:3001` (LLM orchestration)

Open `http://localhost:5173`, open a project folder, and start building.

### Build for Production

```bash
npm run build
```

Serves the static build via Vite preview:

```bash
npm run preview
```

---

## Usage

1. **Open a folder** — click "Open Folder" in the sidebar and select your project
2. **Enter a task** — describe what to build or change (e.g., "Add a dark mode toggle", "Create a REST API with Express")
3. **Watch the pipeline** — the Architect analyzes, then Coder and UI Specialist implement in parallel
4. **Files appear on disk** — every file block is written atomically; the file tree refreshes automatically

### Example Prompts

- "Create a Python script that scrapes Hacker News and saves results to a CSV"
- "Add a responsive navbar component with Tailwind CSS"
- "Build a todo app with Express backend and vanilla JS frontend"
- "Fix the error handling in server.js"

---

## Project Structure

```
fadix/
├── server.js                  # Express proxy — LLM orchestration engine
├── src/
│   ├── App.tsx                # Root layout with sidebar + main panel
│   ├── index.css              # Premium dark theme + utility classes
│   ├── main.tsx               # React entry point
│   ├── components/
│   │   ├── agents/
│   │   │   ├── AgentMonitor.tsx      # Pipeline activity log + status
│   │   │   ├── AgentStatusCard.tsx   # Per-agent status indicator
│   │   │   └── PromptInput.tsx       # Chat input with file attachments
│   │   ├── layout/
│   │   │   ├── MainContent.tsx       # Chat view, message bubbles, file blocks
│   │   │   ├── MainPanel.tsx         # Legacy chat panel
│   │   │   └── Sidebar.tsx           # File tree, project switcher
│   │   └── llm/
│   │       └── ProviderToggle.tsx    # LLM provider config panel
│   ├── lib/
│   │   ├── sound.ts           # Completion sound effects
│   │   ├── types.ts           # TypeScript type definitions
│   │   └── workspaceEngine.ts # File System Access API wrapper
│   ├── stores/
│   │   ├── llmStore.ts        # Chat sessions, streaming, agent state
│   │   └── workspaceStore.ts  # File tree, disk I/O, project registry
│   └── hooks/
│       └── useLlmStream.ts    # Stream hook for PromptInput
├── tailwind.config.js         # Custom theme tokens
├── vite.config.ts             # Vite + React + API proxy config
├── postcss.config.js          # PostCSS/Tailwind setup
└── package.json
```

---

## Configuration

### LLM Providers

Open the configuration panel (gear icon in the header):

| Provider | Endpoint | Auth |
|---|---|---|
| **NVIDIA NIM** (cloud) | `integrate.api.nvidia.com/v1` | API key (`nvapi-...`) |
| **Ollama** (local) | `http://localhost:11434/v1` | None |
| **LM Studio** (local) | `http://localhost:1234/v1` | None |
| **Custom** | any OpenAI-compatible | Bearer token |

### Per-Agent Models

Each agent (Architect, Coder, UI Specialist) can use a different model via dropdowns in the sidebar — useful for routing planning to a stronger model and generation to a faster one.

### Web Search

Provide a [Tavily](https://tavily.com/) API key to enable web search. The Architect will automatically search the web when your task references current events, libraries, or documentation.

### Shutdown

Click the red "Shutdown Server" button in settings to stop the Express proxy.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Zustand |
| Styling | Tailwind CSS, custom premium theme |
| Build | Vite 8 |
| LLM Proxy | Express.js, Server-Sent Events |
| File I/O | File System Access API |
| Sound | Web Audio API (TinySound) |

---

## License

MIT
