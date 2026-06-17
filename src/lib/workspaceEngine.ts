import type { FileNode, FileContent } from "./types";

const handleMap = new Map<string, FileSystemFileHandle>();
const dirHandleCache = new Map<string, FileSystemDirectoryHandle>();
let rootHandle: FileSystemDirectoryHandle | null = null;
let rootPath = "";

/* ── IndexedDB handle persistence ──────────────── */

const DB_NAME = "fadix_workspace";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("handles"))
        db.createObjectStore("handles");
      if (!db.objectStoreNames.contains("meta"))
        db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCurrentHandle(id: string, name?: string): Promise<void> {
  if (!rootHandle) throw new Error("No active folder handle");
  const label = name || rootPath || "untitled";
  const db = await openDb();
  const tx = db.transaction(["handles", "meta"], "readwrite");
  tx.objectStore("handles").put(rootHandle, id);
  tx.objectStore("meta").put({ id, name: label });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadProjectHandle(id: string): Promise<{ name: string; handle: FileSystemDirectoryHandle } | null> {
  const db = await openDb();
  const tx = db.transaction(["handles", "meta"], "readonly");
  const handleReq = tx.objectStore("handles").get(id);
  const metaReq = tx.objectStore("meta").get(id);
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      handleReq.onsuccess = () => resolve();
      handleReq.onerror = () => reject(handleReq.error);
    }),
    new Promise<void>((resolve, reject) => {
      metaReq.onsuccess = () => resolve();
      metaReq.onerror = () => reject(metaReq.error);
    }),
  ]);
  db.close();
  const handle = handleReq.result as FileSystemDirectoryHandle | undefined;
  const meta = metaReq.result as { id: string; name: string } | undefined;
  if (!handle || !meta) return null;
  return { name: meta.name, handle };
}

export async function deleteProjectHandle(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["handles", "meta"], "readwrite");
  tx.objectStore("handles").delete(id);
  tx.objectStore("meta").delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listProjectMeta(): Promise<Array<{ id: string; name: string }>> {
  const db = await openDb();
  const tx = db.transaction("meta", "readonly");
  const req = tx.objectStore("meta").getAll();
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return (req.result || []) as Array<{ id: string; name: string }>;
}

/* ── active handle management ──────────────────── */

export async function pickDirectory(): Promise<string> {
  const handle = await (window as any).showDirectoryPicker() as FileSystemDirectoryHandle;
  rootHandle = handle;
  rootPath = handle.name;
  handleMap.clear();
  dirHandleCache.clear();
  return rootPath;
}

export function setRootHandle(handle: FileSystemDirectoryHandle, name: string): void {
  rootHandle = handle;
  rootPath = name;
  handleMap.clear();
  dirHandleCache.clear();
}

export function getRootPath(): string {
  return rootPath;
}

export function getRootHandle(): FileSystemDirectoryHandle | null {
  return rootHandle;
}

/* ── atomic file writer ────────────────────────── */

async function ensureDirChain(
  base: FileSystemDirectoryHandle,
  parts: string[],
  index: number,
): Promise<FileSystemDirectoryHandle> {
  if (index >= parts.length) return base;
  const name = parts[index];
  let existing = dirHandleCache.get(name);
  if (existing) return ensureDirChain(existing, parts, index + 1);
  try {
    existing = await base.getDirectoryHandle(name);
  } catch {
    existing = await base.getDirectoryHandle(name, { create: true });
  }
  dirHandleCache.set(name, existing);
  return ensureDirChain(existing, parts, index + 1);
}

export async function writeFileToDisk(filePath: string, content: string): Promise<void> {
  if (!rootHandle) throw new Error("No active folder handle");

  const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
  const parts = normalized.split("/");
  const fileName = parts.pop();
  if (!fileName) throw new Error(`Invalid file path: ${filePath}`);

  let parent: FileSystemDirectoryHandle;
  if (parts.length === 0) {
    parent = rootHandle;
  } else {
    parent = await ensureDirChain(rootHandle, parts, 0);
  }

  const fileHandle = await parent.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }

  const fullPath = normalized;
  handleMap.set(fullPath, fileHandle);
}

/* ── tree / file I/O ───────────────────────────── */

async function walkDirectory(
  handle: FileSystemDirectoryHandle,
  parentPath: string,
): Promise<FileNode> {
  const name = handle.name;
  const currentPath = parentPath ? `${parentPath}/${name}` : name;
  const children: FileNode[] = [];

  const entries = (handle as any).values() as AsyncIterableIterator<FileSystemHandle>;
  for await (const entry of entries) {
    if (entry.kind === "directory") {
      children.push(await walkDirectory(entry as FileSystemDirectoryHandle, currentPath));
    } else {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const childPath = `${currentPath}/${file.name}`;
      handleMap.set(childPath, fileHandle);
      children.push({
        name: file.name,
        path: childPath,
        relative_path: childPath,
        is_directory: false,
        size: file.size,
        children: null,
      });
    }
  }

  children.sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    name,
    path: currentPath,
    relative_path: currentPath,
    is_directory: true,
    size: 0,
    children,
  };
}

export async function scanWorkspace(): Promise<FileNode> {
  if (!rootHandle) throw new Error("No directory selected");
  return walkDirectory(rootHandle, "");
}

export async function readFile(path: string): Promise<FileContent> {
  const handle = handleMap.get(path);
  if (!handle) throw new Error(`File handle not found: ${path}`);
  const file = await handle.getFile();
  const content = await file.text();
  return {
    path,
    relative_path: path,
    content,
    size: file.size,
    line_count: content.split("\n").length,
  };
}

export async function readLegacyWriteFile(path: string, content: string): Promise<void> {
  const handle = handleMap.get(path);
  if (!handle) throw new Error(`File handle not found: ${path}`);
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
}
