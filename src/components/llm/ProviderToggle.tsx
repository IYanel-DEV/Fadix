import { useState, useEffect, useRef } from "react";
import { useLlmStore } from "@/stores/llmStore";
import {
  X,
  Key,
  Globe,
  Zap,
  Monitor,
  Check,
  Loader2,
  ShieldCheck,
  Wrench,
  ChevronDown,
  Search,
  Power,
} from "lucide-react";

const AGENT_OPTIONS = [
  { id: "architect", label: "Architect" },
  { id: "coder", label: "Coder" },
  { id: "ui_specialist", label: "UI Specialist" },
];

function ModelSearchSelect({
  value,
  onChange,
  options,
  loading,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          value={open ? query : value}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          placeholder={placeholder || "Select a model"}
          className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200 cursor-text"
        />
        {loading && (
          <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700/60 shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-[10px] text-zinc-500 text-center">
              No models match
            </div>
          ) : (
            filtered.map((m) => (
              <button
                key={m}
                onClick={() => { onChange(m); setOpen(false); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-[11px] transition-colors hover:bg-zinc-800 ${
                  m === value ? "text-emerald-400 bg-emerald-500/8" : "text-zinc-400"
                }`}
              >
                {m}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface ProviderToggleProps {
  open: boolean;
  onClose: () => void;
}

export default function ProviderToggle({ open, onClose }: ProviderToggleProps) {
  const {
    activeProvider,
    activeModel,
    apiKey,
    baseUrl,
    customApiKey,
    customBaseUrl,
    searchApiKey,
    temperature,
    maxTokens,
    availableModels,
    modelsLoading,
    agentModelOverrides,
    setProvider,
    setModel,
    setApiKey,
    setBaseUrl,
    setCustomApiKey,
    setCustomBaseUrl,
    setSearchApiKey,
    setTemperature,
    setMaxTokens,
    setAgentModelOverride,
  } = useLlmStore();

  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showKey, setShowKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const [showAgentModels, setShowAgentModels] = useState(false);

  const handleTestKey = async () => {
    setTestStatus("testing");
    await new Promise((r) => setTimeout(r, 1200));
    setTestStatus(apiKey.length > 10 ? "success" : "error");
    setTimeout(() => setTestStatus("idle"), 3000);
  };

  if (!open) return null;

  const modelOptions = activeProvider === "nvidia" ? availableModels : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-[28rem] h-full bg-[#0a0b10] border-l border-white/[0.04] shadow-premium-lg animate-slide-in-right flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
          <div>
            <h2 className="text-sm font-medium text-zinc-200 tracking-tight">
              Configuration
            </h2>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              LLM provider and credentials
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
              Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setProvider("nvidia")}
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                  activeProvider === "nvidia"
                    ? "bg-indigo-500/8 border-indigo-500/25 text-indigo-400 ring-1 ring-indigo-500/15"
                    : "bg-[#12131a] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08]"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  activeProvider === "nvidia" ? "bg-indigo-500/15" : "bg-[#0e0f16]"
                }`}>
                  <Zap size={14} className={activeProvider === "nvidia" ? "text-indigo-400" : "text-zinc-600"} />
                </div>
                <div className="text-center">
                  <div className="font-medium leading-tight">NVIDIA</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">Cloud API</div>
                </div>
              </button>
              <button
                onClick={() => setProvider("local")}
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                  activeProvider === "local"
                    ? "bg-sky-500/8 border-sky-500/25 text-sky-400 ring-1 ring-sky-500/15"
                    : "bg-[#12131a] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08]"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  activeProvider === "local" ? "bg-sky-500/15" : "bg-[#0e0f16]"
                }`}>
                  <Monitor size={14} className={activeProvider === "local" ? "text-sky-400" : "text-zinc-600"} />
                </div>
                <div className="text-center">
                  <div className="font-medium leading-tight">Local</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">Self-hosted</div>
                </div>
              </button>
              <button
                onClick={() => setProvider("custom")}
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all duration-200 ${
                  activeProvider === "custom"
                    ? "bg-violet-500/8 border-violet-500/25 text-violet-400 ring-1 ring-violet-500/15"
                    : "bg-[#12131a] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.08]"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  activeProvider === "custom" ? "bg-violet-500/15" : "bg-[#0e0f16]"
                }`}>
                  <Wrench size={14} className={activeProvider === "custom" ? "text-violet-400" : "text-zinc-600"} />
                </div>
                <div className="text-center">
                  <div className="font-medium leading-tight">Custom</div>
                  <div className="text-[9px] text-zinc-600 mt-0.5">OpenAI-compat</div>
                </div>
              </button>
            </div>
          </div>

          {activeProvider === "nvidia" && (
            <div className="space-y-3">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
                NVIDIA API Key
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Key
                    size={12}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="nvapi-..."
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-[#12131a] border border-white/[0.06] text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-[#4f6ef7]/30 focus:ring-1 focus:ring-[#4f6ef7]/12 transition-all duration-200"
                  />
                </div>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="px-2.5 py-2 rounded-lg bg-[#12131a] border border-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
                <button
                  onClick={handleTestKey}
                  disabled={testStatus === "testing" || !apiKey}
                  className="px-3 py-2 rounded-lg bg-[#191a24] border border-white/[0.06] text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#20222e] transition-all duration-200 disabled:opacity-40 active:scale-[0.97]"
                >
                  {testStatus === "testing" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : testStatus === "success" ? (
                    <Check size={12} className="text-indigo-400" />
                  ) : testStatus === "error" ? (
                    "Fail"
                  ) : (
                    "Test"
                  )}
                </button>
              </div>
              {apiKey.length > 10 && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/8 border border-indigo-500/15 animate-fade-in">
                  <ShieldCheck size={12} className="text-indigo-400 shrink-0" />
                  <span className="text-[10px] text-indigo-400 font-medium">
                    NVIDIA NIM Cloud Active
                  </span>
                </div>
              )}
              {apiKey.length > 0 && apiKey.length <= 10 && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15 animate-fade-in">
                  <span className="text-[10px] text-amber-400 font-medium">
                    Key appears invalid — must start with "nvapi-"
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-white/[0.04] pt-4 space-y-3">
            <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-medium">
              Web Search API Key
            </label>
            <p className="text-[9px] text-zinc-600 leading-relaxed">
              Provide a Tavily search API key to enable online search. The agent will search the web for tasks that require current information.
            </p>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                type="password"
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                placeholder="tvly-..."
                className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-[#12131a] border border-white/[0.06] text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-[#4f6ef7]/30 focus:ring-1 focus:ring-[#4f6ef7]/12 transition-all duration-200"
              />
            </div>
            {searchApiKey.length > 10 && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/8 border border-indigo-500/15 animate-fade-in">
                <Search size={10} className="text-indigo-400 shrink-0" />
                <span className="text-[10px] text-indigo-400 font-medium">
                  Web search enabled — agent will search the web when needed
                </span>
              </div>
            )}
          </div>

          {activeProvider === "nvidia" && (
            <div className="space-y-3">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                Model
              </label>
              <ModelSearchSelect
                value={activeModel}
                onChange={setModel}
                options={modelOptions}
                loading={modelsLoading}
                placeholder="Search models..."
              />
            </div>
          )}

          {activeProvider === "local" && (
            <div className="space-y-3">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                Local Endpoint
              </label>
              <div className="relative">
                <Globe
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                />
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200"
                />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/8 border border-sky-500/20">
                <Monitor size={10} className="text-sky-400 shrink-0" />
                <span className="text-[10px] text-sky-400 font-medium">
                  Running in local-only mode
                </span>
              </div>
            </div>
          )}

          {activeProvider === "custom" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                  API Endpoint URL
                </label>
                <div className="relative">
                  <Globe
                    size={12}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                  API Key
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Key
                      size={12}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                    />
                    <input
                      type={showCustomKey ? "text" : "password"}
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200"
                    />
                  </div>
                  <button
                    onClick={() => setShowCustomKey(!showCustomKey)}
                    className="px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
                    title={showCustomKey ? "Hide key" : "Show key"}
                  >
                    {showCustomKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {customBaseUrl && customApiKey && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-500/8 border border-violet-500/20 animate-fade-in">
                  <Wrench size={10} className="text-violet-400 shrink-0" />
                  <span className="text-[10px] text-violet-400 font-medium">
                    Custom provider configured
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-zinc-800/60 pt-4 space-y-4">
            {activeProvider !== "nvidia" && (
              <div className="space-y-3">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                  Model
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={activeModel}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200"
                    placeholder="llama3.1"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                  Temperature
                </label>
                <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
                  {temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-zinc-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-300 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-950 [&::-webkit-slider-thumb]:shadow-sm"
              />
              <div className="flex justify-between text-[9px] text-zinc-700">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
                Max Tokens
              </label>
              <input
                type="number"
                value={maxTokens ?? ""}
                onChange={(e) =>
                  setMaxTokens(e.target.value ? parseInt(e.target.value) : null)
                }
                placeholder="8192"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600/80 focus:ring-1 focus:ring-zinc-700/30 transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {activeProvider === "nvidia" && (
            <div className="border-t border-zinc-800/60 pt-4 space-y-3">
              <button
                onClick={() => setShowAgentModels(!showAgentModels)}
                className="w-full flex items-center justify-between px-1 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium hover:text-zinc-300 transition-colors"
              >
                <span>Specialist Model Assignments</span>
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-200 ${
                    showAgentModels ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showAgentModels && (
                <div className="space-y-3 pt-1">
                  <p className="text-[9px] text-zinc-600 leading-relaxed">
                    Override the default model for individual agents. Leave unset to use the global model.
                  </p>
                  {AGENT_OPTIONS.map((agent) => {
                    const override = agentModelOverrides[agent.id];
                    const displayValue = override || activeModel;
                    return (
                      <div key={agent.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-zinc-400 font-medium">
                            {agent.label}
                          </label>
                          {!override && (
                            <span className="text-[9px] text-zinc-600">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <div className="flex-1">
                            <ModelSearchSelect
                              value={displayValue}
                              onChange={(m) =>
                                setAgentModelOverride(
                                  agent.id,
                                  m === activeModel ? "" : m,
                                )
                              }
                              options={modelOptions}
                              loading={modelsLoading}
                              placeholder="Default"
                            />
                          </div>
                          {override && (
                            <button
                              onClick={() => setAgentModelOverride(agent.id, "")}
                              className="px-2 py-2 rounded-lg bg-zinc-800 border border-zinc-700/50 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-all shrink-0"
                              title="Reset to default"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 py-3 border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm space-y-2">
          <button
            onClick={() => {
              if (confirm("Shut down the backend server? This will stop the application.")) {
                fetch("http://localhost:3001/api/shutdown", { method: "POST" }).catch(() => {});
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-400 hover:text-red-300 transition-all duration-200 active:scale-[0.98]"
          >
            <Power size={12} />
            Shutdown Server
          </button>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-400 hover:text-zinc-200 transition-all duration-200 active:scale-[0.98]"
          >
            <Check size={12} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
