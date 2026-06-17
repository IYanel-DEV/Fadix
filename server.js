import express from "express";
import cors from "cors";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* ── helpers ───────────────────────────────────── */

function hostForProvider(provider, baseUrl, customBaseUrl) {
  if (provider === "nvidia") return "https://integrate.api.nvidia.com/v1/chat/completions";
  if (provider === "custom") {
    const b = customBaseUrl.trim().replace(/\/+$/, "");
    if (b.endsWith("/chat/completions")) return b;
    return b.endsWith("/v1") ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
  }
  const b = baseUrl.trim().replace(/\/+$/, "");
  if (b.endsWith("/chat/completions")) return b;
  return b.endsWith("/v1") ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

function authHeader(provider, apiKey, customApiKey) {
  const key = provider === "custom" ? customApiKey : apiKey;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function* streamTokens(endpoint, headers, body, signal) {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers, ...authHeader(null, null, null) },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) throw new Error(`Provider ${resp.status}: ${await resp.text()}`);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    while (buf.includes("\n")) {
      const idx = buf.indexOf("\n");
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      if (line === "data: [DONE]") return;
      const json = line.startsWith("data: ") ? line.slice(6) : line;
      try {
        const p = JSON.parse(json);
        if (p.error) throw new Error(p.error.message ?? p.error);
        if (p.choices) for (const c of p.choices) yield c;
      } catch { /* skip malformed */ }
    }
  }
}

/* ── proxy chat (CORS-free) ────────────────────── */

app.post("/api/chat", async (req, res) => {
  const { provider, model, messages, temperature, maxTokens, apiKey, baseUrl, customApiKey, customBaseUrl } = req.body;
  const endpoint = hostForProvider(provider, baseUrl, customBaseUrl);
  const headers = authHeader(provider, apiKey, customApiKey);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const body = { model, messages, temperature, stream: true };
    if (maxTokens) body.max_tokens = maxTokens;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!resp.ok) { res.write(`event:error\ndata:${JSON.stringify({ message: `Provider ${resp.status}: ${await resp.text()}` })}\n\n`); res.end(); return; }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      while (buf.includes("\n")) {
        const idx = buf.indexOf("\n");
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        if (line === "data: [DONE]") { res.write(`event:done\ndata:{}\n\n`); res.end(); return; }
        const json = line.startsWith("data: ") ? line.slice(6) : line;
        try {
          const p = JSON.parse(json);
          if (p.error) throw new Error(p.error.message ?? p.error);
          if (p.choices) for (const c of p.choices) {
            const content = c.delta?.content ?? c.message?.content ?? "";
            if (content) res.write(`event:token\ndata:${JSON.stringify({ token: content })}\n\n`);
            if (c.finish_reason) { res.write(`event:done\ndata:{}\n\n`); res.end(); return; }
          }
        } catch { /* skip */ }
      }
    }
    res.write(`event:done\ndata:{}\n\n`);
    res.end();
  } catch (e) {
    res.write(`event:error\ndata:${JSON.stringify({ message: e.message })}\n\n`);
    res.end();
  }
});

/* ── 3-agent orchestration workflow ─────────────── */

const FALLBACK_AGENT_MODEL = "meta/llama-3.3-70b-instruct";

