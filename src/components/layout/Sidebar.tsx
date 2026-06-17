import { useState, useCallback, useEffect } from "react";
import {
  FolderOpen,
  File,
  Folder,
  ChevronRight,
  Loader2,
  FileCode2,
  FileJson,
  FileType,
  Terminal,
  Image,
  AlertCircle,
  Eye,
  Plus,
  X,
  Bookmark,
  Lock,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { FileNode } from "@/lib/types";
import type { RegisteredProject } from "@/stores/workspaceStore";

const FILE_ICONS: Record<string, typeof File> = {
  ts: FileCode2,
  tsx: FileCode2,
  js: FileCode2,
  jsx: FileCode2,
  rs: FileCode2,
  py: FileCode2,
  json: FileJson,
  css: FileType,
  html: FileType,
  md: FileType,
  toml: FileType,
  yml: FileJson,
  yaml: FileJson,
  sh: Terminal,
  ps1: Terminal,
  bat: Terminal,
  svg: Image,
  png: Image,
  ico: Image,
};

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? File;
}

export default function Sidebar() {
  const {
    currentDirectory,
    fileTree,
    isTreeLoading,
    selectedFile,
    openFolder,
    loadFile,
    registeredProjects,
    activeProjectId,
    registerProject,
    unregisterProject,
    switchProject,
    requestProjectPermission,
    restoreProjects,
    error,
  } = useWorkspaceStore();

  const [dialogError, setDialogError] = useState<string | null>(null);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  useEffect(() => {
    restoreProjects();
  }, [restoreProjects]);

  const handleOpenFolder = useCallback(async () => {
    setDialogError(null);
    try {
      await openFolder();
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setDialogError(null), 4000);
    }
  }, [openFolder]);

  const displayError = dialogError || error;

  return (
    <aside className="w-64 h-full bg-[#0e0f16] border-r border-white/[0.04] flex flex-col shrink-0 overflow-hidden">
      <div className="shrink-0 px-3 py-3 border-b border-white/[0.04] space-y-2">
        <div className="flex gap-1.5">
          <button
            onClick={handleOpenFolder}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#12131a] hover:bg-[#191a24] border border-white/[0.06] text-sm text-zinc-400 hover:text-zinc-200 transition-all duration-150 active:scale-[0.98]"
          >
            <FolderOpen size={15} />
            Open Folder
          </button>
          {currentDirectory && (
            <button
              onClick={() => registerProject()}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#12131a] hover:bg-[#191a24] border border-white/[0.06] text-zinc-600 hover:text-zinc-300 transition-all duration-150 active:scale-90"
              title="Save current folder as a project"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {displayError && (
        <div className="shrink-0 px-3 py-2 border-b border-white/[0.04] bg-red-500/8 animate-fade-in">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={11} className="text-red-400 shrink-0" />
            <p className="text-[10px] text-red-400/80 truncate">{displayError}</p>
          </div>
        </div>
      )}

      {registeredProjects.length > 0 && (
        <div className="shrink-0 border-b border-white/[0.04]">
          <div className="px-3 py-2.5">
            <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-medium mb-1.5">
              Projects
            </p>
            <div className="space-y-0.5">
              {registeredProjects.map((proj: RegisteredProject) => {
                const isActive = proj.id === activeProjectId;
                const isHovered = hoveredProject === proj.id;
                const needsPermission = proj.needsValidation;
                return (
                  <div
                    key={proj.id}
                    className="relative group"
                    onMouseEnter={() => setHoveredProject(proj.id)}
                    onMouseLeave={() => setHoveredProject(null)}
                  >
                    <button
                      onClick={() =>
                        needsPermission
                          ? requestProjectPermission(proj.id)
                          : switchProject(proj.id)
                      }
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 ${
                        isActive
                          ? "bg-[#4f6ef7]/8 text-zinc-200 border border-[#4f6ef7]/10"
                          : needsPermission
                            ? "text-zinc-500 hover:text-amber-400/80 hover:bg-amber-500/5"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-[#12131a]"
                      }`}
                    >
                      {needsPermission ? (
                        <Lock size={12} className="shrink-0 text-amber-500/60" />
                      ) : (
                        <Bookmark
                          size={12}
                          className={`shrink-0 ${
                            isActive ? "text-indigo-400" : "text-zinc-600"
                          }`}
                        />
                      )}
                      <span className="truncate flex-1 text-left">
                        {needsPermission ? `${proj.name} (click to unlock)` : proj.name}
                      </span>
                    </button>
                    {!needsPermission && (
                      <div
                        className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${
                          isHovered ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <button
                          onClick={() => switchProject(proj.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-[#191a24] transition-colors"
                          title="View files"
                        >
                          <Eye size={12} />
                        </button>
                        <button
                          onClick={() => unregisterProject(proj.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-zinc-700 hover:text-red-400 hover:bg-red-500/8 transition-colors"
                          title="Remove project"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {currentDirectory && (
        <div className="shrink-0 px-3 py-2.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <Folder size={12} className={`shrink-0 ${registeredProjects.length > 0 ? "text-indigo-400" : "text-zinc-600"}`} />
            <p className="text-[10px] text-zinc-600 truncate font-medium leading-relaxed tracking-tight">
              {currentDirectory}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto py-0.5">
        {isTreeLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-zinc-600 text-xs">
            <Loader2 size={14} className="animate-spin" />
            Scanning workspace...
          </div>
        )}
        {fileTree && (
          <TreeItem
            node={fileTree}
            depth={0}
            selectedFile={selectedFile}
            onSelect={loadFile}
          />
        )}
        {!isTreeLoading && !fileTree && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-zinc-700">
            <div className="w-12 h-12 rounded-xl bg-[#12131a] border border-white/[0.04] flex items-center justify-center mb-4">
              <FolderOpen size={24} className="opacity-40" />
            </div>
            <p className="text-xs text-zinc-600 mb-1">No workspace open</p>
            <p className="text-[10px] text-zinc-700 text-center leading-relaxed">
              Open a folder to browse<br />and edit your files
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function TreeItem({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.is_directory) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-[#12131a] transition-all duration-150"
          style={{ paddingLeft: `${depth * 12 + 10}px` }}
        >
          <div className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>
            <ChevronRight size={11} className="shrink-0 opacity-60" />
          </div>
          <Folder
            size={13}
            className={`shrink-0 transition-colors duration-200 ${
              expanded ? "text-indigo-400/70" : "text-zinc-600"
            }`}
          />
          <span className="truncate">{node.name}</span>
        </button>
        <div
          className={`overflow-hidden transition-all duration-200 ${
            expanded ? "opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          {node.children?.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  const isSelected = selectedFile === node.path;
  const Icon = getFileIcon(node.name);

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs transition-all duration-150 ${
        isSelected
          ? "bg-[#4f6ef7]/8 text-zinc-200"
          : "text-zinc-500 hover:text-zinc-300 hover:bg-[#12131a]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
    >
      <Icon
        size={12}
        className={`shrink-0 ${
          isSelected ? "text-indigo-400" : "text-zinc-600"
        }`}
      />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
