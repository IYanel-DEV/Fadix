import { create } from "zustand";
import type { FileNode, FileContent } from "@/lib/types";
import {
  pickDirectory,
  setRootHandle,
  getRootHandle,
  scanWorkspace,
  readFile,
  readLegacyWriteFile,
  writeFileToDisk as engineWriteFile,
  saveCurrentHandle,
  loadProjectHandle,
  deleteProjectHandle,
  listProjectMeta,
} from "@/lib/workspaceEngine";

export interface RegisteredProject {
  id: string;
  name: string;
  needsValidation?: boolean;
}

interface WorkspaceState {
  currentDirectory: string | null;
  fileTree: FileNode | null;
  selectedFile: string | null;
  fileContentBuffer: FileContent | null;
  isTreeLoading: boolean;
  isFileLoading: boolean;
  isSaving: boolean;
  isWritingFiles: boolean;
  filesWritten: number;
  error: string | null;

  registeredProjects: RegisteredProject[];
  activeProjectId: string | null;

  setDirectory: (path: string) => void;
  openFolder: () => Promise<void>;
  fetchTree: () => Promise<void>;
  loadFile: (path: string) => Promise<void>;
  saveCurrentChanges: () => Promise<void>;
  clearSelection: () => void;

  registerProject: (name?: string) => Promise<void>;
  unregisterProject: (id: string) => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  restoreProjects: () => Promise<void>;
  requestProjectPermission: (id: string) => Promise<void>;

  saveGeneratedFile: (filePath: string, content: string) => Promise<void>;
  commitAgentOutput: (output: string) => Promise<void>;
  collectFilePaths: () => string[];
}

function parseFileBlocks(output: string): Array<{ path: string; content: string }> {
  const blocks: Array<{ path: string; content: string }> = [];
  const regex = /###\s+(.+?)\n```\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    const path = match[1].trim();
    const content = match[2] ? match[2].trim() : "";
    if (path) blocks.push({ path, content });
  }
  return blocks;
}

/* ── Direct File System Access API writer ─────────
   Traverses the directory handle tree to reach the target file path,
   creates intermediate directories as needed, then writes content
   atomically through a WritableStream. */