/* route files to the correct specialist based on path/description */
function determineAgent(file, description) {
  const lowerPath = (file || "").toLowerCase();
  const lowerDesc = (description || "").toLowerCase();

  const uiPatterns = [/\.(css|scss|less|sass)$/, /\.(tsx|jsx)$/, /components?\//, /layouts?\//, /pages?\//, /styles?\//, /theme/, /tailwind/, /\.vue$/, /\.svelte$/, /\.html$/];

  for (const p of uiPatterns) { if (p.test(lowerPath) || p.test(lowerDesc)) return "ui_specialist"; }
  return "coder";
}

/* generate a fallback plan from the user's raw prompt when architect fails or hallucinates.
   Supports backtick-quoted filenames AND bare filenames (e.g. "hello.txt", "create a file called index.html"). */
function generateFallbackPlan(task) {
  const files = [];
  const seen = new Set();

  /* Tier 1: backtick-quoted filenames */
  const backtickRe = /`([^`]+(?:\.[a-z]+)+)`/g;
  let m;
  while ((m = backtickRe.exec(task)) !== null) {
    const file = m[1].trim();
    if (!seen.has(file)) { seen.add(file); files.push(file); }
  }

  /* Tier 2: bare filenames from natural language patterns like
     "create a file called X", "write X", "make X", or any word ending with an extension */
  if (files.length === 0) {
    const bareRe = /(?:create|make|write|generate|add|new)\s+(?:a\s+)?(?:text\s+)?(?:file\s+)?(?:called|named)\s+['"]?(\w[\w.\-]*\.\w{1,6})['"]?/gi;
    while ((m = bareRe.exec(task)) !== null) {
      const file = m[1].trim();
      if (!seen.has(file)) { seen.add(file); files.push(file); }
    }
  }

  /* Tier 3: any standalone filename with an extension (fallback for very short prompts like "hello.txt") */
  if (files.length === 0) {
    const anyFileRe = /\b(\w[\w.\-]*\.\w{1,6})\b/g;
    while ((m = anyFileRe.exec(task)) !== null) {
      /* skip common false positives like "create.md" or "file.txt" descriptions */
      const file = m[1].trim().toLowerCase();
      const ignored = new Set(["create.md", "file.txt", "readme.md", "index.md", "output.md"]);
      if (!seen.has(file) && !ignored.has(file)) { seen.add(file); files.push(m[1].trim()); }
    }
  }

  if (files.length === 0) {
    files.push({ file: "output.md", type: "create", description: task.slice(0, 120), agent: "coder" });
  }
  return files.map((file) => ({
    file,
    type: "create",
    description: "Generated from user request",
    agent: determineAgent(file, "") === "ui_specialist" ? "ui_specialist" : "coder",
  }));
}

/* extract file contents from conversation history (same ### file\n```\ncontent\n``` format as fullOutput).
   Used to pass existing file content to specialists when type is "modify". */
function extractPreviousFileContents(convHistory) {
  const map = {};
  const re = /###\s+(.+?)\n```\n?([\s\S]*?)```/g;
  for (const text of convHistory) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const path = m[1].trim();
      const content = m[2].trim();
      if (path && content) map[path] = content;
    }
  }
  return map;
}

/* call NVIDIA NIM with automatic fallback retry.
   When streamTokens=false, token events are suppressed (used for parallel Phase 2
   so concurrent specialist streams don't garble the chat output).
   If the stream completes with zero content tokens (some models return 200 OK but
   produce no delta content), the function retries with the fallback model instead
   of silently returning empty string. */
async function callNvidiaStream(res, sendEvent, apiKey, primaryModel, system, messages, agent, streamTokens = true, reasoningEffort) {
  const endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
  const modelsToTry = primaryModel && primaryModel !== "undefined" ? [primaryModel, FALLBACK_AGENT_MODEL] : [FALLBACK_AGENT_MODEL];
  let lastError;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const model = modelsToTry[attempt];
    if (attempt > 0) {
      sendEvent("log", { agent, level: "warn", message: `Retrying with fallback model: ${model}` });
    }

    const body = { model, messages: [{ role: "system", content: system }, ...messages], temperature: 0.3, stream: true };
    if (reasoningEffort && reasoningEffort !== "none") body.reasoning_effort = reasoningEffort;

    let resp;
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastError = e;
      continue;
    }
    if (!resp.ok) {
      lastError = new Error(`NVIDIA ${resp.status}: ${await resp.text()}`);
      continue;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "", streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) { streamDone = true; break; }
      buf += dec.decode(value, { stream: true });
      while (buf.includes("\n")) {
        const idx = buf.indexOf("\n");
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        if (line === "data: [DONE]") { streamDone = true; break; }
        const json = line.startsWith("data: ") ? line.slice(6) : line;
        try {
          const p = JSON.parse(json);
          if (p.error) { lastError = new Error(p.error.message); streamDone = true; break; }
          if (p.choices) for (const c of p.choices) {
            const t = c.delta?.content ?? "";
            if (t) { full += t; if (streamTokens) sendEvent("token", { token: t }); }
            if (c.finish_reason) { streamDone = true; break; }
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    /* if the stream produced zero content characters, treat it as a failure and
       retry with the fallback model — prevents silent empty-file generation */
    if (full.trim().length > 0) return full;
    lastError = new Error(`Model ${model} returned empty response`);
    sendEvent("log", { agent, level: "warn", message: `Model ${model} returned empty content — retrying with fallback` });
  }

  /* all models returned empty — return empty string so the file is created as empty */
  sendEvent("log", { agent, level: "warn", message: `All models returned empty content — creating empty file` });
  return "";
}

app.post("/api/agent-workflow", async (req, res) => {
  /* ── destructure all request fields including per-agent model selectors and conversation history ── */
  const { task, apiKey, model, temperature, maxTokens, agentModels, isEmptyCanvas, existingFiles, architectModel, coderModel, uiModel, conversation, reasoningEffort } = req.body;

  /* GUARANTEED MODEL FALLBACK: if a dropdown value is empty string, whitespace, null,
     or undefined, DO NOT pass it to the API. Fall back to a hard-coded operational model. */
  const GUARANTEED_MODEL = "meta/llama-3.3-70b-instruct";

  const resolveModel = (candidate) => {
    if (!candidate || typeof candidate !== "string" || candidate.trim() === "") return null;
    return candidate.trim();
  };

  /* per-agent model resolution with guaranteed fallback:
     1. explicit field from sidebar dropdowns (resolveModel filters empties)
     2. agentModels override from store
     3. GUARANTEED_MODEL hard fallback so callNvidiaStream never receives undefined/null */
  const getModel = (agent) => {
    if (agent === "architect") return resolveModel(architectModel) || (agentModels && resolveModel(agentModels.architect)) || GUARANTEED_MODEL;
    if (agent === "coder") return resolveModel(coderModel) || (agentModels && resolveModel(agentModels.coder)) || GUARANTEED_MODEL;
    if (agent === "ui_specialist") return resolveModel(uiModel) || (agentModels && resolveModel(agentModels.ui_specialist)) || GUARANTEED_MODEL;
    return model || GUARANTEED_MODEL;
  };

  /* DEFENSIVE AGENT NORMALISER: maps any possible agent string from the architect
     into exactly "coder" or "ui_specialist". Unknown agents fall through to
     path-based determineAgent(). */
  const normaliseAgent = (rawAgent, file, description) => {
    const a = String(rawAgent || "").trim().toLowerCase();
    if (a === "coder") return "coder";
    if (a === "ui_specialist" || a === "ui") return "ui_specialist";
    if (a === "backend" || a === "back-end" || a === "backend developer") return "coder";
    if (a === "frontend" || a === "front-end" || a === "frontend designer" || a === "designer") return "ui_specialist";
    return determineAgent(file, description);
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event, data) => {
    try { res.write(`event:${event}\ndata:${JSON.stringify(data)}\n\n`); } catch {}
  };

  let aborted = false;
  req.on("close", () => { aborted = true; });

  /* ── INTENT GATEKEEPER — bypass pipeline for conversational greetings ── */
  const normalizedTask = (task || "").trim().toLowerCase();
  const greetingPatterns = [
    /^(hi|hello|hey|sup|yo|howdy)[\s!.]*$/i,
    /^what are you/i,
    /^who are you/i,
    /^what can you do/i,
    /^how do you work/i,
  ];
  const isGreeting = greetingPatterns.some((p) => p.test(normalizedTask));

  if (isGreeting) {
    sendEvent("status", { agent: "architect", status: "processing", message: "Analyzing intent..." });
    sendEvent("log", { agent: "architect", level: "info", message: "Conversational greeting detected — bypassing pipeline." });
    const response = "Hello! I'm the Fadix multi-agent orchestration engine. I can take your development task and automatically generate files, process them through Coder and UI Specialist agents, and write the results directly to your disk. Give me a concrete development task (like 'Create a React counter component' or 'Build a todo app with Express') and I'll orchestrate the full pipeline for you.";
    const words = response.split(" ");
    for (const word of words) {
      if (aborted) break;
      sendEvent("token", { token: word + " " });
      await new Promise((r) => setTimeout(r, 15));
    }
    sendEvent("status", { agent: "architect", status: "Idle", message: "Awaiting task" });
    sendEvent("done", { output: response });
    res.end();
    return;
  }

  try {
    sendEvent("log", { agent: "system", level: "info", message: "Initializing 3-agent orchestration pipeline..." });

    /* ── Phase 0: Web Search (if API key provided and task seems to need it) ── */
    let webSearchResults = "";
    const hasSearchKey = req.body.searchApiKey && typeof req.body.searchApiKey === "string" && req.body.searchApiKey.startsWith("tvly-");

    if (hasSearchKey && needsWebSearch(task)) {
      sendEvent("log", { agent: "system", level: "info", message: "Phase 0: Web search — task appears to need current information..." });
      sendEvent("status", { agent: "architect", status: "processing", message: "Searching the web..." });

      try {
        const searchResp = await fetch("http://localhost:3001/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: task, apiKey: req.body.searchApiKey }),
        });

        if (searchResp.ok) {
          const searchData = await searchResp.json();
          if (searchData.answer || (searchData.results && searchData.results.length > 0)) {
            webSearchResults = "\n\nWeb search results:\n";
            if (searchData.answer) {
              webSearchResults += `Summary: ${searchData.answer}\n\n`;
            }
            if (searchData.results) {
              webSearchResults += "Sources:\n";
              for (const r of searchData.results.slice(0, 5)) {
                webSearchResults += `- [${r.title}](${r.url}): ${r.content}\n`;
              }
            }
            sendEvent("log", { agent: "system", level: "info", message: `Web search returned ${searchData.results?.length || 0} result(s)` });
          }
        } else {
          sendEvent("log", { agent: "system", level: "warn", message: "Web search returned error — proceeding without search results" });
        }
      } catch (e) {
        sendEvent("log", { agent: "system", level: "warn", message: `Web search failed: ${e.message} — proceeding without search results` });
      }
    }

    /* ── Phase 1: Architect ──────────────────── */
    sendEvent("log", { agent: "architect", level: "info", message: "Phase 1: Architect — analyzing task requirements and workspace structure..." });
    sendEvent("status", { agent: "architect", status: "Prompting", message: "Analyzing task requirements..." });

    const existingFilesList = Array.isArray(existingFiles) ? existingFiles : [];
    const fileContext = existingFilesList.length > 0
      ? `\nExisting files in workspace:\n${existingFilesList.map((f) => `  - ${f}`).join("\n")}`
      : "\n  (no files — blank canvas)";

    /* build conversation history context so the architect knows what was previously generated */
    const convHistory = Array.isArray(conversation) ? conversation : [];
    const convContext = convHistory.length > 0
      ? `\nPrevious output from last conversation:\n${convHistory[convHistory.length - 1]}`
      : "";

    /* NEUTRAL ARCHITECT PROMPT — no framework, no boilerplate, no scaffold defaults */
    const architectSystem = `Analyze the user's prompt exactly. If the user asks for a single empty text file or a specific folder configuration, output an execution plan containing ONLY that item. Do not inject unrequested frameworks or boilerplates.

