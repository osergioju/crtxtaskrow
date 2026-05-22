import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ZONE_CONFIG, scoreToZone } from "@/lib/capacityEngine";
import type { UserCapacityBreakdown } from "@/types/capacity";
import type { CapacityPeriod } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface UserRowProps {
  user: UserCapacityBreakdown;
  periods: CapacityPeriod[];
}

function UserRow({ user, periods }: UserRowProps) {
  const peakZone = scoreToZone(user.byPeriod.find(p => p.key === user.peakMonth)?.score || 0);
  const peakCfg = ZONE_CONFIG[peakZone];

  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      {/* User info */}
      <div className="w-28 shrink-0">
        <p className="text-sm font-semibold truncate">{user.login}</p>
        <p className="text-[0.6rem] text-muted-foreground">{user.avgMonthly} /mês avg</p>
      </div>

      {/* Mini heatmap cells */}
      <div className="flex gap-1 flex-1">
        {periods.map(period => {
          const periodData = user.byPeriod.find(p => p.key === period.key);
          const count = periodData?.taskCount || 0;
          const score = periodData?.score || 0;
          const zone = scoreToZone(score);
          const cfg = ZONE_CONFIG[zone];
          const isEmpty = count === 0;

          return (
            <Tooltip key={period.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex-1 h-7 rounded-md flex items-center justify-center text-[0.55rem] font-bold transition-all",
                    isEmpty
                      ? "bg-muted/30 text-muted-foreground/40"
                      : [cfg.bgClass, cfg.textClass, "cursor-default hover:brightness-95"]
                  )}
                >
                  {count > 0 ? count : "—"}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-semibold">{user.login} · {period.label}</p>
                <p className="text-xs">{count} tarefas · {score}% carga</p>
                {periodData?.isOverloaded && (
                  <p className="text-xs text-destructive font-semibold">⚠ Sobrecarregado</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Total + peak */}
      <div className="shrink-0 text-right w-20">
        <p className="text-sm font-bold">{user.totalTasks}</p>
        {user.overloadedMonths > 0 && (
          <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 border-destructive/30 text-destructive bg-destructive/5">
            {user.overloadedMonths}× overload
          </Badge>
        )}
      </div>
    </div>
  );
}

interface CapacityUserPanelProps {
  users: UserCapacityBreakdown[];
  periods: CapacityPeriod[];
  isLoading?: boolean;
}

export function CapacityUserPanel({ users, periods, isLoading }: CapacityUserPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  const visibleUsers = users.filter(u => u.totalTasks > 0).slice(0, 15);

  return (
    <div className="space-y-2">
      {/* Period header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="w-28 shrink-0" />
        <div className="flex gap-1 flex-1">
          {periods.map(p => (
            <div
              key={p.key}
              className={cn(
                "flex-1 text-center text-[0.55rem] font-bold uppercase tracking-wide truncate",
                p.isCurrentMonth ? "text-primary" : "text-muted-foreground"
              )}
            >
              {p.label.slice(0, 3)}
            </div>
          ))}
        </div>
        <div className="w-20 text-right text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground shrink-0">
          Total
        </div>
      </div>

      {visibleUsers.map(u => (
        <UserRow key={u.userID} user={u} periods={periods} />
      ))}

      {visibleUsers.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado disponível</p>
      )}
    </div>
  );
}
