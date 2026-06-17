import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MainContent from "@/components/layout/MainContent";
import AgentMonitor from "@/components/agents/AgentMonitor";
import PromptInput from "@/components/agents/PromptInput";
import ProviderToggle from "@/components/llm/ProviderToggle";
import { useLlmStore } from "@/stores/llmStore";
import { Settings, Zap, Monitor, Cpu } from "lucide-react";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activeProvider, activeModel, isStreaming, apiKey } = useLlmStore();
  const hasActiveKey = activeProvider === "nvidia" && apiKey.length > 10;

  return (
    <div className="flex h-screen bg-[#0a0b10] text-zinc-100 overflow-hidden selection:bg-indigo-500/20">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 flex items-center justify-between px-5 h-12 border-b border-white/[0.04] bg-[#0a0b10]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#12131a] border border-white/[0.06]">
              {activeProvider === "nvidia" ? (
                <Zap size={12} className="text-indigo-400" />
              ) : (
                <Monitor size={12} className="text-sky-400" />
              )}
              <span className="text-[10px] font-medium text-zinc-500 tracking-tight">
                {activeModel}
              </span>
            </div>
            {hasActiveKey && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/8 border border-indigo-500/15">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
                </span>
                <span className="text-[9px] text-indigo-400 font-medium tracking-wide">Cloud</span>
              </div>
            )}
            {isStreaming && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#12131a] border border-white/[0.06]">
                <Cpu size={11} className="text-zinc-600 animate-pulse" />
                <span className="text-[10px] text-zinc-500 font-medium">Processing</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24] transition-all duration-150 active:scale-90"
            title="API Settings"
          >
            <Settings size={15} />
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <MainContent />
            <PromptInput />
          </div>
          <AgentMonitor />
        </div>
      </div>

      <ProviderToggle
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
