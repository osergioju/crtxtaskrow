import { useMemo } from "react";
import { parseISO, format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, PlusCircle, RefreshCw, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ExtranetStepBadge } from "./ExtranetStepBadge";
import { EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import type { TaskrowTask } from "@/types/taskrow";
import type { ExtranetStep } from "@/types/extranet";
import { cn } from "@/lib/utils";

type ActivityType = "created" | "closed" | "inStep";

interface ActivityItem {
  taskID: number;
  taskNumber: number;
  taskTitle: string;
  jobTitle: string;
  date: Date;
  type: ActivityType;
  step: ExtranetStep;
  user: string;
}

function getActivityIcon(type: ActivityType, step: ExtranetStep) {
  if (type === "closed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (type === "created") return <PlusCircle className="h-3.5 w-3.5 text-sky-500" />;
  if (step === "Aprovação") return <ArrowRight className="h-3.5 w-3.5 text-violet-600" />;
  return <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getActivityLabel(type: ActivityType, step: ExtranetStep) {
  if (type === "closed") return "Finalizada";
  if (type === "created") return "Criada";
  return `Movida para ${EXTRANET_COLUMN_CONFIG[step]?.label || step}`;
}

function groupByDay(items: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const map = new Map<string, ActivityItem[]>();
  items.forEach(item => {
    const key = format(item.date, "yyyy-MM-dd");
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, dayItems]) => {
      const d = parseISO(key);
      const label = isToday(d) ? "Hoje" : isYesterday(d) ? "Ontem" : format(d, "dd 'de' MMMM", { locale: ptBR });
      return { label, items: dayItems.sort((a, b) => b.date.getTime() - a.date.getTime()) };
    });
}

interface ExtranetActivityFeedProps {
  tasks: TaskrowTask[];
  isLoading?: boolean;
  limit?: number;
}

export function ExtranetActivityFeed({ tasks, isLoading, limit = 60 }: ExtranetActivityFeedProps) {
  const grouped = useMemo(() => {
    const items: ActivityItem[] = [];

    tasks.forEach(task => {
      const step = (task.extranetPipelineStep || "Backlog") as ExtranetStep;
      const user = task.ownerUserLogin || "Sistema";
      const jobTitle = task.jobDisplayTitle || task.jobTitle;

      if (task.closed && task.closeDate) {
        items.push({
          taskID: task.taskID,
          taskNumber: task.taskNumber,
          taskTitle: task.taskTitle,
          jobTitle,
          date: parseISO(task.closeDate),
          type: "closed",
          step,
          user,
        });
      }

      if (task.creationDate) {
        items.push({
          taskID: task.taskID,
          taskNumber: task.taskNumber,
          taskTitle: task.taskTitle,
          jobTitle,
          date: parseISO(task.creationDate),
          type: "created",
          step,
          user: task.creationUserLogin || user,
        });
      }

      if (!task.closed && step !== "Backlog" && step !== "Input") {
        const baseDate = task.dueDate
          ? parseISO(task.dueDate)
          : task.creationDate
          ? parseISO(task.creationDate)
          : new Date();
        items.push({
          taskID: task.taskID + 100000,
          taskNumber: task.taskNumber,
          taskTitle: task.taskTitle,
          jobTitle,
          date: baseDate,
          type: "inStep",
          step,
          user,
        });
      }
    });

    return groupByDay(items.slice(0, limit));
  }, [tasks, limit]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-4 w-16" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-3xl mb-2">🕐</span>
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ label, items }) => (
        <div key={label}>
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <div className="space-y-1.5">
            {items.map(item => {
              const config = EXTRANET_COLUMN_CONFIG[item.step];
              return (
                <div
                  key={`${item.taskID}-${item.type}`}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {getActivityIcon(item.type, item.step)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.taskTitle}</p>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="text-[0.6rem] text-muted-foreground">{getActivityLabel(item.type, item.step)}</span>
                      <ExtranetStepBadge step={item.step} size="xs" />
                      <span className="text-[0.6rem] text-muted-foreground">· {item.user}</span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-[0.6rem] text-muted-foreground whitespace-nowrap"
                    title={format(item.date, "dd/MM/yyyy HH:mm")}
                  >
                    {formatDistanceToNow(item.date, { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
