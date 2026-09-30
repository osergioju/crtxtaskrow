import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { TaskrowJob } from "@/types/taskrow";

export function useProjects(clientId?: number) {
  return useQuery({
    queryKey: ["projects", clientId ?? "all"],
    queryFn: () =>
      apiGet<{ items: TaskrowJob[]; nextToken: string | null }>("/api/v2/core/job/list", {
        includeInactives: false,
        ClientID: clientId,
      }),
    staleTime: 1000 * 60 * 10,
  });
}
