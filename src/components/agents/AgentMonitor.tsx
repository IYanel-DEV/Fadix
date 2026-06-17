import { useRef, useEffect, useState } from "react";
import { useLlmStore } from "@/stores/llmStore";
import AgentStatusCard from "./AgentStatusCard";
import { Cpu, Zap, Monitor, Terminal, ChevronDown, ChevronRight, Clipboard, Check } from "lucide-react";

const AGENTS = ["architect", "coder", "ui_specialist"] as const;

export default function AgentMonitor() {
  const {
    isStreaming,
    currentStreamOutput,
    streamError,
    activeProvider,
    agentStatuses,
    activityLog,
  } = useLlmStore();

  const [logCollapsed, setLogCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentStreamOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const providerIcon = activeProvider === "nvidia" ? (
    <Zap size={10} className="text-indigo-400" />
  ) : (
    <Monitor size={10} className="text-sky-400" />
  );

  return (
    <aside className="w-72 h-full bg-[#0e0f16] border-l border-white/[0.04] flex flex-col">
      <div className="shrink-0 px-3 py-3 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#12131a] border border-white/[0.06] flex items-center justify-center">
              <Cpu size={12} className="text-zinc-500" />
            </div>
            <span className="text-xs font-medium text-zinc-500 tracking-wide">Agents</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#12131a] border border-white/[0.06]">
            {providerIcon}
            <span className="text-[10px] text-zinc-500 capitalize">{activeProvider}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {AGENTS.map((agent) => (
          <AgentStatusCard
            key={agent}
            agent={agent}
            status={agentStatuses[agent]?.status ?? "Idle"}
            message={agentStatuses[agent]?.message}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-white/[0.04]">
        <button
          onClick={() => setLogCollapsed(!logCollapsed)}
          className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-[#12131a] transition-colors"
        >
          <div className="flex items-center gap-1.5">
            {logCollapsed ? <ChevronRight size={11} className="text-zinc-600" /> : <ChevronDown size={11} className="text-zinc-600" />}
            <Terminal size={11} className="text-zinc-600" />
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Activity</span>
            {activityLog.length > 0 && (
              <span className="text-[9px] text-zinc-700 font-mono ml-1">{activityLog.length}</span>
            )}
          </div>
          {isStreaming && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
              </span>
              <span className="text-[10px] text-indigo-400 font-medium">Live</span>
            </div>
          )}
        </button>

        {!logCollapsed && (
          <div className="px-3 pb-3">
            <div className="h-28 overflow-auto rounded-xl bg-[#12131a] border border-white/[0.04] p-2.5 font-mono">
              {streamError ? (
                <p className="text-[10px] text-red-400/80 leading-relaxed break-all">{streamError}</p>
              ) : activityLog.length > 0 ? (
                activityLog.map((entry) => (
                  <div key={entry.id} className="text-[10px] leading-relaxed mb-0.5">
                    <span className="text-zinc-700">{new Date(entry.timestamp).toLocaleTimeString()}</span>{" "}
                    <span className={
                      entry.level === "error" ? "text-red-400/80" :
                      entry.level === "warn" ? "text-amber-400/80" :
                      "text-zinc-600"
                    }>
                      [{entry.agent.toUpperCase()}]
                    </span>{" "}
                    <span className="text-zinc-500">{entry.message}</span>
                  </div>
                ))
              ) : currentStreamOutput ? (
                <pre className="text-[10px] text-zinc-500 whitespace-pre-wrap break-all leading-relaxed">
                  {currentStreamOutput}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-700">
                  <Terminal size={16} className="mb-1 opacity-50" />
                  <p className="text-[10px]">No activity yet</p>
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            {currentStreamOutput && (
              <button
                onClick={handleCopy}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#12131a] hover:bg-[#191a24] border border-white/[0.06] text-[10px] text-zinc-500 hover:text-zinc-300 transition-all duration-150 active:scale-[0.98]"
              >
                {copied ? (
                  <>
                    <Check size={11} className="text-indigo-400" />
                    <span className="text-indigo-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Clipboard size={11} />
                    <span>Copy Full Response</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
