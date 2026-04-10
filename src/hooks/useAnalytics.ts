import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AnalyticsResult } from "@/types/analytics";

async function fetchAnalytics(): Promise<AnalyticsResult> {
  const res = await fetch("/api/analytics");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function useAnalytics() {
  return useQuery<AnalyticsResult>({
    queryKey: ["analytics"],
    queryFn: fetchAnalytics,
    staleTime: 4 * 60 * 1000, // 4 min — slightly under server cache TTL
    retry: 1,
  });
}

export function useRefreshAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/analytics/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Falha ao atualizar analytics");
      return res.json() as Promise<AnalyticsResult>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["analytics"], data);
    },
  });
}