async function writeAgentFileToDisk(handle: FileSystemDirectoryHandle, filePath: string, content: string): Promise<void> {
  const parts = filePath.replace(/\\/g, "/").replace(/^\//, "").split("/");
  let currentDir = handle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentDirectory: null,
  fileTree: null,
  selectedFile: null,
  fileContentBuffer: null,
  isTreeLoading: false,
  isFileLoading: false,
  isSaving: false,
  isWritingFiles: false,
  filesWritten: 0,
  error: null,

  registeredProjects: [],
  activeProjectId: null,

  setDirectory: (path: string) => {
    set({
      currentDirectory: path,
      fileTree: null,
      selectedFile: null,
      fileContentBuffer: null,
      error: null,
    });
    get().fetchTree();
  },

  openFolder: async () => {
    set({ error: null, isTreeLoading: true });
    try {
      const name = await pickDirectory();
      set({
        currentDirectory: name,
        fileTree: null,
        selectedFile: null,
        fileContentBuffer: null,
        isTreeLoading: false,
      });
      await get().fetchTree();
      /* auto-register the project in IndexedDB so it persists across refreshes */
      await get().registerProject(name);
    } catch (e) {
      if (DOMException && e instanceof DOMException && e.name === "AbortError") {
        set({ isTreeLoading: false });
        return;
      }
      set({
        isTreeLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  registerProject: async (name?: string) => {
    const state = get();
    if (!state.currentDirectory && !state.fileTree) return;
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await saveCurrentHandle(id, name || state.currentDirectory || "untitled");
      const meta = await listProjectMeta();
      set({
        registeredProjects: meta.map((p) => ({
          ...p,
          needsValidation: p.id !== id,
        })),
        activeProjectId: id,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  unregisterProject: async (id: string) => {
    try {
      await deleteProjectHandle(id);
      const meta = await listProjectMeta();
      set((s) => ({
        registeredProjects: meta.map((p) => ({ ...p, needsValidation: true })),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  requestProjectPermission: async (id: string) => {
    set({ isTreeLoading: true, error: null, fileTree: null });
    try {
      const data = await loadProjectHandle(id);
      if (!data) throw new Error("Project not found");
      const { name, handle } = data;

      /* query first for fast path, then request if needed */
      let permission = await (handle as any).queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        permission = await (handle as any).requestPermission({ mode: "readwrite" });
      }
      if (permission !== "granted") {
        throw new Error(`Permission denied for "${name}". Use "Open Folder" to re-select.`);
      }

      setRootHandle(handle, name);
      set((s) => ({
        activeProjectId: id,
        currentDirectory: name,
        selectedFile: null,
        fileContentBuffer: null,
        registeredProjects: s.registeredProjects.map((p) =>
          p.id === id ? { ...p, needsValidation: false } : p
        ),
      }));
      const tree = await scanWorkspace();
      set({ fileTree: tree, isTreeLoading: false });
    } catch (e) {
      set({
        isTreeLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  switchProject: async (id: string) => {
    set({ isTreeLoading: true, error: null, fileTree: null, selectedFile: null, fileContentBuffer: null });
    try {
      const data = await loadProjectHandle(id);
      if (!data) throw new Error("Project not found");
      const { name, handle } = data;
      const permission = await (handle as any).requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        throw new Error(`Permission denied for "${name}". Click "Open Folder" to re-select.`);
      }
      setRootHandle(handle, name);
      set({
        activeProjectId: id,
        currentDirectory: name,
      });
      const tree = await scanWorkspace();
      set({ fileTree: tree, isTreeLoading: false });
    } catch (e) {
      set({
        isTreeLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  restoreProjects: async () => {
    /* On boot, load all project metadata from IndexedDB and mark every project
       as needsValidation so the user must re-grant permission before use. */
    try {
      const meta = await listProjectMeta();
      set({
        registeredProjects: meta.map((p) => ({ ...p, needsValidation: true })),
      });
    } catch { /* non-critical */ }
  },

  fetchTree: async () => {
    set({ isTreeLoading: true, error: null });
    try {
      const tree = await scanWorkspace();
      set({ fileTree: tree, isTreeLoading: false });
    } catch (e) {
      set({
        isTreeLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  loadFile: async (path: string) => {
    set({ isFileLoading: true, selectedFile: path, error: null });
    try {
      const content = await readFile(path);
      set({ fileContentBuffer: content, isFileLoading: false });
    } catch (e) {
      set({
        isFileLoading: false,
        fileContentBuffer: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  saveCurrentChanges: async () => {
    const buffer = get().fileContentBuffer;
    if (!buffer) {
      set({ error: "No file content to save" });
      return;
    }
    set({ isSaving: true, error: null });
    try {
      await readLegacyWriteFile(buffer.path, buffer.content);
      set({ isSaving: false });
    } catch (e) {
      set({
        isSaving: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  clearSelection: () => {
    set({ selectedFile: null, fileContentBuffer: null });
  },

  saveGeneratedFile: async (filePath: string, content: string) => {
    try {
      await engineWriteFile(filePath, content);
    } catch (e) {
      throw e;
    }
  },

  commitAgentOutput: async (output: string) => {
    if (!output) {
      set({ error: "No output received from agents. The specialists may have returned empty content." });
      return;
    }
    const blocks = parseFileBlocks(output);
    if (blocks.length === 0) {
      set({ error: "No file blocks found in agent output. The specialists may have returned empty content or an unexpected format." });
      return;
    }

    const handle = getRootHandle();
    if (!handle) {
      set({ error: "No folder selected. Open a folder before committing agent output." });
      return;
    }

    /* ── PATH PERMISSION GUARD ── */
    /* Reject any file path that escapes the workspace directory. */
    const outsideRe = /(?:^|\/)\.\.(?:\/|$)|^[A-Za-z]:[\\\/]|^\//;
    const unsafe = blocks.find((b) => outsideRe.test(b.path));
    if (unsafe) {
      set({ error: `I don't have permission to write files outside the current project. Blocked: ${unsafe.path}`, isWritingFiles: false });
      return;
    }

    set({ isWritingFiles: true, filesWritten: 0, error: null });
    let written = 0;
    for (const block of blocks) {
      try {
        await writeAgentFileToDisk(handle, block.path, block.content);
        written++;
        set({ filesWritten: written });
      } catch (e) {
        set({ error: `Failed to write ${block.path}: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    set({ isWritingFiles: false });
    if (written > 0) await get().fetchTree();
  },

  collectFilePaths: () => {
    const tree = get().fileTree;
    if (!tree) return [];
    const paths: string[] = [];
    function walk(node: FileNode) {
      if (!node.is_directory) paths.push(node.relative_path);
      if (node.children) node.children.forEach(walk);
    }
    walk(tree);
    return paths;
  },
}));
