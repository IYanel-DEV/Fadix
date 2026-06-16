import { useWorkspaceStore } from "@/stores/workspaceStore";

export function useWorkspace() {
  return useWorkspaceStore();
}
