import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TaskrowTask } from "@/types/taskrow";

export function calcSLA(tasks: TaskrowTask[]): number {
  const done = tasks.filter(t => t.closed && t.closeDate && t.creationDate);
  if (!done.length) return 0;
  const total = done.reduce((sum, t) => {
    const diff = new Date(t.closeDate!).getTime() - new Date(t.creationDate).getTime();
    return sum + diff / 86400000;
  }, 0);
  return +(total / done.length).toFixed(1);
}

export function calcSLATrend(tasks: TaskrowTask[]): Array<{ month: string; sla: number }> {
  const byMonth: Record<string, number[]> = {};
  tasks.filter(t => t.closed && t.closeDate).forEach(t => {
    const key = format(new Date(t.closeDate!), "MM/yyyy", { locale: ptBR });
    const days = (new Date(t.closeDate!).getTime() - new Date(t.creationDate).getTime()) / 86400000;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(days);
  });
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      sla: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1),
    }));
}
