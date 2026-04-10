import type { TaskrowTask } from "@/types/taskrow";

export function calcRiskScore(tasks: TaskrowTask[]): number {
  const open = tasks.filter(t => !t.closed);
  const overdue = open.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
  const urgent = open.filter(t => (t.tags || "").toLowerCase().includes("urgente")).length;
  const rework = open.filter(t => (t.tags || "").toLowerCase().includes("retrabalho")).length;
  return Math.round((overdue * 2) + (urgent * 3) + (rework * 1.5));
}

export function getRiskLevel(score: number): "critico" | "atencao" | "ok" {
  if (score > 80) return "critico";
  if (score > 30) return "atencao";
  return "ok";
}
