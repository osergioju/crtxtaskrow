import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExtranetTaskCard } from "./ExtranetTaskCard";
import { EXTRANET_STEPS, EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import type { TaskrowTask } from "@/types/taskrow";
import type { ExtranetStep } from "@/types/extranet";
import { cn } from "@/lib/utils";

const VISIBLE_STEPS: ExtranetStep[] = [
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

interface KanbanColumnProps {
  step: ExtranetStep;
  tasks: TaskrowTask[];
  collapsed: boolean;
  onToggle: () => void;
  onTaskClick?: (task: TaskrowTask) => void;
}

function KanbanColumn({ step, tasks, collapsed, onToggle, onTaskClick }: KanbanColumnProps) {
  const config = EXTRANET_COLUMN_CONFIG[step];
  const [showAll, setShowAll] = useState(false);
  const PREVIEW_COUNT = 8;
  const displayed = showAll ? tasks : tasks.slice(0, PREVIEW_COUNT);
  const remaining = tasks.length - PREVIEW_COUNT;

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border transition-all duration-200",
        config.bgClass,
        config.borderClass,
        config.needsAction && "ring-1 ring-violet-300 shadow-violet-100 shadow-sm",
        collapsed ? "w-10 min-w-[2.5rem]" : "min-w-[220px] w-[220px] flex-shrink-0"
      )}
    >
      {/* Column header */}
      <button
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 font-semibold text-xs uppercase tracking-wide w-full text-left transition-colors hover:bg-black/5 rounded-t-xl",
          config.colorClass
        )}
        onClick={onToggle}
        title={collapsed ? `Expandir ${config.label}` : `Recolher ${config.label}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 w-full py-1">
            <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
            <span className="text-[0.6rem] font-bold">{tasks.length}</span>
          </div>
        ) : (
          <>
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", config.dotClass)} />
            <span className="flex-1 truncate">{config.label}</span>
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[0.6rem] px-1.5 py-0 h-4 font-bold border", config.badgeClass)}
            >
              {tasks.length}
            </Badge>
            {config.needsAction && tasks.length > 0 && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
            )}
          </>
        )}
      </button>

      {!collapsed && (
        <ScrollArea className="flex-1 max-h-[calc(100vh-300px)]">
          <div className="px-2 pb-3 space-y-2">
            {tasks.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[0.65rem] text-muted-foreground">Nenhuma tarefa</p>
              </div>
            ) : (
              <>
                {displayed.map(task => (
                  <ExtranetTaskCard
                    key={task.taskID}
                    task={task}
                    compact
                    onClick={() => onTaskClick?.(task)}
                  />
                ))}
                {!showAll && remaining > 0 && (
                  <button
                    className={cn(
                      "w-full py-1.5 text-[0.65rem] font-semibold rounded-lg border transition-colors",
                      config.borderClass, config.colorClass,
                      "hover:bg-white/50"
                    )}
                    onClick={() => setShowAll(true)}
                  >
                    +{remaining} mais
                  </button>
                )}
                {showAll && tasks.length > PREVIEW_COUNT && (
                  <button
                    className={cn(
                      "w-full py-1.5 text-[0.65rem] font-semibold rounded-lg border transition-colors",
                      config.borderClass, config.colorClass,
                      "hover:bg-white/50"
                    )}
                    onClick={() => setShowAll(false)}
                  >
                    Ver menos
                  </button>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

interface ExtranetKanbanProps {
  byStep: Record<ExtranetStep, TaskrowTask[]>;
  isLoading?: boolean;
  onTaskClick?: (task: TaskrowTask) => void;
}

export function ExtranetKanban({ byStep, isLoading, onTaskClick }: ExtranetKanbanProps) {
  const [collapsed, setCollapsed] = useState<Set<ExtranetStep>>(new Set(["Finalizada"]));

  function toggleCollapse(step: ExtranetStep) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-w-[220px] space-y-2">
            <Skeleton className="h-9 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const totalTasks = VISIBLE_STEPS.reduce((sum, s) => sum + byStep[s].length, 0);
  if (totalTasks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-2xl mb-2">📋</p>
        <p className="text-sm font-medium text-muted-foreground">Nenhuma tarefa para exibir</p>
        <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou selecione outro cliente</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {VISIBLE_STEPS.map(step => (
          <KanbanColumn
            key={step}
            step={step}
            tasks={byStep[step]}
            collapsed={collapsed.has(step)}
            onToggle={() => toggleCollapse(step)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
}
