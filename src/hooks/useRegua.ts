import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LocalRulerTask, ReguaState } from "@/types/regua";

async function reguaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || "Erro na requisição");
  return data as T;
}

export function useRegua() {
  return useQuery<ReguaState>({
    queryKey: ["regua"],
    queryFn: () => reguaFetch<ReguaState>("/api/regua"),
    staleTime: 1000 * 30,
  });
}

interface CreateLocalTaskInput {
  title: string;
  description?: string;
  ownerUserID: number | null;
  dueDate: string;
}

export function useCreateLocalRulerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLocalTaskInput) =>
      reguaFetch<LocalRulerTask>("/api/regua/tasks", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regua"] }),
  });
}

export function useUpdateLocalRulerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<LocalRulerTask> & { id: string }) =>
      reguaFetch<LocalRulerTask>(`/api/regua/tasks/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regua"] }),
  });
}

export function useDeleteLocalRulerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reguaFetch<{ ok: true }>(`/api/regua/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regua"] }),
  });
}

export function useSetBucketPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bucket, order }: { bucket: string; order: string[] }) =>
      reguaFetch<{ ok: true }>(`/api/regua/priorities/${encodeURIComponent(bucket)}`, {
        method: "PUT",
        body: JSON.stringify({ order }),
      }),
    // Otimista: aplica a nova ordem no cache assim que o drag solta, sem esperar
    // o servidor responder — senão o card "volta" por um instante até a resposta.
    onMutate: ({ bucket, order }) => {
      const previous = qc.getQueryData<ReguaState>(["regua"]);
      qc.setQueryData<ReguaState | undefined>(["regua"], (prev) =>
        prev ? { ...prev, priorities: { ...prev.priorities, [bucket]: order } } : prev
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["regua"], ctx.previous);
    },
  });
}