You MUST append a valid execution plan block at the very end of your response using these exact markers:

---EXECUTION_PLAN---
[{"file": "filename.txt", "type": "create", "description": "what this file does", "agent": "coder"}]
---END_PLAN---

Strict validation:
- Plan MUST be the very last thing. No text after ---END_PLAN---.
- Each entry MUST contain: "file", "type" ("create"|"modify"|"delete"), "description", "agent" ("coder"|"ui_specialist").
- Workspace is empty: output ONLY the files the user explicitly asked for. No extra scaffold.
- Workspace has files: output only files needing CREATE or MODIFY.
- If a file already exists in the workspace or was generated in the previous conversation, set type to "modify" — do NOT recreate it.
- Do NOT nest files inside subdirectories. Use flat filenames only (e.g. "main.py" not "projectname/main.py").
- Use agent "ui_specialist" for CSS, TSX, JSX, components, layouts, pages, styles, theme, HTML, or UI files. Otherwise "coder".
- 🔒 PERMISSION BOUNDARY: You can ONLY create/modify files within the current workspace directory. If the user asks you to write files outside this project (e.g. absolute paths like /etc/, C:\, or parent references like ../), you MUST refuse. Do NOT output an EXECUTION_PLAN block — instead respond with a polite message that you cannot write files outside the current project.

