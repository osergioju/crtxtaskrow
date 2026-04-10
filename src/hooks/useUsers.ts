import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { TaskrowUser } from "@/types/taskrow";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<TaskrowUser[]>("/api/v1/User/ListUsers"),
    staleTime: 1000 * 60 * 10,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
