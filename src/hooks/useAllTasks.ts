import { useQuery } from "@tanstack/react-query";
import { fetchAllTasks } from "@/lib/api";
import { useDashboardStore } from "@/store/dashboardStore";
import type { AdvancedSearchPayload, TaskrowTask } from "@/types/taskrow";

export function useAllTasks(extraPayload?: Partial<AdvancedSearchPayload>) {
  const { dateFrom, dateTo } = useDashboardStore();

  return useQuery<TaskrowTask[]>({
    queryKey: ["tasks", dateFrom, dateTo, extraPayload],
    queryFn: () =>
      fetchAllTasks({
        StartDate: dateFrom,
        EndDate: dateTo,
        Closed: null as any,
        ...extraPayload,
      }),
    staleTime: 1000 * 60 * 5,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
