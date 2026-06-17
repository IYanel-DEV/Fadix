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

export type Provider = "nvidia" | "local" | "custom";

export type AgentStatus = "Idle" | "Prompting" | "Mutating" | "Error" | "processing";

export interface AppConfig {
  nvidiaApiKey: string;
  activeProvider: string;
  activeModel: string;
  localBaseUrl: string;
  customBaseUrl: string;
  customApiKey: string;
}

export interface AgentStatusEntry {
  status: AgentStatus;
  message: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  preview?: string;
}

export interface LogEntry {
  id: number;
  agent: string;
  level: string;
  message: string;
  timestamp: number;
}

export interface ConversationEntry {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ConversationEntry[];
  createdAt: number;
  updatedAt: number;
}
