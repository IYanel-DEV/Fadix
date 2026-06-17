import { useRef, useEffect } from "react";
import { useLlmStore } from "@/stores/llmStore";
import { Copy, Check, FileCode2, MessageSquare, Cpu, Loader2 } from "lucide-react";
import { useState } from "react";

interface ContentSegment {
  type: "text" | "file-block";
  path?: string;
  text?: string;
  code?: string;
}

function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /###\s+(.+?)\n```\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: "text", text });
    }
    segments.push({ type: "file-block", path: match[1].trim(), code: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) segments.push({ type: "text", text });
  }
  return segments;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all active:scale-95"
    >
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FileBlock({ path, code }: { path: string; code: string }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-zinc-800/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={13} className="text-zinc-500 shrink-0" />
          <span className="text-[11px] font-mono text-zinc-300 truncate">{path}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
          <CopyButton text={code} />
        </div>
      </div>
      {!collapsed && (
        <pre className="p-3 text-[12px] font-mono text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto bg-zinc-950/50 selection:bg-zinc-700/40">
          {code}
        </pre>
      )}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function AssistantContent({ content }: { content: string }) {
  const segments = parseContent(content);
  return (
    <div className="space-y-2.5">
      {segments.length === 0 && content && (
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{content}</p>
      )}
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{seg.text}</p>
        ) : (
          <FileBlock key={i} path={seg.path!} code={seg.code!} />
        ),
      )}
    </div>
  );
}

function StreamingIndicator({ output }: { output: string }) {
  const segments = parseContent(output);
  return (
    <div className="space-y-2.5 animate-fade-in">
      {segments.length === 0 && output && (
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{output}</p>
      )}
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">{seg.text}</p>
        ) : (
          <FileBlock key={i} path={seg.path!} code={seg.code!} />
        ),
      )}
      <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        Generating...
      </div>
    </div>
  );
}

export default function MainPanel() {
  const { conversation, isStreaming, currentStreamOutput } = useLlmStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, currentStreamOutput]);

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-950 min-w-0">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-zinc-500" />
          <span className="text-xs font-medium text-zinc-400">Agent Chat</span>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-800/60">
            <Cpu size={11} className="text-zinc-500 animate-pulse" />
            <span className="text-[10px] text-zinc-500 font-medium">Streaming</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {conversation.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800/60 flex items-center justify-center mb-4">
              <MessageSquare size={24} className="opacity-30" />
            </div>
            <p className="text-sm text-zinc-500">Start a conversation</p>
            <p className="text-[10px] mt-1.5 text-zinc-700 text-center leading-relaxed">
              Describe what you want to build<br />or change in your project
            </p>
          </div>
        )}

        {conversation.map((msg) => (
          <div key={msg.id} className="space-y-2">
            {msg.role === "user" ? (
              <div className="flex items-end gap-2 flex-col">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">You</span>
                <UserBubble content={msg.content} />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu size={12} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Agent</span>
                  <AssistantContent content={msg.content} />
                </div>
              </div>
            )}
          </div>
        ))}

        {isStreaming && currentStreamOutput && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
              <Cpu size={12} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Agent</span>
              <StreamingIndicator output={currentStreamOutput} />
            </div>
          </div>
        )}

        {isStreaming && !currentStreamOutput && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0 mt-0.5">
              <Cpu size={12} className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium">Agent</span>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                Waiting for response...
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
