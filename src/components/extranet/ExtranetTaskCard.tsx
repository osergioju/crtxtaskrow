import { Calendar, User, ExternalLink, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isPast, isToday, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import { ExtranetStepBadge } from "./ExtranetStepBadge";
import type { TaskrowTask } from "@/types/taskrow";
import type { ExtranetStep } from "@/types/extranet";
import { taskrowLink } from "@/lib/taskrowLink";
import { cn } from "@/lib/utils";

interface ExtranetTaskCardProps {
  task: TaskrowTask;
  compact?: boolean;
  showStep?: boolean;
  showClient?: boolean;
  onClick?: () => void;
}

export function ExtranetTaskCard({ task, compact = false, showStep = false, showClient = false, onClick }: ExtranetTaskCardProps) {
  const step = (task.extranetPipelineStep || "Backlog") as ExtranetStep;
  const config = EXTRANET_COLUMN_CONFIG[step];

  const dueDate = task.dueDate ? parseISO(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && !task.closed;
  const isDueToday = dueDate && isToday(dueDate) && !task.closed;
  const daysLate = isOverdue ? differenceInDays(new Date(), dueDate!) : 0;

  const link = taskrowLink(task);

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card transition-all duration-150",
        "hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        compact ? "p-3" : "p-3.5",
        config.needsAction && "ring-1 ring-violet-300 border-violet-200 bg-violet-50/30",
        isOverdue && "border-destructive/30 bg-destructive/[0.03]",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full", config.dotClass)} />

      <div className="pl-3">
        {/* Title + external link */}
        <div className="flex items-start gap-1.5">
          <p
            className={cn(
              "flex-1 font-medium leading-snug line-clamp-2",
              compact ? "text-xs" : "text-sm",
              task.closed && "line-through text-muted-foreground"
            )}
          >
            {task.taskTitle}
          </p>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity shrink-0 mt-0.5"
            onClick={e => e.stopPropagation()}
            title="Abrir no Taskrow"
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </div>

        {/* Job info */}
        <p className="mt-0.5 text-[0.65rem] text-muted-foreground truncate">
          #{task.taskNumber} · {task.jobDisplayTitle || task.jobTitle}
        </p>

        {showClient && (
          <p className="mt-0.5 text-[0.65rem] font-medium text-primary/70 truncate">
            {task.clientNickName || task.clientDisplayName}
          </p>
        )}

        {!compact && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {showStep && <ExtranetStepBadge step={step} size="xs" />}

            {dueDate && (
              <span className={cn(
                "flex items-center gap-1 text-[0.65rem]",
                isOverdue ? "text-destructive font-semibold" :
                isDueToday ? "text-amber-600 font-semibold" :
                "text-muted-foreground"
              )}>
                {isOverdue ? <Clock className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
                {isOverdue ? `${daysLate}d atraso` : format(dueDate, "dd MMM", { locale: ptBR })}
              </span>
            )}

            {task.ownerUserLogin && (
              <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                <User className="h-2.5 w-2.5" />
                {task.ownerUserLogin}
              </span>
            )}

            {task.requestTypeAcronym && (
              <Badge variant="outline" className="h-4 px-1.5 py-0 text-[0.58rem] font-mono font-semibold">
                {task.requestTypeAcronym}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
