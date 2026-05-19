import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineHistoryEntry {
  id: string;
  task_id: number;
  pipeline_step: string;
  entered_at: string;
  exited_at: string | null;
  is_client_blocking: boolean;
  created_at: string;
}

/** Busca todo o histórico de pipeline de uma lista de task IDs (máx 500 por vez). */
export function usePipelineHistory(taskIds: number[]) {
  return useQuery({
    queryKey: ["pipeline_history", taskIds.slice().sort().join(",")],
    queryFn: async (): Promise<PipelineHistoryEntry[]> => {
      if (!taskIds.length) return [];

      const CHUNK = 500;
      const all: PipelineHistoryEntry[] = [];

      for (let i = 0; i < taskIds.length; i += CHUNK) {
        const chunk = taskIds.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("pipeline_history")
          .select("*")
          .in("task_id", chunk)
          .order("entered_at", { ascending: true });

        if (error) throw error;
        if (data) all.push(...(data as PipelineHistoryEntry[]));
      }

      return all;
    },
    staleTime: 1000 * 60 * 5,
    enabled: taskIds.length > 0,
  });
}
