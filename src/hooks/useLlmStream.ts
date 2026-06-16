import { useCallback } from "react";
import { useLlmStore } from "@/stores/llmStore";
import type { ChatMessage } from "@/lib/types";

export function useLlmStream() {
  const sendPromptStream = useLlmStore((s) => s.sendPromptStream);
  const abortStream = useLlmStore((s) => s.abortStream);

  const send = useCallback(
    (messages: ChatMessage[]) => sendPromptStream(messages),
    [sendPromptStream],
  );

  return { send, abort: abortStream };
}
