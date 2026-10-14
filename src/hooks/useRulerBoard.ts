import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, subMonths } from "date-fns";
import { fetchAllTasks } from "@/lib/api";
import { useUsers } from "@/hooks/useUsers";
import { useRegua, useSetBucketPriority } from "@/hooks/useRegua";
import { rulerItemKey } from "@/types/regua";
import type { TaskrowTask, TaskrowUser } from "@/types/taskrow";
import type { LocalRulerTask } from "@/types/regua";

export const OVERDUE_BUCKET = "overdue";

export interface RulerItem {
  key: string; // "taskrow:<taskID>" | "local:<id>"
  origin: "taskrow" | "local";
  title: string;
  ownerUserID: number | null;
  ownerName: string;
  area: string;
  clientName: string;
  taskrowTask: TaskrowTask | null;
  localTask: LocalRulerTask | null;
}

export interface RulerBucket {
  key: string; // yyyy-mm-dd | "overdue"
  date: Date | null; // null para o balde "Atrasadas"
  items: RulerItem[];
}

/** Fetch independente do filtro global de datas do dashboard — a régua olha pra frente. */
function useRulerTasks(windowDays: number) {
  const today = format(new Date(), "yyyy-MM-dd");
  const endDate = format(addDays(new Date(), windowDays - 1), "yyyy-MM-dd");
  // Janela ampla pra trás: pega qualquer tarefa aberta vencida, mesmo antiga.
  const startDate = format(subMonths(new Date(), 6), "yyyy-MM-dd");

  return useQuery<TaskrowTask[]>({
    queryKey: ["ruler-tasks", startDate, endDate],
    // Closed: null (não Closed: false) — o resto do projeto já usa "null" e filtra
    // task.closed no cliente; não há confirmação de que a API aceite "false".
    queryFn: () => fetchAllTasks({ StartDate: startDate, EndDate: endDate, Closed: null }),
    staleTime: 1000 * 60 * 2,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

function orderItems(items: RulerItem[], order: string[] | undefined): RulerItem[] {
  if (!order || order.length === 0) return items;
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.key) ? rank.get(b.key)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export function useRulerBoard(windowDays: number) {
  const { data: tasks, isLoading: loadingTasks, error } = useRulerTasks(windowDays);
  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: regua, isLoading: loadingRegua } = useRegua();
  const setBucketPriority = useSetBucketPriority();

  const userMap = useMemo(() => {
    const map = new Map<number, TaskrowUser>();
    (users || []).forEach((u) => map.set(u.UserID, u));
    return map;
  }, [users]);

  const buckets = useMemo<RulerBucket[]>(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const dayKeys: string[] = [];
    for (let i = 0; i < windowDays; i++) dayKeys.push(format(addDays(new Date(), i), "yyyy-MM-dd"));

    const byBucket = new Map<string, RulerItem[]>([[OVERDUE_BUCKET, []], ...dayKeys.map((k) => [k, []] as [string, RulerItem[]])]);

    (tasks || []).forEach((t) => {
      if (t.closed || !t.dueDate) return;
      const day = t.dueDate.slice(0, 10);
      const bucketKey = day < todayStr ? OVERDUE_BUCKET : day;
      if (!byBucket.has(bucketKey)) return; // fora da janela visível
      const owner = userMap.get(t.ownerUserID);
      byBucket.get(bucketKey)!.push({
        key: rulerItemKey("taskrow", t.taskID),
        origin: "taskrow",
        title: t.taskTitle,
        ownerUserID: t.ownerUserID,
        ownerName: owner?.FullName || t.ownerUserLogin || "Sem responsável",
        area: owner?.FunctionGroupName || "Sem Área",
        clientName: t.clientDisplayName,
        taskrowTask: t,
        localTask: null,
      });
    });

    (regua?.localTasks || []).forEach((lt) => {
      const bucketKey = lt.dueDate < todayStr ? OVERDUE_BUCKET : lt.dueDate;
      if (!byBucket.has(bucketKey)) return;
      const owner = lt.ownerUserID != null ? userMap.get(lt.ownerUserID) : undefined;
      byBucket.get(bucketKey)!.push({
        key: rulerItemKey("local", lt.id),
        origin: "local",
        title: lt.title,
        ownerUserID: lt.ownerUserID,
        ownerName: owner?.FullName || "Sem responsável",
        area: owner?.FunctionGroupName || "Sem Área",
        clientName: "",
        taskrowTask: null,
        localTask: lt,
      });
    });

    return [OVERDUE_BUCKET, ...dayKeys].map((key) => ({
      key,
      date: key === OVERDUE_BUCKET ? null : new Date(`${key}T00:00:00`),
      items: orderItems(byBucket.get(key) || [], regua?.priorities?.[key]),
    }));
  }, [tasks, regua, userMap, windowDays]);

  const reorderBucket = (bucketKey: string, newItems: RulerItem[]) => {
    setBucketPriority.mutate({ bucket: bucketKey, order: newItems.map((i) => i.key) });
  };

  return {
    buckets,
    isLoading: loadingTasks || loadingUsers || loadingRegua,
    error,
    reorderBucket,
    users: users || [],
  };
}
