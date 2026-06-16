import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { llmStreamChat } from "@/lib/tauri-bridge";
import type { ChatMessage, LlmStreamEvent, Provider } from "@/lib/types";

interface LlmState {
  activeProvider: Provider;
  activeModel: string;
  isStreaming: boolean;
  currentStreamOutput: string;
  streamError: string | null;
  finishReason: string | null;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number | null;

  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number | null) => void;
  sendPromptStream: (messages: ChatMessage[]) => Promise<void>;
  abortStream: () => void;
  clearStream: () => void;
}

let activeUnlisten: UnlistenFn | null = null;

export const useLlmStore = create<LlmState>((set, get) => ({
  activeProvider: "nvidia",
  activeModel: "meta/llama-3.1-8b-instruct",
  isStreaming: false,
  currentStreamOutput: "",
  streamError: null,
  finishReason: null,
  apiKey: "",
  baseUrl: "http://localhost:11434",
  temperature: 0.7,
  maxTokens: null,

  setProvider: (provider) => set({ activeProvider: provider }),
  setModel: (model) => set({ activeModel: model }),
  setApiKey: (key) => set({ apiKey: key }),
  setBaseUrl: (url) => set({ baseUrl: url }),
  setTemperature: (temp) => set({ temperature: temp }),
  setMaxTokens: (tokens) => set({ maxTokens: tokens }),

  sendPromptStream: async (messages: ChatMessage[]) => {
    const state = get();

    if (state.isStreaming) return;

    if (activeUnlisten) {
      activeUnlisten();
      activeUnlisten = null;
    }

    set({
      isStreaming: true,
      currentStreamOutput: "",
      streamError: null,
      finishReason: null,
    });

    let unlistenFn: UnlistenFn | null = null;

    try {
      unlistenFn = await listen<LlmStreamEvent>("llm-token", (event) => {
        const payload = event.payload;

        if (payload.error) {
          set({
            isStreaming: false,
            streamError: payload.error,
          });
          if (unlistenFn) {
            unlistenFn();
            activeUnlisten = null;
          }
          return;
        }

        if (payload.done) {
          set({
            isStreaming: false,
            finishReason: payload.finish_reason,
          });
          if (unlistenFn) {
            unlistenFn();
            activeUnlisten = null;
          }
          return;
        }

        set((s) => ({
          currentStreamOutput: s.currentStreamOutput + payload.token,
        }));
      });

      activeUnlisten = unlistenFn;

      await llmStreamChat(state.activeProvider, state.activeModel, messages, {
        apiKey: state.activeProvider === "nvidia" ? state.apiKey : undefined,
        baseUrl: state.activeProvider === "local" ? state.baseUrl : undefined,
        temperature: state.temperature,
        maxTokens: state.maxTokens ?? undefined,
      });
    } catch (e) {
      if (unlistenFn) {
        unlistenFn();
        activeUnlisten = null;
      }
      set({
        isStreaming: false,
        streamError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  abortStream: () => {
    if (activeUnlisten) {
      activeUnlisten();
      activeUnlisten = null;
    }
    set({
      isStreaming: false,
      streamError: null,
      finishReason: "aborted",
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
