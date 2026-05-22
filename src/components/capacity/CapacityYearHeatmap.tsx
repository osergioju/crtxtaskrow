import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CapacityZonePill } from "./CapacityZonePill";
import { ZONE_CONFIG } from "@/lib/capacityEngine";
import type { PeriodCapacityScore } from "@/types/capacity";
import { cn } from "@/lib/utils";

// ─── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, zone }: { score: number; zone: PeriodCapacityScore["zone"] }) {
  const cfg = ZONE_CONFIG[zone];
  return (
    <div className="w-full h-1.5 rounded-full bg-black/5 overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all duration-500", cfg.barClass)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

// ─── Month Cell ────────────────────────────────────────────────────────────────

interface MonthCellProps {
  ps: PeriodCapacityScore;
  isSelected: boolean;
  onClick: () => void;
}

function MonthCell({ ps, isSelected, onClick }: MonthCellProps) {
  const cfg = ZONE_CONFIG[ps.zone];
  const isEmpty = ps.totalTasks === 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            "relative flex flex-col gap-2 rounded-xl border p-3.5 text-left",
            "transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
            isEmpty ? "border-dashed border-border bg-card opacity-60" : [cfg.bgClass, cfg.borderClass],
            isSelected && "ring-2 ring-offset-1 ring-primary shadow-md",
            ps.period.isCurrentMonth && !isSelected && "ring-1 ring-primary/40",
          )}
          onClick={onClick}
        >
          {/* Current month marker */}
          {ps.period.isCurrentMonth && (
            <span className="absolute top-2 right-2 flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          )}

          {/* Month name */}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              {ps.period.label}
            </p>
            {ps.period.isFuture && !ps.period.isCurrentMonth && (
              <p className="text-[0.55rem] text-muted-foreground/60 uppercase tracking-wide">futuro</p>
            )}
          </div>

          {/* Score */}
          {isEmpty ? (
            <p className="text-sm text-muted-foreground/50">—</p>
          ) : (
            <>
              <p className={cn("text-2xl font-bold leading-none", cfg.textClass)}>
                {ps.score}
                <span className="text-sm font-semibold opacity-70">%</span>
              </p>
              <ScoreBar score={ps.score} zone={ps.zone} />
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-[0.6rem] text-muted-foreground">{ps.totalTasks} tarefas</p>
                <CapacityZonePill zone={ps.zone} size="xs" showDot={false} />
              </div>
            </>
          )}

          {/* Overload indicator */}
          {ps.topUsers.some(u => u.isOverloaded) && (
            <div className="absolute bottom-2 right-2">
              <span className="text-[0.6rem] font-bold text-destructive" title="Usuário sobrecarregado">⚠</span>
            </div>
          )}
        </button>
      </TooltipTrigger>
      {!isEmpty && (
        <TooltipContent side="top" className="max-w-[220px] space-y-1.5 text-xs">
          <p className="font-bold">{ps.period.label} — {ps.score}%</p>
          <p>{ps.totalTasks} tarefas · {ps.activeUsers} usuários ativos</p>
          {ps.overdueCount > 0 && <p className="text-destructive">⚡ {ps.overdueCount} em atraso</p>}
          {ps.approvalCount > 0 && <p className="text-violet-600">⏳ {ps.approvalCount} em aprovação</p>}
          {ps.alerts.length > 0 && (
            <p className="text-amber-600">🔔 {ps.alerts.length} alerta{ps.alerts.length > 1 ? "s" : ""}</p>
          )}
          {ps.topUsers.slice(0, 3).map(u => (
            <p key={u.login} className={cn(u.isOverloaded && "text-destructive font-semibold")}>
              {u.isOverloaded ? "⚠ " : "• "}{u.login}: {u.count} tarefas
            </p>
          ))}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function HeatmapLegend() {
  const zones: PeriodCapacityScore["zone"][] = ["healthy", "attention", "heavy", "critical", "collapse"];
  const ranges = ["0–35%", "36–55%", "56–75%", "76–90%", "91–100%"];
  return (
    <div className="flex flex-wrap gap-3">
      {zones.map((z, i) => {
        const cfg = ZONE_CONFIG[z];
        return (
          <div key={z} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", cfg.dotClass)} />
            <span className="text-[0.65rem] text-muted-foreground">
              {cfg.label} <span className="opacity-60">{ranges[i]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CapacityYearHeatmapProps {
  scores: PeriodCapacityScore[];
  selectedPeriodKey: string | null;
  onSelectPeriod: (key: string) => void;
  isLoading?: boolean;
}

export function CapacityYearHeatmap({ scores, selectedPeriodKey, onSelectPeriod, isLoading }: CapacityYearHeatmapProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {scores.map(ps => (
          <MonthCell
            key={ps.period.key}
            ps={ps}
            isSelected={selectedPeriodKey === ps.period.key}
            onClick={() => onSelectPeriod(ps.period.key === selectedPeriodKey ? "" : ps.period.key)}
          />
        ))}
      </div>
      <HeatmapLegend />
    </div>
  );
}
