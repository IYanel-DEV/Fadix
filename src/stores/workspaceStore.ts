import { create } from "zustand";
import type { FileNode, FileContent } from "@/lib/types";
import {
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "@/lib/tauri-bridge";

interface WorkspaceState {
  currentDirectory: string | null;
  fileTree: FileNode | null;
  selectedFile: string | null;
  fileContentBuffer: FileContent | null;
  isTreeLoading: boolean;
  isFileLoading: boolean;
  isSaving: boolean;
  error: string | null;

  setDirectory: (path: string) => void;
  fetchTree: () => Promise<void>;
  loadFile: (path: string) => Promise<void>;
  saveCurrentChanges: () => Promise<void>;
  clearSelection: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentDirectory: null,
  fileTree: null,
  selectedFile: null,
  fileContentBuffer: null,
  isTreeLoading: false,
  isFileLoading: false,
  isSaving: false,
  error: null,

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

  fetchTree: async () => {
    const dir = get().currentDirectory;
    if (!dir) {
      set({ error: "No directory selected" });
      return;
    }

    set({ isTreeLoading: true, error: null });

    try {
      const tree = await listWorkspace(dir);
      set({ fileTree: tree, isTreeLoading: false });
    } catch (e) {
      set({
        isTreeLoading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  loadFile: async (path: string) => {
    const dir = get().currentDirectory;
    if (!dir) return;

    set({ isFileLoading: true, selectedFile: path, error: null });

    try {
      const content = await readWorkspaceFile(path, dir);
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
      await writeWorkspaceFile(buffer.path, buffer.content, true);
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
}));