Existing files:${fileContext}${convContext}${webSearchResults}
 
User request: ${task}

State your intent in 1-2 sentences, then the EXECUTION_PLAN block.`;

    /* Architect wrapped in try/catch so crash does NOT abort the pipeline */
    let architectOutput;
    try {
      architectOutput = await callNvidiaStream(res, sendEvent, apiKey, getModel("architect"), architectSystem, [], "architect", true, reasoningEffort);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendEvent("log", { agent: "architect", level: "error", message: `Architect call failed: ${msg}. Using fallback plan.` });
      architectOutput = "";
    }

    sendEvent("log", { agent: "architect", level: "info", message: "Architect finished. Parsing execution plan..." });

    /* ── PERMISSION REFUSAL DETECTION ──────────── */
    /* If the architect politely refused (no EXECUTION_PLAN), check for
       refusal keywords and pass the message through instead of falling
       back to a default plan. */
    const architectLower = (architectOutput || "").toLowerCase();
    const hasPlanMarker = /---EXECUTION_PLAN---/.test(architectOutput || "");
    const isRefusal = !hasPlanMarker && (
      /don't have permission/i.test(architectOutput || "") ||
      /cannot write outside/i.test(architectOutput || "") ||
      /can't (write|create|modify) (outside|files outside)/i.test(architectOutput || "") ||
      /not (able|allowed) to (write|create|modify)/i.test(architectOutput || "") ||
      /permission (denied|refused)/i.test(architectOutput || "")
    );
    if (isRefusal) {
      sendEvent("log", { agent: "architect", level: "info", message: "Architect refused request — passing response to user." });
      sendEvent("status", { agent: "architect", status: "Idle", message: "Refused" });
      sendEvent("done", { output: architectOutput });
      res.end();
      return;
    }

    /* ── 3-tier plan fallback ────────────────── */

    /* Tier 1: exact marker regex */
    const PLAN_RE = /---EXECUTION_PLAN---\s*([\s\S]*?)---END_PLAN---/;
    let cleanArchitectText = architectOutput || "";
    let plan;

    const planMatch = (architectOutput || "").match(PLAN_RE);
    if (planMatch) {
      try {
        plan = JSON.parse(planMatch[1].trim());
        cleanArchitectText = architectOutput.replace(PLAN_RE, "").trim();
        sendEvent("log", { agent: "system", level: "info", message: `Plan extracted: ${plan.length} file(s)` });
      } catch { plan = null; }
    }

    /* Tier 2: bracket fallback for truncated output */
    if (!plan) {
      const lastBracket = (architectOutput || "").lastIndexOf("]");
      if (lastBracket !== -1) {
        const pre = architectOutput.slice(0, lastBracket + 1);
        const arrayStart = pre.indexOf("[");
        if (arrayStart !== -1) {
          try {
            plan = JSON.parse(pre.slice(arrayStart));
            cleanArchitectText = architectOutput.slice(0, arrayStart).trim();
            sendEvent("log", { agent: "system", level: "warn", message: `Bracket fallback: ${plan.length} file(s)` });
          } catch { plan = null; }
        }
      }
    }

    /* TIER 3: ABSOLUTE FAIL-SAFE — architect plan missing or invalid */
    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      console.log("[FAIL-SAFE] Architect plan missing or invalid. Injecting fallback execution task.");
      sendEvent("log", { agent: "system", level: "warn", message: "[FAIL-SAFE] Architect plan missing or invalid. Auto-routing prompt to execution phase." });
      plan = [{
        file: "index.html",
        type: "create",
        description: "Core structural implementation based on user prompt",
        agent: "coder",
      }];
      cleanArchitectText = (architectOutput || "").slice(0, 200).trim();
      sendEvent("log", { agent: "system", level: "info", message: `[FAIL-SAFE] Fallback plan injected: 1 file(s) — auto-routing to Coder agent.` });
    }

    /* normalise every entry: filter out missing-file entries, map agent defensively */
    plan = plan.filter((e) => e && typeof e.file === "string" && e.file.trim().length > 0).map((e) => ({
      file: e.file.trim(),
      type: (typeof e.type === "string" && ["create", "modify", "delete"].includes(e.type.trim())) ? e.type.trim() : "create",
      description: (typeof e.description === "string" ? e.description : "").trim() || "Auto-generated",
      agent: normaliseAgent(e.agent, e.file, e.description),
    }));

    /* if EVERY entry was filtered, inject one final emergency fallback */
    if (plan.length === 0) {
      console.log("[FADIX-DEBUG] Plan empty after normalisation — injecting emergency output.md fallback");
      plan = [{ file: "output.md", type: "create", description: "Emergency fallback from empty plan", agent: "coder" }];
    }

    /* ── PATH PERMISSION GUARD ──────────────────────── */
    /* Reject any plan entry whose file path escapes the workspace directory.
       This blocks parent-directory traversal (..) and absolute paths. */
    const OUTSIDE_RE = /(?:^|\/)\.\.(?:\/|$)|^[A-Za-z]:[\\\/]|^\//;
    const outOfBounds = plan.filter((e) => OUTSIDE_RE.test(e.file));
    if (outOfBounds.length > 0) {
      const blocked = outOfBounds.map((e) => e.file).join(", ");
      sendEvent("log", { agent: "system", level: "error", message: `Permission denied: cannot write outside project — ${blocked}` });
      sendEvent("error", { message: `I don't have permission to write files outside the current project. Blocked: ${blocked}` });
      res.end();
      return;
    }

    sendEvent("log", { agent: "system", level: "info", message: `Executing ${plan.length} file change(s)` });
    sendEvent("plan", { files: plan });
    sendEvent("status", { agent: "architect", status: "Idle", message: `${plan.length} file(s)` });

    let fullOutput = cleanArchitectText ? cleanArchitectText + "\n\n" : "";
    let accumulatedContext = task;

    /* ── Phase 2: Execute specialists IN PARALLEL ── */

    const specialistPrompts = {
      coder: {
        system: `You are a Software Engineer. Implement the requested file exactly as described. Output ONLY the file content — no markdown fences, no explanations. Use the language and framework appropriate to the user's task (if any).`,
        label: "Coder",
      },
      ui_specialist: {
        system: `You are a Frontend Designer. Implement the requested UI file exactly as described. Output ONLY the file content — no markdown fences, no explanations. Use the language and framework appropriate to the user's task (if any).`,
        label: "UI Specialist",
      },
    };

    sendEvent("log", { agent: "system", level: "info", message: `Phase 2: Processing ${plan.length} file(s) in parallel across specialists...` });

    /* extract previous file contents from conversation history for modify entries */
    const previousContents = extractPreviousFileContents(convHistory);

    /* fire all specialist calls concurrently — each maps to a single file entry.
       Token events are suppressed (streamTokens=false) to prevent garbled interleaving
       in the chat output. Status/log events are still emitted per-file. */
    const results = await Promise.allSettled(plan.map(async (entry, index) => {
      /* ── file guard ── */
      if (!entry.file || typeof entry.file !== "string" || entry.file.trim().length === 0) {
        entry.file = "index.html";
      }

      const agentKey = normaliseAgent(entry.agent, entry.file, entry.description);
      const spec = specialistPrompts[agentKey] || specialistPrompts.coder;
      const actionLabel = entry.type === "create" ? "CREATING" : "MODIFYING";
      const modelForThisFile = getModel(agentKey);

      console.log(`[PARALLEL] entry: file="${entry.file}" agent="${agentKey}" model="${modelForThisFile}"`);
      sendEvent("log", { agent: agentKey, level: "info", message: `${actionLabel} ${entry.file} — ${entry.description}` });
      sendEvent("status", { agent: agentKey, status: "processing", message: `${actionLabel.toLowerCase()} ${entry.file}...` });

      if (entry.type === "delete") {
        sendEvent("log", { agent: "system", level: "info", message: `[DELETE] ${entry.file} — skipping (frontend handles deletion)` });
        return { index, file: entry.file, content: "", agentKey, ok: true, skipped: true };
      }

      /* for modify entries, pass the existing file content to the specialist */
      const existingContent = entry.type === "modify" && previousContents[entry.file]
        ? `\n\nExisting content of ${entry.file} to modify:\n\`\`\`\n${previousContents[entry.file]}\n\`\`\``
        : "";
      const specialistSystem = `${spec.system}\n\nTask: ${entry.description}\nFile: ${entry.file}\nType: ${entry.type}${existingContent}\n\nOriginal task context:\n${accumulatedContext}`;

      const specialistOutput = await callNvidiaStream(
        res, sendEvent, apiKey, modelForThisFile,
        specialistSystem,
        [{ role: "user", content: `Generate the complete content for ${entry.file}. ${entry.description}` }],
        agentKey,
        false,
        reasoningEffort
      );

      const trimmed = specialistOutput.trim();
      if (!trimmed) {
        console.warn(`[PARALLEL] WARNING: Specialist returned EMPTY content for ${entry.file} — no output to write`);
        sendEvent("log", { agent: agentKey, level: "warn", message: `[EMPTY] ${entry.file} — specialist returned no content. Check model availability or API key.` });
      } else {
        console.log(`[PARALLEL] Specialist returned ${trimmed.length} chars for ${entry.file}`);
        sendEvent("log", { agent: agentKey, level: "info", message: `Specialist returned ${trimmed.length} chars for ${entry.file}` });
      }
      sendEvent("status", { agent: agentKey, status: "Idle", message: `${entry.file} ready` });

      return { index, file: entry.file, content: trimmed, agentKey, ok: true, skipped: false };
    }));

    /* build fullOutput in original file order, incorporating any partial results */
    for (const settled of results) {
      if (settled.status === "fulfilled") {
        const r = settled.value;
        if (r.ok && !r.skipped && r.content !== undefined) {
          fullOutput += `\n\n### ${r.file}\n\`\`\`\n${r.content}\n\`\`\`\n`;
          accumulatedContext += `\n--- ${r.file} ---\n${r.content}\n`;
          console.log(`[PARALLEL] Appended ${r.file} to fullOutput (total: ${fullOutput.length})`);
        }
      } else {
        const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        console.error("[PARALLEL] Unexpected promise rejection:", reason);
        sendEvent("log", { agent: "system", level: "error", message: `[PARALLEL] Unexpected rejection: ${reason}` });
      }
    }

    /* ── Phase 3: Summary ── */
    sendEvent("log", { agent: "system", level: "info", message: `Phase 2 complete — ${plan.length} file(s) processed` });
    /* reset all agent statuses to Idle */
    const allAgents = [...new Set(plan.map((e) => normaliseAgent(e.agent, e.file, e.description)))];
    for (const a of allAgents) sendEvent("status", { agent: a, status: "Idle", message: "All files generated" });
    sendEvent("done", { output: fullOutput || "Task complete." });
    res.end();
  } catch (e) {
    const crashMsg = e instanceof Error ? `${e.message}\n${e.stack || "(no stack)"}` : String(e);
    console.error("[FADIX-DEBUG] UNCAUGHT PIPELINE CRASH:", crashMsg);
    sendEvent("error", { message: crashMsg });
    res.end();
  }
});

