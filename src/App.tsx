import { useWorkspace } from "@/hooks/useWorkspace";
import { useLlmStore } from "@/stores/llmStore";

export default function App() {
  const {
    currentDirectory,
    fileTree,
    selectedFile,
    fileContentBuffer,
    isTreeLoading,
    isFileLoading,
    isSaving,
    error: wsError,
    setDirectory,
    loadFile,
    saveCurrentChanges,
  } = useWorkspace();

  const {
    activeProvider,
    activeModel,
    isStreaming,
    currentStreamOutput,
    streamError,
    setProvider,
    setModel,
  } = useLlmStore();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="w-64 border-r border-zinc-800 p-4 flex flex-col gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Workspace</label>
          <input
            type="text"
            value={currentDirectory ?? ""}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="/path/to/project"
            className="w-full px-2 py-1 text-sm bg-zinc-900 border border-zinc-700 rounded"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {isTreeLoading && <p className="text-xs text-zinc-500">Scanning…</p>}
          {fileTree && <pre className="text-xs whitespace-pre-wrap break-all">{fileTree.name}</pre>}
        </div>
        {wsError && <p className="text-xs text-red-500">{wsError}</p>}
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800">
          <select
            value={activeProvider}
            onChange={(e) => setProvider(e.target.value as "nvidia" | "local")}
            className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
          >
            <option value="nvidia">NVIDIA NIM</option>
            <option value="local">Local (Ollama)</option>
          </select>
          <input
            type="text"
            value={activeModel}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 flex-1"
          />
          {selectedFile && (
            <button
              onClick={saveCurrentChanges}
              disabled={isSaving}
              className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          )}
        </header>

        <div className="flex-1 p-4 overflow-auto">
          {isFileLoading && <p className="text-xs text-zinc-500">Loading file…</p>}
          {fileContentBuffer && (
            <textarea
              value={fileContentBuffer.content}
              onChange={(e) => {
                const store = useWorkspace.getState();
                if (store.fileContentBuffer) {
                  store.fileContentBuffer.content = e.target.value;
                }
              }}
              className="w-full h-full bg-zinc-900 text-sm font-mono p-4 rounded border border-zinc-700 resize-none focus:outline-none"
              spellCheck={false}
            />
          )}
          {!selectedFile && !isFileLoading && (
            <p className="text-xs text-zinc-600">Select a file from the workspace tree.</p>
          )}
        </div>

        <footer className="h-32 border-t border-zinc-800 p-4 overflow-auto bg-zinc-900">
          {isStreaming && <span className="text-xs text-amber-500">Streaming…</span>}
          {streamError && <p className="text-xs text-red-500">{streamError}</p>}
          <pre className="text-xs whitespace-pre-wrap break-all">{currentStreamOutput}</pre>
        </footer>
      </main>
    </div>
  );
}
