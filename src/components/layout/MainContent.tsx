import { useRef, useEffect, useState, lazy, Suspense, useCallback } from "react";
import { useLlmStore } from "@/stores/llmStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Copy, Check, FileCode2, MessageSquare, Cpu, Loader2, Code, Plus, Trash2, ChevronDown, Pencil, X, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";

const SyntaxHighlighter = lazy(() =>
  import("react-syntax-highlighter").then((mod) => ({
    default: mod.Prism,
  }))
);
const vscDarkPlusPromise = import("react-syntax-highlighter/dist/esm/styles/prism").then((m) => m.vscDarkPlus);
const vscDarkPlusFallback = {};

function LazyHighlight({ language, code, showLineNumbers, wrapLongLines, customStyle, lineNumberStyle }: {
  language: string; code: string; showLineNumbers?: boolean; wrapLongLines?: boolean;
  customStyle?: Record<string, unknown>; lineNumberStyle?: Record<string, unknown>;
}) {
  const [style, setStyle] = useState<Record<string, unknown>>(vscDarkPlusFallback);
  useEffect(() => { vscDarkPlusPromise.then(setStyle); }, []);
  return (
    <Suspense fallback={<pre className="text-[11px] p-3 bg-[rgb(15,15,20)] overflow-x-auto text-zinc-400">{code}</pre>}>
      <SyntaxHighlighter language={language} style={style} showLineNumbers={showLineNumbers} wrapLongLines={wrapLongLines} customStyle={customStyle} lineNumberStyle={lineNumberStyle}>
        {code}
      </SyntaxHighlighter>
    </Suspense>
  );
}

function stripExecutionPlan(text: string): string {
  return text.replace(/---EXECUTION_PLAN---[\s\S]*?---END_PLAN---/g, "").trim();
}

function extToLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    json: "json", css: "css", html: "markup", md: "markdown",
    py: "python", rs: "rust", go: "go", sql: "sql", yml: "yaml",
    yaml: "yaml", sh: "bash", bash: "bash", vue: "vue", svelte: "svelte",
  };
  return map[ext || ""] || "text";
}

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
    segments.push({ type: "file-block", path: match[1].trim(), code: match[2] });
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
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
      }}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-300 transition-all active:scale-95"
    >
      {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LanguageBadge({ lang }: { lang: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-[#12131a] text-zinc-500 border border-white/[0.06]">
      <Code size={9} className="text-zinc-600" />
      {lang}
    </span>
  );
}

function FileBlockCard({ path, code }: { path: string; code: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const lang = extToLang(path);
  return (
    <div className="rounded-xl border border-white/[0.04] bg-[#12131a]/60 overflow-hidden shadow-premium transition-all duration-200 hover:border-white/[0.08] hover:bg-[#12131a]/80">
      <div className="flex items-center justify-between px-3 py-2 bg-[#12131a]/90 border-b border-white/[0.04]">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={13} className="text-zinc-500 shrink-0" />
          <span className="text-[11px] font-mono text-zinc-300 truncate">{path}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageBadge lang={lang} />
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-1.5 py-0.5 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-[#191a24] transition-all"
          >
            {collapsed ? "Show" : "Hide"}
          </button>
          <CopyButton text={code} />
        </div>
      </div>
      {!collapsed && (
        <div className="relative">
          <LazyHighlight
            language={lang}
            code={code.replace(/\n$/, "")}
            showLineNumbers
            wrapLongLines
            customStyle={{
              margin: 0,
              padding: "12px 0",
              fontSize: "11px",
              lineHeight: "1.55",
              background: "rgb(15,15,20)",
              borderBottomLeftRadius: "0.75rem",
              borderBottomRightRadius: "0.75rem",
            }}
            lineNumberStyle={{ minWidth: "2em", paddingRight: "1em", color: "rgb(60,60,70)", userSelect: "none" }}
          />
        </div>
      )}
    </div>
  );
}

function MarkdownText({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-none text-sm text-zinc-300 leading-relaxed [&_p]:my-0 [&_p]:leading-relaxed [&_code]:text-[11px] [&_code]:bg-zinc-800/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:hidden [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-zinc-200 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-zinc-200 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-zinc-300 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_blockquote]:border-l-zinc-700 [&_blockquote]:text-zinc-400 [&_blockquote]:my-2 [&_blockquote]:text-xs [&_hr]:border-zinc-800">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            if (match) {
              return (
                <div className="my-2 rounded-lg overflow-hidden border border-zinc-800/60">
                  <div className="flex items-center justify-between px-2.5 py-1 bg-zinc-900 border-b border-zinc-800/60">
                    <LanguageBadge lang={match[1]} />
                    <CopyButton text={codeStr} />
                  </div>
                  <LazyHighlight
                    language={match[1]}
                    code={codeStr}
                    wrapLongLines
                    customStyle={{ margin: 0, padding: "10px 0", fontSize: "11px", lineHeight: "1.5", background: "rgb(15,15,20)" }}
                  />
                </div>
              );
            }
            return <code className="text-[11px] bg-zinc-800/60 px-1 py-0.5 rounded text-zinc-200" {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function UserBubble({ content, editing, onEdit, onSave, onCancel }: {
  content: string;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: (content: string) => void;
  onCancel?: () => void;
}) {
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [editing]);

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] w-full">
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave?.(editValue); } }}
            className="w-full px-4 py-2.5 rounded-2xl bg-[#12131a] border border-[#4f6ef7]/25 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-[#4f6ef7]/20 min-h-[60px]"
            rows={Math.max(2, editValue.split("\n").length)}
          />
          <div className="flex justify-end gap-1.5 mt-1.5">
            <button onClick={onCancel} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#191a24] hover:bg-[#20222e] text-[10px] text-zinc-500 hover:text-zinc-300 transition-all">
              <X size={10} /> Cancel
            </button>
            <button onClick={() => onSave?.(editValue)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#4f6ef7]/15 hover:bg-[#4f6ef7]/25 text-[10px] text-indigo-400 hover:text-indigo-300 transition-all">
              <Send size={10} /> Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-end">
      <div className="relative max-w-[80%]">
        <div className="px-4 py-2.5 rounded-2xl bg-[#4f6ef7]/8 border border-[#4f6ef7]/12 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24]"
            title="Edit message"
          >
            <Pencil size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function AssistantContent({ content }: { content: string }) {
  const clean = stripExecutionPlan(content) || content;
  const segments = parseContent(clean);
  if (segments.length === 0) {
    return <MarkdownText content={content} />;
  }
  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <MarkdownText key={i} content={seg.text!} />
        ) : (
          <FileBlockCard key={i} path={seg.path!} code={seg.code!} />
        ),
      )}
    </div>
  );
}

