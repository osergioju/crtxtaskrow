import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { TaskrowClient } from "@/types/taskrow";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      try {
        return await apiGet<TaskrowClient[]>("/api/v1/Search/SearchClients", { q: "", showInactives: false });
      } catch (err: any) {
        // If Taskrow returns PitstopRequired or auth error, return empty array
        // so pages can fall back to task-derived client data
        if (err?.message?.includes("PitstopRequired") || err?.message?.includes("403")) {
          console.warn("SearchClients unavailable (PitstopRequired), falling back to task-derived data");
          return [] as TaskrowClient[];
        }
        throw err;
      }
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
    retryDelay: 2000,
  });
}
