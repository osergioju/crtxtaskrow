import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AnalyticsResult } from "@/types/analytics";

export type AnalyticsResponse =
  | (AnalyticsResult & { needs_refresh?: never })
  | { needs_refresh: true; no_key?: boolean; fetch_error?: string };

async function fetchAnalytics(): Promise<AnalyticsResponse> {
  const res = await fetch("/api/analytics");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export function useAnalytics() {
  return useQuery<AnalyticsResponse>({
    queryKey: ["analytics"],
    queryFn: fetchAnalytics,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
}

export function useRefreshAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Usa a chave de fundo configurada em Configurações Gerais (server-side) —
      // não envia a chave pessoal do usuário, que é só pra visualização própria.
      const res = await fetch("/api/analytics/refresh", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Falha ao atualizar analytics");
      }
      return res.json() as Promise<AnalyticsResponse>;
    },
    onSuccess: (data) => {
      qc.setQueryData(["analytics"], data);
    },
  });
}