function StreamingIndicator({ output }: { output: string }) {
  const clean = stripExecutionPlan(output) || output;
  const segments = parseContent(clean);
  return (
    <div className="space-y-3 animate-fade-in">
      {segments.length > 0
        ? segments.map((seg, i) =>
            seg.type === "text" ? (
              <MarkdownText key={i} content={seg.text!} />
            ) : (
              <FileBlockCard key={i} path={seg.path!} code={seg.code!} />
            ),
          )
        : clean && <MarkdownText content={clean} />}
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

export default function MainContent() {
  const { conversation, isStreaming, currentStreamOutput, chats, activeChatId, loadChats, createChat, deleteChat, switchChat, sendPromptStream } = useLlmStore();
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [livePreviewOpen, setLivePreviewOpen] = useState(true);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  /* load chats when project changes */
  useEffect(() => {
    if (activeProjectId) loadChats(activeProjectId);
  }, [activeProjectId, loadChats]);

  /* close chat menu on outside click */
  useEffect(() => {
    if (!chatMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) setChatMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [chatMenuOpen]);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleCreate = useCallback(() => {
    createChat();
    setChatMenuOpen(false);
  }, [createChat]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (chats.length <= 1) return;
    deleteChat(id);
    setChatMenuOpen(false);
  }, [chats.length, deleteChat]);

  const handleSwitch = useCallback((id: string) => {
    switchChat(id);
    setChatMenuOpen(false);
  }, [switchChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, currentStreamOutput]);

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0a0b10] min-w-0">
      <div className="shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-white/[0.04] bg-[#0a0b10]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-zinc-600" />
          <span className="text-xs font-medium text-zinc-500 tracking-wide">Chat</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* ── Chat switcher ── */}
          {chats.length > 0 && (
            <div ref={chatMenuRef} className="relative">
              <button
                onClick={() => setChatMenuOpen(!chatMenuOpen)}
                disabled={isStreaming}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/[0.06] bg-[#12131a]/80 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-[#191a24] transition-all disabled:opacity-40 max-w-[140px]"
              >
                <MessageSquare size={10} className="shrink-0" />
                <span className="truncate">{activeChat?.name || "Chat"}</span>
                <ChevronDown size={10} className="shrink-0" />
              </button>
              {chatMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl bg-[#12131a] border border-white/[0.08] shadow-premium-lg z-30 py-1 max-h-60 overflow-y-auto backdrop-blur-xl">
                  {chats.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => handleSwitch(chat.id)}
                      className={`flex items-center justify-between px-3 py-2 text-[11px] cursor-pointer transition-colors ${
                        chat.id === activeChatId
                          ? "text-indigo-400 bg-[#4f6ef7]/8"
                          : "text-zinc-400 hover:bg-[#191a24]"
                      }`}
                    >
                      <span className="truncate">{chat.name}</span>
                      {chats.length > 1 && (
                        <button
                          onClick={(e) => handleDelete(e, chat.id)}
                          className="ml-2 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/8 transition-colors shrink-0"
                          title="Delete chat"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-white/[0.04] mt-1 pt-1 px-1">
                    <button
                      onClick={handleCreate}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-[#191a24] transition-colors"
                    >
                      <Plus size={11} />
                      New Chat
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {isStreaming && (
            <button
              onClick={() => setLivePreviewOpen(!livePreviewOpen)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-200 ${
                livePreviewOpen
                  ? "bg-[#12131a] border-white/[0.06] text-zinc-400 hover:text-zinc-200"
                  : "bg-[#12131a]/50 border-white/[0.03] text-zinc-600 hover:text-zinc-400"
              }`}
              title={livePreviewOpen ? "Hide live preview" : "Show live preview"}
            >
              <Code size={11} className={livePreviewOpen ? "" : "opacity-50"} />
              <span className="text-[10px] font-medium">Live</span>
            </button>
          )}
          {isStreaming && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#12131a] border border-white/[0.06]">
              <Cpu size={11} className="text-zinc-600 animate-pulse" />
              <span className="text-[10px] text-zinc-500 font-medium">Streaming</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {conversation.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-700">
            <div className="w-14 h-14 rounded-2xl bg-[#12131a] border border-white/[0.04] flex items-center justify-center mb-4">
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
                <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">You</span>
                <UserBubble
                  content={msg.content}
                  editing={editingMessageId === msg.id}
                  onEdit={isStreaming ? undefined : () => setEditingMessageId(msg.id)}
                  onSave={(content) => {
                    setEditingMessageId(null);
                    sendPromptStream([{ role: "user", content }]);
                  }}
                  onCancel={() => setEditingMessageId(null)}
                />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#12131a] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu size={12} className="text-zinc-500" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">Agent</span>
                  <AssistantContent content={msg.content} />
                </div>
              </div>
            )}
          </div>
        ))}

        {isStreaming && currentStreamOutput && livePreviewOpen && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#12131a] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
              <Cpu size={12} className="text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">Agent</span>
              <StreamingIndicator output={currentStreamOutput} />
            </div>
          </div>
        )}

        {isStreaming && !currentStreamOutput && livePreviewOpen && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#12131a] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
              <Cpu size={12} className="text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">Agent</span>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                Waiting for response...
              </div>
            </div>
          </div>
        )}

        {isStreaming && !livePreviewOpen && (
          <div className="flex items-start gap-2 opacity-60">
            <div className="w-6 h-6 rounded-lg bg-[#12131a] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
              <Cpu size={12} className="text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium">Agent</span>
              <div className="text-xs text-zinc-600 italic">Live preview hidden — <button onClick={() => setLivePreviewOpen(true)} className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2">show</button></div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