/* ── dynamic model listing ─────────────────────── */

const FALLBACK_MODELS = [
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-405b-instruct",
  "nvidia/nemotron-4-340b-instruct",
];

function isChatModel(id) {
  const lower = id.toLowerCase();
  /* explicitly block known non-chat model types */
  if (lower.includes("embed") || lower.includes("codegen") || lower.includes("classify") || lower.includes("rerank")) return false;
  if (lower.includes("stable-diffusion") || lower.includes("controlnet") || lower.includes("esrgan") || lower.includes("edgen")) return false;
  /* everything else from the NVIDIA NIM chat completions catalog is fair game */
  return true;
}

app.get("/api/models", async (req, res) => {
  const apiKey = req.query.apiKey;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("nvapi-")) {
    return res.json({ models: FALLBACK_MODELS, source: "fallback" });
  }

  try {
    const resp = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      console.warn(`[fadix-server] NVIDIA models API returned ${resp.status}, using fallback`);
      return res.json({ models: FALLBACK_MODELS, source: "fallback" });
    }

    const body = await resp.json();
    const all = (body.data || [])
      .map((m) => m.id)
      .filter(isChatModel)
      .sort((a, b) => a.localeCompare(b));

    if (all.length === 0) {
      return res.json({ models: FALLBACK_MODELS, source: "fallback" });
    }

    res.json({ models: all, source: "api" });
  } catch (e) {
    console.warn(`[fadix-server] Failed to fetch NVIDIA models: ${e.message}`);
    res.json({ models: FALLBACK_MODELS, source: "fallback" });
  }
});

