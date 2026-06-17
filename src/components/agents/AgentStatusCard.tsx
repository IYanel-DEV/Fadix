import type { AgentStatus } from "@/lib/types";
import { useLlmStore } from "@/stores/llmStore";
import { Compass, Code2, Palette, ChevronDown } from "lucide-react";

interface AgentStatusCardProps {
  agent: string;
  status: AgentStatus;
  message?: string;
}

const AGENT_CONFIG: Record<
  string,
  { label: string; icon: typeof Compass; color: string; ring: string; glow: string }
> = {
  architect: {
    label: "Architect",
    icon: Compass,
    color: "text-violet-400",
    ring: "ring-violet-500/20",
    glow: "shadow-violet-500/5",
  },
  coder: {
    label: "Coder",
    icon: Code2,
    color: "text-emerald-400",
    ring: "ring-emerald-500/20",
    glow: "shadow-emerald-500/5",
  },
  ui_specialist: {
    label: "UI Specialist",
    icon: Palette,
    color: "text-sky-400",
    ring: "ring-sky-500/20",
    glow: "shadow-sky-500/5",
  },
};

function getStatusStyle(status: AgentStatus) {
  switch (status) {
    case "Prompting":
      return {
        dot: "bg-emerald-400",
        bg: "bg-emerald-500/5 border-emerald-500/15",
        text: "text-emerald-400",
        label: "Prompting",
        ringActive: true,
      };
    case "Mutating":
      return {
        dot: "bg-amber-400",
        bg: "bg-amber-500/5 border-amber-500/15",
        text: "text-amber-400",
        label: "Mutating",
        ringActive: true,
      };
    case "processing":
      return {
        dot: "bg-emerald-400",
        bg: "bg-emerald-500/5 border-emerald-500/15",
        text: "text-emerald-400",
        label: "Active",
        ringActive: true,
      };
    case "Error":
      return {
        dot: "bg-red-400",
        bg: "bg-red-500/5 border-red-500/15",
        text: "text-red-400",
        label: "Error",
        ringActive: false,
      };
    default:
      return {
        dot: "bg-zinc-600",
        bg: "bg-[#12131a] border-white/[0.04]",
        text: "text-zinc-500",
        label: "Idle",
        ringActive: false,
      };
  }
}

export default function AgentStatusCard({ agent, status, message }: AgentStatusCardProps) {
  const availableModels = useLlmStore((s) => s.availableModels);
  const agentModelOverrides = useLlmStore((s) => s.agentModelOverrides);
  const activeModel = useLlmStore((s) => s.activeModel);
  const setAgentModel = useLlmStore((s) => s.setAgentModel);

  const config = AGENT_CONFIG[agent] ?? {
    label: agent,
    icon: Compass,
    color: "text-zinc-400",
    ring: "ring-zinc-500/20",
    glow: "",
  };

  const currentModel = agentModelOverrides[agent] || "";
  const statusStyle = getStatusStyle(status);
  const Icon = config.icon;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setAgentModel(agent, val === "" ? activeModel : val);
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-500 ${statusStyle.bg} ${
        statusStyle.ringActive
          ? `ring-1 ${config.ring} shadow-lg ${config.glow} ${status === "processing" ? "animate-pulse-ring" : ""}`
          : "shadow-none"
      }`}
    >
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="relative">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-300 ${
              status === "Idle"
                ? "bg-[#0e0f16]"
                : "bg-[#12131a]"
            }`}
          >
            <Icon size={16} className={`${config.color} transition-colors duration-300`} />
          </div>
          {statusStyle.ringActive ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />
              <span className={`relative inline-flex rounded-full h-3 w-3 border-2 border-[#0e0f16] ${statusStyle.dot.split(" ")[0]}`} />
            </span>
          ) : (
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0e0f16] ${statusStyle.dot}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">
              {config.label}
            </span>
            <span className={`text-[10px] font-semibold tracking-wide ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>
          {message && (
            <p className="text-[10px] text-zinc-500 truncate mt-0.5 leading-relaxed">
              {message}
            </p>
          )}
          {!message && status === "Idle" && (
            <p className="text-[10px] text-zinc-600 mt-0.5">Awaiting task</p>
          )}
          <div className="mt-1.5 relative">
            <select
              value={currentModel}
              onChange={handleModelChange}
              className="w-full appearance-none text-[10px] bg-[#0e0f16] border border-white/[0.04] rounded-md px-2 py-1.5 text-zinc-500 cursor-pointer hover:border-white/[0.08] focus:outline-none focus:ring-1 focus:ring-[#4f6ef7]/15 transition-colors truncate"
            >
              <option value="">Default ({activeModel})</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
