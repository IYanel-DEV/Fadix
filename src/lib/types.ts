export interface FileNode {
  name: string;
  path: string;
  relative_path: string;
  is_directory: boolean;
  size: number;
  children: FileNode[] | null;
}

export interface FileContent {
  path: string;
  relative_path: string;
  content: string;
  size: number;
  line_count: number;
}

export interface WriteResult {
  path: string;
  bytes_written: number;
  backup_path: string | null;
  success: boolean;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface LlmStreamEvent {
  token: string;
  done: boolean;
  finish_reason: string | null;
  error: string | null;
}

export type Provider = "nvidia" | "local";
