import { create } from "zustand";
import type { ChatMessage, Provider, AgentStatus, AgentStatusEntry, LogEntry, ConversationEntry, ChatSession } from "@/lib/types";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { playSendSound, playCancelSound, playCompleteSound } from "@/lib/sound";

const CONFIG_KEY = "fadix_config";
const PROXY_URL = "http://localhost:3001";


interface LlmState {
  activeProvider: Provider;
  activeModel: string;
  isStreaming: boolean;
  currentStreamOutput: string;
  streamError: string | null;
  finishReason: string | null;
  apiKey: string;
  baseUrl: string;
  customApiKey: string;
  customBaseUrl: string;
  temperature: number;
  maxTokens: number | null;
  reasoningEffort: "none" | "low" | "high";
  searchApiKey: string;

  agentStatuses: Record<string, AgentStatusEntry>;
  activityLog: LogEntry[];
  conversation: ConversationEntry[];

  availableModels: string[];
  modelsLoading: boolean;
  modelsSource: string;

  agentModelOverrides: Partial<Record<string, string>>;

  abortController: AbortController | null;

  lastPrompt: string;
  editLastEnabled: boolean;

  chats: ChatSession[];
  activeChatId: string | null;
  loadChats: (projectId: string) => void;
  saveChats: () => void;
  createChat: () => string;
  deleteChat: (id: string) => void;
  switchChat: (id: string) => void;
  syncConversationToChat: () => void;
  updateMessage: (id: number, content: string) => void;

  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setCustomApiKey: (key: string) => void;
  setCustomBaseUrl: (url: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number | null) => void;
  setSearchApiKey: (key: string) => void;
  setReasoningEffort: (effort: "none" | "low" | "high") => void;
  cycleReasoningEffort: () => void;
  loadConfig: () => void;
  persistConfig: () => void;
  sendPromptStream: (messages: ChatMessage[]) => Promise<void>;
  abortStream: () => void;
  clearStream: () => void;
  setAgentStatus: (agent: string, status: AgentStatus, message?: string) => void;
  setEditLastEnabled: (v: boolean) => void;
  clearActivityLog: () => void;
  clearConversation: () => void;
  fetchAvailableModels: () => Promise<void>;
  setAgentModelOverride: (agent: string, model: string) => void;
  setAgentModel: (agent: string, model: string) => void;
}

let logId = 0;
let convId = 0;

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(state: Pick<LlmState, "apiKey" | "activeProvider" | "activeModel" | "baseUrl" | "customBaseUrl" | "customApiKey" | "searchApiKey" | "agentModelOverrides">) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save config to localStorage:", e);
  }
}

function addLog(set: any, agent: string, level: string, message: string) {
  set((s: LlmState) => ({
    activityLog: [...s.activityLog, { id: ++logId, agent, level, message, timestamp: Date.now() }],
  }));
}

