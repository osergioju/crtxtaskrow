import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { TaskrowClient } from "@/types/taskrow";

/**
 * `q` filtra por nome/CNPJ (API real de busca — sem query ela só devolve uma
 * amostra pequena, então passe o termo digitado pra alcançar clientes fora
 * dos primeiros resultados).
 */
export function useClients(q: string = "") {
  return useQuery({
    queryKey: ["clients", q],
    queryFn: async () => {
      try {
        return await apiGet<TaskrowClient[]>("/api/v1/Search/SearchClients", { q, showInactives: false });
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