/* ── web search endpoint ──────────────────────────── */

app.post("/api/search", async (req, res) => {
  const { query, apiKey } = req.body;
  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "Query is required" });
  }
  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("tvly-")) {
    return res.status(400).json({ error: "Valid Tavily API key (tvly-...) is required" });
  }

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.trim(),
        search_depth: "basic",
        include_answer: true,
        include_images: false,
        max_results: 5,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({ error: `Tavily ${resp.status}: ${errText}` });
    }

    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── check if a task likely needs web search ─────── */
function needsWebSearch(task) {
  const lower = (task || "").toLowerCase();
  const patterns = [
    /\b(search|find|look\s*up|google|research)\b/i,
    /\b(what\s+is|what\s+are|who\s+is|who\s+are)\b/i,
    /\b(latest|current|recent|news|update|weather|price|stock)\b/i,
    /\b(how\s+to|tutorial|guide|documentation|docs)\b/i,
    /\b(compare|vs\.?|versus|difference\s+between)\b/i,
    /\b(download|install|setup|configure)\b.*\b(windows|linux|mac|npm|pip|docker)\b/i,
    /https?:\/\/[^\s]+/i,
  ];
  return patterns.some((p) => p.test(lower));
}

/* ── shutdown endpoint ──────────────────────────── */

app.post("/api/shutdown", (req, res) => {
  console.log("[fadix-server] Shutdown requested — terminating...");
  res.json({ ok: true, message: "Server shutting down" });
  /* give the response time to flush, then exit */
  setTimeout(() => process.exit(0), 200);
});

app.get("/api/shutdown", (req, res) => {
  res.json({ ok: true, message: "Send POST to shut down the server" });
});

/* ── graceful exit on SIGINT/SIGTERM ──────────── */

function cleanup() {
  console.log("\n[fadix-server] Cleaning up...");
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

/* ── start ─────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`[fadix-server] Proxy running on http://localhost:${PORT}`);
});
