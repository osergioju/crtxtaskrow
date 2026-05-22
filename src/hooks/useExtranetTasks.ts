import { useMemo } from "react";
import { useAllTasks } from "./useAllTasks";
import { useClients } from "./useClients";
import { groupTasksByExtranetStep, buildClientSummary } from "@/lib/extranet";
import type { TaskrowTask, TaskrowClient } from "@/types/taskrow";
import type { ExtranetClientSummary } from "@/types/extranet";

export function useExtranetTasks(clientID?: number | null) {
  const { data: allTasks, isLoading, error, refetch } = useAllTasks();
  const { data: clients } = useClients();

  const filteredTasks = useMemo((): TaskrowTask[] => {
    if (!allTasks) return [];
    if (!clientID) return allTasks;
    return allTasks.filter(t => t.clientID === clientID);
  }, [allTasks, clientID]);

  const byStep = useMemo(() => groupTasksByExtranetStep(filteredTasks), [filteredTasks]);

  const clientSummaries = useMemo((): ExtranetClientSummary[] => {
    if (!allTasks) return [];
    const byClient = new Map<number, TaskrowTask[]>();
    allTasks.forEach(t => {
      const arr = byClient.get(t.clientID) || [];
      arr.push(t);
      byClient.set(t.clientID, arr);
    });
    return Array.from(byClient.entries())
      .map(([cid, tasks]) => {
        const client = (clients as TaskrowClient[] | undefined)?.find(c => c.ClientID === cid);
        return buildClientSummary(
          cid,
          client?.ClientName || tasks[0]?.clientDisplayName || `Cliente ${cid}`,
          client?.ClientNickName || tasks[0]?.clientNickName || "",
          tasks
        );
      })
      .sort((a, b) => b.pendingApproval - a.pendingApproval || b.totalTasks - a.totalTasks);
  }, [allTasks, clients]);

  return {
    tasks: filteredTasks,
    byStep,
    clientSummaries,
    isLoading,
    error,
    refetch,
  };
}
