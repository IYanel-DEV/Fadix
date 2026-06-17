import { useState, useRef, useCallback, useEffect } from "react";
import { useLlmStore } from "@/stores/llmStore";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Send, Square, Paperclip, X, File, Image } from "lucide-react";
import type { AttachedFile } from "@/lib/types";

let attachmentId = 0;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsText(file);
  });
}

async function fileToAttachment(file: File): Promise<AttachedFile> {
  const isImage = file.type.startsWith("image/");
  const data = isImage ? await readFileAsDataURL(file) : await readFileAsText(file);
  return {
    id: `att_${++attachmentId}`,
    name: file.name,
    type: file.type,
    size: file.size,
    data,
    preview: isImage ? data : undefined,
  };
}

const MAX_VISIBLE_ATTACHMENTS = 8;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function PromptInput() {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isStreaming,
    lastPrompt,
    editLastEnabled,
    sendPromptStream,
    abortStream,
    setEditLastEnabled,
    reasoningEffort,
    cycleReasoningEffort,
  } = useLlmStore();
  const { currentDirectory } = useWorkspace();

  useEffect(() => {
    if (editLastEnabled && lastPrompt) {
      setInput(lastPrompt);
      setEditLastEnabled(false);
      textareaRef.current?.focus();
    }
  }, [editLastEnabled, lastPrompt, setEditLastEnabled]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const pending: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) continue;
      if (attachments.length + pending.length >= MAX_VISIBLE_ATTACHMENTS) break;
      try {
        pending.push(await fileToAttachment(file));
      } catch { /* skip unreadable */ }
    }
    setAttachments((prev) => [...prev, ...pending].slice(0, MAX_VISIBLE_ATTACHMENTS));
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      next.forEach((a) => { if (a.preview?.startsWith("blob:")) URL.revokeObjectURL(a.preview); });
      return next;
    });
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (isStreaming) { e.preventDefault(); return; }
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await addFiles(imageFiles);
    }
  }, [addFiles, isStreaming]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    if (isStreaming) return;
    if (e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  }, [addFiles, isStreaming]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDropOver(false), []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isStreaming) return;
    const files = e.target.files;
    if (files && files.length > 0) await addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addFiles, isStreaming]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;

    let content = text;
    if (attachments.length > 0) {
      const parts = [content];
      for (const att of attachments) {
        if (att.preview) {
          parts.push(`\n[Attached image: ${att.name}]\n![${att.name}](${att.data})`);
        } else {
          parts.push(`\n[Attached file: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``);
        }
      }
      content = parts.join("\n");
    }

    setInput("");
    setAttachments([]);
    await sendPromptStream([{ role: "user", content }]);
  }, [input, attachments, isStreaming, sendPromptStream]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, isStreaming]);

  const disabled = !currentDirectory || isStreaming;
  const attachButtonDisabled = attachments.length >= MAX_VISIBLE_ATTACHMENTS;

  return (
    <div
      className={`shrink-0 border-t transition-colors duration-200 ${
        dropOver
          ? "border-indigo-500/40 bg-indigo-500/5"
          : "border-white/[0.04] bg-[#0a0b10]/80"
      } backdrop-blur-xl`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="max-w-3xl mx-auto p-3">
        {attachments.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#12131a] border border-white/[0.06] max-w-[200px]"
              >
                {att.preview ? (
                  <div className="w-7 h-7 rounded overflow-hidden shrink-0 bg-[#0e0f16]">
                    <img src={att.preview} alt={att.name} className="w-full h-full object-cover" />
                  </div>
                ) : att.type.startsWith("text") || !att.type ? (
                  <File size={13} className="text-zinc-500 shrink-0" />
                ) : (
                  <Image size={13} className="text-zinc-500 shrink-0" />
                )}
                <span className="text-[10px] text-zinc-400 truncate min-w-0 max-w-[100px]">{att.name}</span>
                <span className="text-[9px] text-zinc-600 whitespace-nowrap">{(att.size / 1024).toFixed(0)}KB</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="ml-0.5 w-4 h-4 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24] transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (textareaRef.current) {
                  textareaRef.current.style.height = "auto";
                  textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 320)}px`;
                }
              }}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder={
                currentDirectory
                  ? "Describe what you want to build or change..."
                  : "Open a folder first, then describe your task..."
              }
              disabled={disabled}
              rows={1}
              className="w-full resize-none rounded-xl bg-[#12131a] border border-white/[0.06] px-4 py-3 pr-10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#4f6ef7]/30 focus:ring-1 focus:ring-[#4f6ef7]/12 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed max-h-80 overflow-y-auto leading-relaxed"
            />
            {dropOver && (
              <div className="absolute inset-0 rounded-xl border-2 border-dashed border-indigo-500/30 bg-indigo-500/5 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-indigo-400 font-medium">Drop files to attach</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
            <button
              onClick={cycleReasoningEffort}
              disabled={disabled}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 ${
                reasoningEffort === "none"
                  ? "text-zinc-600 hover:text-zinc-400 hover:bg-[#191a24]"
                  : reasoningEffort === "low"
                    ? "text-amber-400/80 bg-amber-500/8 hover:bg-amber-500/15"
                    : "text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
              }`}
              title={`Thinking effort: ${reasoningEffort === "none" ? "off" : reasoningEffort}`}
            >
              <span className="text-[9px] font-bold leading-none tracking-tight">
                {reasoningEffort === "none" ? "TH" : reasoningEffort === "low" ? "Th" : "TH"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept="*/*"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachButtonDisabled || disabled}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
              title="Attach file"
            >
              <Paperclip size={14} />
            </button>

            {isStreaming ? (
              <button
                onClick={abortStream}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/8 hover:bg-red-500/15 text-red-400 hover:text-red-300 transition-all duration-200 active:scale-90"
                title="Stop generation"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={(!input.trim() && attachments.length === 0) || !currentDirectory}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#4f6ef7] hover:bg-[#5d7af8] text-white transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 shadow-[0_2px_8px_rgba(79,110,247,0.2)]"
                title="Send prompt"
              >
                <Send size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
