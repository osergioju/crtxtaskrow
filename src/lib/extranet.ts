import type { ExtranetColumnConfig, ExtranetStep, ExtranetClientSummary } from "@/types/extranet";
import type { TaskrowTask } from "@/types/taskrow";

export const EXTRANET_STEPS: ExtranetStep[] = [
  "Input",
  "Backlog",
  "Fazer",
  "Fazendo",
  "Campanhas em andamento",
  "Aprovação",
  "Alteração",
  "StandBy",
  "Finalizada",
];

export const EXTRANET_COLUMN_CONFIG: Record<ExtranetStep, ExtranetColumnConfig> = {
  "Input": {
    step: "Input",
    label: "Input",
    colorClass: "text-sky-600",
    bgClass: "bg-sky-50",
    borderClass: "border-sky-200",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
    dotClass: "bg-sky-500",
    ringClass: "ring-sky-200",
    needsAction: false,
    emoji: "📥",
  },
  "Backlog": {
    step: "Backlog",
    label: "Backlog",
    colorClass: "text-amber-600",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    ringClass: "ring-amber-200",
    needsAction: false,
    emoji: "📋",
  },
  "Fazer": {
    step: "Fazer",
    label: "A Fazer",
    colorClass: "text-blue-600",
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    ringClass: "ring-blue-200",
    needsAction: false,
    emoji: "📝",
  },
  "Fazendo": {
    step: "Fazendo",
    label: "Em Produção",
    colorClass: "text-indigo-600",
    bgClass: "bg-indigo-50",
    borderClass: "border-indigo-200",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500",
    ringClass: "ring-indigo-200",
    needsAction: false,
    emoji: "⚡",
  },
  "Campanhas em andamento": {
    step: "Campanhas em andamento",
    label: "Campanha Ativa",
    colorClass: "text-teal-600",
    bgClass: "bg-teal-50",
    borderClass: "border-teal-200",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    dotClass: "bg-teal-500",
    ringClass: "ring-teal-200",
    needsAction: false,
    emoji: "📣",
  },
  "Aprovação": {
    step: "Aprovação",
    label: "Aguardando Aprovação",
    colorClass: "text-violet-600",
    bgClass: "bg-violet-50",
    borderClass: "border-violet-200",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200",
    dotClass: "bg-violet-500",
    ringClass: "ring-violet-200",
    needsAction: true,
    emoji: "✅",
  },
  "Alteração": {
    step: "Alteração",
    label: "Em Alteração",
    colorClass: "text-orange-600",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-200",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-orange-500",
    ringClass: "ring-orange-200",
    needsAction: false,
    emoji: "🔄",
  },
  "StandBy": {
    step: "StandBy",
    label: "Em Espera",
    colorClass: "text-slate-500",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
    badgeClass: "bg-slate-50 text-slate-600 border-slate-200",
    dotClass: "bg-slate-400",
    ringClass: "ring-slate-200",
    needsAction: false,
    emoji: "⏸",
  },
  "Finalizada": {
    step: "Finalizada",
    label: "Concluída",
    colorClass: "text-emerald-600",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    ringClass: "ring-emerald-200",
    needsAction: false,
    emoji: "🏁",
  },
};

export function getExtranetStep(task: TaskrowTask): ExtranetStep {
  const s = task.extranetPipelineStep;
  if (s && EXTRANET_STEPS.includes(s as ExtranetStep)) return s as ExtranetStep;
  return "Backlog";
}

export function groupTasksByExtranetStep(tasks: TaskrowTask[]): Record<ExtranetStep, TaskrowTask[]> {
  const result = Object.fromEntries(EXTRANET_STEPS.map(s => [s, []])) as Record<ExtranetStep, TaskrowTask[]>;
  tasks.forEach(task => {
    const step = getExtranetStep(task);
    result[step].push(task);
  });
  return result;
}

export function buildClientSummary(
  clientID: number,
  clientName: string,
  clientNickName: string,
  tasks: TaskrowTask[]
): ExtranetClientSummary {
  const byStep = groupTasksByExtranetStep(tasks);
  const stepCounts = Object.fromEntries(
    EXTRANET_STEPS.map(s => [s, byStep[s].length])
  ) as Record<ExtranetStep, number>;

  const total = tasks.length;
  const finalizada = stepCounts["Finalizada"];

  return {
    clientID,
    clientName,
    clientNickName,
    totalTasks: total,
    byStep: stepCounts,
    pctFinalizada: total > 0 ? Math.round((finalizada / total) * 100) : 0,
    pendingApproval: stepCounts["Aprovação"],
    inProgress: stepCounts["Fazendo"] + stepCounts["Campanhas em andamento"],
    standBy: stepCounts["StandBy"],
  };
}

export function filterTasks(tasks: TaskrowTask[], search: string, step: ExtranetStep | "all"): TaskrowTask[] {
  let result = tasks;
  if (step !== "all") {
    result = result.filter(t => getExtranetStep(t) === step);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(t =>
      t.taskTitle.toLowerCase().includes(q) ||
      t.jobTitle.toLowerCase().includes(q) ||
      String(t.taskNumber).includes(q) ||
      (t.jobDisplayTitle || "").toLowerCase().includes(q)
    );
  }
  return result;
}
