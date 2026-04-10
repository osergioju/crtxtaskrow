import type { TaskrowTask, TaskStatus } from "@/types/taskrow";

export function classifyTask(task: TaskrowTask): TaskStatus {
  if (task.closed) return "concluida";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = task.dueDate ? new Date(task.dueDate) : null;
  const tags = (task.tags || "").toLowerCase();
  const pipeline = (task.pipelineStep || "").toLowerCase();

  const isUrgent = tags.includes("urgente") || pipeline.includes("urgente");
  const isRework = tags.includes("retrabalho") || pipeline.includes("retrabalho");
  const isBacklog = !due || pipeline.includes("backlog") || pipeline.includes("aguardando") || pipeline === "";
  const isOverdue = due && due < today;

  if (isUrgent) return "urgente";
  if (isRework) return "retrabalho";
  if (isBacklog) return "backlog";
  if (isOverdue) return "atraso";
  return "em_dia";
}

export function getStatusLabel(s: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    andamento: "Em Andamento",
    backlog: "Backlog",
    atraso: "Em Atraso",
    em_dia: "Em Dia",
    retrabalho: "Retrabalho",
    urgente: "Urgente",
    concluida: "Concluída",
  };
  return labels[s];
}

export function getStatusColor(s: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    andamento: "#6366F1",
    backlog: "#F59E0B",
    atraso: "#EF4444",
    em_dia: "#10B981",
    retrabalho: "#F97316",
    urgente: "#111827",
    concluida: "#10B981",
  };
  return colors[s];
}
