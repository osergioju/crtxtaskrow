import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { TaskrowJob } from "@/types/taskrow";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<{ data: TaskrowJob[]; nextToken: string | null }>("/api/core/job/list", { includeInactives: false }),
    staleTime: 1000 * 60 * 10,
  });
}