export const useLlmStore = create<LlmState>((set, get) => ({
  activeProvider: "local",
  activeModel: "llama3.1",
  isStreaming: false,
  currentStreamOutput: "",
  streamError: null,
  finishReason: null,
  apiKey: "",
  baseUrl: "http://localhost:11434",
  customApiKey: "",
  customBaseUrl: "",
  temperature: 0.7,
  maxTokens: null,
  reasoningEffort: "none" as "none" | "low" | "high",
  searchApiKey: "",

  availableModels: ["llama3.1"],
  modelsLoading: false,
  modelsSource: "",

  agentModelOverrides: {},

  abortController: null,

  lastPrompt: "",
  editLastEnabled: false,

  agentStatuses: {
    architect: { status: "Idle", message: "Awaiting task" },
    coder: { status: "Idle", message: "Awaiting task" },
    ui_specialist: { status: "Idle", message: "Awaiting task" },
  },

  activityLog: [],
  conversation: [],
  chats: [],
  activeChatId: null,

  setProvider: (provider) => {
    set({ activeProvider: provider });
    get().persistConfig();
    get().fetchAvailableModels();
  },
  setModel: (model) => {
    set({ activeModel: model });
    get().persistConfig();
  },
  setApiKey: (key) => {
    set({ apiKey: key });
    get().persistConfig();
    get().fetchAvailableModels();
  },
  setBaseUrl: (url) => {
    set({ baseUrl: url });
    get().persistConfig();
  },
  setCustomApiKey: (key) => {
    set({ customApiKey: key });
    get().persistConfig();
  },
  setCustomBaseUrl: (url) => {
    set({ customBaseUrl: url });
    get().persistConfig();
  },
  setTemperature: (temp) => set({ temperature: temp }),
  setMaxTokens: (tokens) => set({ maxTokens: tokens }),
  setReasoningEffort: (effort) => set({ reasoningEffort: effort }),
  setSearchApiKey: (key) => {
    set({ searchApiKey: key });
    get().persistConfig();
  },
  cycleReasoningEffort: () => {
    set((s) => ({
      reasoningEffort: s.reasoningEffort === "none" ? "low" : s.reasoningEffort === "low" ? "high" : "none",
    }));
  },

  setAgentModelOverride: (agent, model) => {
    set((s) => ({
      agentModelOverrides: { ...s.agentModelOverrides, [agent]: model },
    }));
    get().persistConfig();
  },

  setAgentModel: (agent, model) => {
    get().setAgentModelOverride(agent, model);
  },

  setAgentStatus: (agent, status, message) => {
    set((s) => {
      const updated = { ...s.agentStatuses, [agent]: { status, message: message ?? s.agentStatuses[agent]?.message ?? "" } };
      if (status === "processing") {
        Object.keys(updated).forEach((key) => {
          if (key !== agent) updated[key] = { status: "Idle", message: updated[key]?.message || "" };
        });
      }
      return { agentStatuses: updated };
    });
  },

  setEditLastEnabled: (v) => set({ editLastEnabled: v }),

  updateMessage: (id: number, content: string) => {
    set((s) => ({
      conversation: s.conversation.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    }));
    get().syncConversationToChat();
  },
  clearActivityLog: () => set({ activityLog: [] }),
  clearConversation: () => set({ conversation: [] }),

  loadChats: (projectId: string) => {
    try {
      const raw = localStorage.getItem(`fadix_chats_${projectId}`);
      const chats: ChatSession[] = raw ? JSON.parse(raw) : [];
      set({ chats, activeChatId: null });
      if (chats.length === 0) {
        get().createChat();
      } else {
        get().switchChat(chats[chats.length - 1].id);
      }
    } catch {
      set({ chats: [], activeChatId: null });
      get().createChat();
    }
  },

  saveChats: () => {
    const state = get();
    const ws = useWorkspaceStore.getState();
    const projectId = ws.activeProjectId || "default";
    try {
      localStorage.setItem(`fadix_chats_${projectId}`, JSON.stringify(state.chats));
    } catch (e) {
      console.warn("Failed to save chats:", e);
    }
  },

  createChat: () => {
    const state = get();
    /* save current conversation to the previous chat before creating new */
    if (state.activeChatId) get().syncConversationToChat();

    const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const chat: ChatSession = {
      id,
      name: `Chat ${state.chats.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      chats: [...s.chats, chat],
      activeChatId: id,
      conversation: [],
      currentStreamOutput: "",
      streamError: null,
      finishReason: null,
    }));
    get().saveChats();
    return id;
  },

  deleteChat: (id: string) => {
    const state = get();
    if (state.chats.length <= 1) return; /* keep at least one chat */
    const chats = state.chats.filter((c) => c.id !== id);
    set({ chats });
    if (state.activeChatId === id) {
      /* switch to another chat */
      const next = chats[chats.length - 1];
      if (next) get().switchChat(next.id);
    }
    get().saveChats();
  },

  switchChat: (id: string) => {
    const state = get();
    if (id === state.activeChatId) return;
    /* save current conversation to the old chat */
    if (state.activeChatId) get().syncConversationToChat();

    const chat = state.chats.find((c) => c.id === id);
    if (!chat) return;

    set({
      activeChatId: id,
      conversation: chat.messages,
      currentStreamOutput: "",
      streamError: null,
      finishReason: null,
      activityLog: [],
      lastPrompt: "",
    });
  },

  syncConversationToChat: () => {
    const state = get();
    if (!state.activeChatId) return;
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === s.activeChatId
          ? { ...c, messages: s.conversation, updatedAt: Date.now() }
          : c
      ),
    }));
    get().saveChats();
  },

  fetchAvailableModels: async () => {
    const state = get();
    if (state.modelsLoading) return;
    set({ modelsLoading: true });
    try {
      const resp = await fetch(`${PROXY_URL}/api/models?apiKey=${encodeURIComponent(state.apiKey)}`);
      if (!resp.ok) throw new Error(`Server ${resp.status}`);
      const body = await resp.json();
      set({
        availableModels: Array.isArray(body.models) && body.models.length > 0 ? body.models : ["llama3.1"],
        modelsSource: body.source || "",
        modelsLoading: false,
      });
    } catch {
      set({ modelsLoading: false });
    }
  },

  loadConfig: () => {
    const saved = loadFromStorage();
    if (saved) {
      const hasValidKey = saved.apiKey?.trim().startsWith("nvapi-");
      set({
        apiKey: saved.apiKey ?? "",
        activeProvider: hasValidKey ? "nvidia" : (saved.activeProvider ?? "local"),
        activeModel: saved.activeModel ?? "llama3.1",
        baseUrl: saved.baseUrl ?? "http://localhost:11434",
        customBaseUrl: saved.customBaseUrl ?? "",
        customApiKey: saved.customApiKey ?? "",
        searchApiKey: saved.searchApiKey ?? "",
        agentModelOverrides: saved.agentModelOverrides ?? {},
      });
    }
    get().fetchAvailableModels();
  },

  persistConfig: () => {
    const state = get();
    saveToStorage({
      apiKey: state.apiKey,
      activeProvider: state.activeProvider,
      activeModel: state.activeModel,
      baseUrl: state.baseUrl,
      customBaseUrl: state.customBaseUrl,
      customApiKey: state.customApiKey,
      searchApiKey: state.searchApiKey,
      agentModelOverrides: state.agentModelOverrides,
    });
  },

  sendPromptStream: async (messages: ChatMessage[]) => {
    const state = get();
    if (state.isStreaming) return;

    const promptText = messages.map((m) => m.content).join("\n");
    const controller = new AbortController();
    set((s) => ({
      isStreaming: true,
      currentStreamOutput: "",
      streamError: null,
      finishReason: null,
      abortController: controller,
      lastPrompt: promptText,
      editLastEnabled: false,
      activityLog: [],
      conversation: [
        ...s.conversation,
        { id: ++convId, role: "user", content: promptText, timestamp: Date.now() },
      ],
      agentStatuses: Object.fromEntries(
        Object.entries(s.agentStatuses).map(([k, v]) => [
          k,
          { ...v, status: "Idle" as AgentStatus },
        ]),
      ),
    }));

    try {
      playSendSound();
      const resp = await fetch(`${PROXY_URL}/api/agent-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: promptText,
            apiKey: state.apiKey || state.customApiKey,
            model: state.activeModel,
            agentModels: state.agentModelOverrides,
            architectModel: state.agentModelOverrides["architect"] || state.activeModel,
            coderModel: state.agentModelOverrides["coder"] || state.activeModel,
            uiModel: state.agentModelOverrides["ui_specialist"] || state.activeModel,
            temperature: state.temperature,
            maxTokens: state.maxTokens,
            reasoningEffort: state.reasoningEffort,
            searchApiKey: state.searchApiKey,
            isEmptyCanvas: (() => {
              const ws = useWorkspaceStore.getState();
              return ws.fileTree !== null && ws.fileTree.children !== null && ws.fileTree.children.length === 0;
            })(),
            existingFiles: (() => {
              const ws = useWorkspaceStore.getState();
              return ws.collectFilePaths ? ws.collectFilePaths() : [];
            })(),
            /* send last 2 assistant responses so the architect knows what was previously generated */
            conversation: (() => {
              const conv = state.conversation;
              return conv.filter((c) => c.role === "assistant").slice(-2).map((c) => c.content);
            })(),
          }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`Server ${resp.status}: ${await resp.text()}`);

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Response body not readable");

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      let eventData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes("\n")) {
          const nlIndex = buffer.indexOf("\n");
          const line = buffer.slice(0, nlIndex);
          buffer = buffer.slice(nlIndex + 1);

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            eventData = line.slice(5).trim();
            if (!eventType) {
              eventType = "data"; /* raw data message without event prefix */
            }
          } else if (line === "") {
            if (eventType && eventData) {
              let parsed;
              try { parsed = JSON.parse(eventData); } catch { parsed = {}; }

              switch (eventType) {
                case "log":
                  addLog(set, parsed.agent || "system", parsed.level || "info", parsed.message || "");
                  break;
                case "token":
                  if (parsed.token) {
                    set((s: LlmState) => ({ currentStreamOutput: s.currentStreamOutput + parsed.token }));
                  }
                  break;
                case "status":
                  if (parsed.agent) {
                    get().setAgentStatus(parsed.agent, parsed.status || "Idle", parsed.message || "");
                  }
                  break;
                case "data":
                  if (parsed.status === "processing" && parsed.agent) {
                    get().setAgentStatus(parsed.agent, "processing", parsed.log || "");
                  } else if (parsed.status === "Idle" && parsed.agent) {
                    get().setAgentStatus(parsed.agent, "Idle", parsed.message || "");
                  }
                  break;
                case "plan":
                  addLog(set, "system", "info", `Plan received: ${parsed.files?.length || 0} file change(s)`);
                  break;
                case "done":
                  playCompleteSound();
                  const finalOutput = (parsed.output || "");
                  set((s: LlmState) => ({
                    isStreaming: false,
                    currentStreamOutput: "",
                    finishReason: "stop",
                    editLastEnabled: true,
                    abortController: null,
                    conversation: [
                      ...s.conversation,
                      { id: ++convId, role: "assistant", content: finalOutput, timestamp: Date.now() },
                    ],
                  }));
                  get().syncConversationToChat();
                  /* attempt to write files to disk and surface any errors to the activity log */
                  (async () => {
                    try {
                      await useWorkspaceStore.getState().commitAgentOutput(finalOutput);
                      const wsError = useWorkspaceStore.getState().error;
                      if (wsError) {
                        addLog(set, "system", "error", `File write: ${wsError}`);
                      } else {
                        const written = useWorkspaceStore.getState().filesWritten;
                        if (written > 0) {
                          addLog(set, "system", "info", `Wrote ${written} file(s) to disk`);
                        }
                      }
                    } catch (e) {
                      addLog(set, "system", "error", `File write error: ${e instanceof Error ? e.message : String(e)}`);
                    }
                  })();
                  eventType = "";
                  eventData = "";
                  return;
                case "error":
                  const errMsg = parsed.message || "Unknown error";
                  set((s: LlmState) => ({
                    isStreaming: false,
                    currentStreamOutput: "",
                    streamError: errMsg,
                    editLastEnabled: true,
                    abortController: null,
                    conversation: [
                      ...s.conversation,
                      { id: ++convId, role: "assistant", content: `**Error**: ${errMsg}`, timestamp: Date.now() },
                    ],
                  }));
                  get().syncConversationToChat();
                  eventType = "";
                  eventData = "";
                  return;
              }
            }
            eventType = "";
            eventData = "";
          }
        }
      }

      set({ isStreaming: false, finishReason: "stream_ended", editLastEnabled: true, abortController: null });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        set({ isStreaming: false, finishReason: "aborted", abortController: null });
        return;
      }
      const catchErr = e instanceof Error ? e.message : String(e);
      set((s: LlmState) => ({
        isStreaming: false,
        abortController: null,
        editLastEnabled: true,
        streamError: catchErr,
        conversation: [
          ...s.conversation,
          { id: ++convId, role: "assistant", content: `**Connection error**: ${catchErr}`, timestamp: Date.now() },
        ],
      }));
      get().syncConversationToChat();
    }
  },

  abortStream: () => {
    playCancelSound();
    const ctrl = get().abortController;
    if (ctrl) ctrl.abort();
    set({
      isStreaming: false,
      abortController: null,
      editLastEnabled: true,
      finishReason: "aborted",
      agentStatuses: Object.fromEntries(
        Object.entries(get().agentStatuses).map(([k, v]) => [k, { ...v, status: "Idle" as AgentStatus }]),
      ),
    });
  },

  clearStream: () => {
    set({
      currentStreamOutput: "",
      streamError: null,
      finishReason: null,
    });
  },
}));
