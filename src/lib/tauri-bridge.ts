import { invoke } from "@tauri-apps/api/core";
import type { FileNode, FileContent, WriteResult, ChatMessage, Provider } from "./types";

export async function listWorkspace(rootPath: string): Promise<FileNode> {
  try {
    return await invoke<FileNode>("list_workspace", { rootPath });
  } catch (e) {
    throw new Error(`list_workspace failed: ${String(e)}`);
  }
}

export async function readWorkspaceFile(
  filePath: string,
  relativeTo?: string,
): Promise<FileContent> {
  try {
    return await invoke<FileContent>("read_workspace_file", {
      filePath,
      relativeTo: relativeTo ?? null,
    });
  } catch (e) {
    throw new Error(`read_workspace_file failed: ${String(e)}`);
  }
}

export async function writeWorkspaceFile(
  filePath: string,
  content: string,
  createBackup?: boolean,
): Promise<WriteResult> {
  try {
    return await invoke<WriteResult>("write_workspace_file", {
      filePath,
      content,
      createBackup: createBackup ?? true,
    });
  } catch (e) {
    throw new Error(`write_workspace_file failed: ${String(e)}`);
  }
}

export async function llmStreamChat(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  options?: {
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  },
): Promise<string> {
  try {
    return await invoke<string>("llm_stream_chat", {
      provider,
      model,
      messages,
      apiKey: options?.apiKey ?? null,
      baseUrl: options?.baseUrl ?? null,
      temperature: options?.temperature ?? null,
      maxTokens: options?.maxTokens ?? null,
    });
  } catch (e) {
    throw new Error(`llm_stream_chat failed: ${String(e)}`);
  }
}
