import { TrendingUp, TrendingDown, Minus, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CapacityZonePill } from "./CapacityZonePill";
import { ZONE_CONFIG } from "@/lib/capacityEngine";
import type { ForecastPoint, PeriodCapacityScore } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface ForecastBarProps {
  point: ForecastPoint;
  maxScore: number;
  onClick?: () => void;
}

function ForecastBar({ point, maxScore, onClick }: ForecastBarProps) {
  const cfg = ZONE_CONFIG[point.zone];
  const heightPct = maxScore > 0 ? (point.projectedScore / Math.max(maxScore, 100)) * 100 : 0;
  const isProjection = point.basis === "projection";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 flex-1 min-w-[50px]",
        onClick && "cursor-pointer group"
      )}
      onClick={onClick}
    >
      {/* Score label */}
      <span className={cn("text-[0.65rem] font-bold", cfg.textClass)}>
        {point.projectedScore}%
      </span>

      {/* Bar */}
      <div className="w-full flex flex-col justify-end h-24 rounded-t-sm overflow-hidden bg-muted/30 relative">
        <div
          className={cn(
            "w-full rounded-t-sm transition-all duration-500",
            cfg.barClass,
            isProjection && "opacity-50 border-2 border-dashed border-current"
          )}
          style={{ height: `${heightPct}%` }}
        />
        {isProjection && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[0.55rem] text-muted-foreground/60 font-semibold rotate-90 whitespace-nowrap">
              projeção
            </span>
          </div>
        )}
      </div>

      {/* Label */}
      <span className={cn("text-[0.6rem] text-center leading-tight", isProjection ? "text-muted-foreground/60" : "text-muted-foreground")}>
        {point.label.slice(0, 6)}
      </span>
    </div>
  );
}

interface NarrativeCardProps {
  points: ForecastPoint[];
  currentMonthScore: number;
}

function NarrativeCards({ points, currentMonthScore }: NarrativeCardProps) {
  const future = points.filter(p => p.basis === "data" && p.projectedScore > 0 || p.basis === "projection");
  const criticalMonths = future.filter(p => p.zone === "critical" || p.zone === "collapse");
  const avgFuture = future.length > 0
    ? Math.round(future.reduce((s, p) => s + p.projectedScore, 0) / future.length)
    : 0;

  const trend = future.length >= 2
    ? future[future.length - 1].projectedScore - future[0].projectedScore
    : 0;

  const TrendIcon = trend > 5 ? TrendingUp : trend < -5 ? TrendingDown : Minus;
  const trendColor = trend > 5 ? "text-destructive" : trend < -5 ? "text-emerald-600" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-3.5">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Média Futura
        </p>
        <div className="flex items-end gap-2">
          <p className={cn("text-2xl font-bold", ZONE_CONFIG[points.find(p => p.projectedScore === avgFuture)?.zone || "attention"].textClass)}>
            {avgFuture}<span className="text-base">%</span>
          </p>
        </div>
        <CapacityZonePill zone={ZONE_CONFIG[points.find(p => Math.abs(p.projectedScore - avgFuture) < 5)?.zone || "attention"].label === ZONE_CONFIG.attention.label ? "attention" : "heavy"} size="xs" />
      </div>

      <div className={cn(
        "rounded-xl border p-3.5",
        criticalMonths.length > 0 ? "border-destructive/20 bg-destructive/5" : "bg-card border-border"
      )}>
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Meses Críticos
        </p>
        <p className={cn("text-2xl font-bold", criticalMonths.length > 0 ? "text-destructive" : "text-emerald-600")}>
          {criticalMonths.length}
        </p>
        <p className="text-[0.65rem] text-muted-foreground mt-0.5">
          {criticalMonths.length > 0
            ? criticalMonths.slice(0, 2).map(p => p.label).join(", ")
            : "Nenhum previsto"}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-3.5">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Tendência
        </p>
        <div className="flex items-center gap-2">
          <TrendIcon className={cn("h-5 w-5", trendColor)} />
          <p className={cn("text-2xl font-bold", trendColor)}>
            {trend > 0 ? "+" : ""}{trend}%
          </p>
        </div>
        <p className="text-[0.65rem] text-muted-foreground mt-0.5">
          {trend > 10 ? "Aceleração preocupante" : trend > 0 ? "Leve crescimento" : trend < 0 ? "Aliviando" : "Estável"}
        </p>
      </div>
    </div>
  );
}

interface CapacityForecastProps {
  forecast: ForecastPoint[];
  isLoading?: boolean;
  onSelectPeriod?: (key: string) => void;
}

export function CapacityForecast({ forecast, isLoading, onSelectPeriod }: CapacityForecastProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (forecast.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Eye className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Sem dados suficientes para previsão</p>
      </div>
    );
  }

  const maxScore = Math.max(...forecast.map(p => p.projectedScore), 10);
  const currentScore = forecast.find(p => p.basis === "data")?.projectedScore || 0;

  return (
    <div className="space-y-4">
      <NarrativeCards points={forecast} currentMonthScore={currentScore} />

      {/* Bar chart */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Evolução da capacidade
        </p>
        <div className="flex gap-2 items-end">
          {forecast.map(point => (
            <ForecastBar
              key={point.periodKey}
              point={point}
              maxScore={maxScore}
              onClick={() => onSelectPeriod?.(point.periodKey)}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-[0.6rem] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-primary/40" />
            Dados reais
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-muted border border-dashed border-muted-foreground/30" />
            Projeção
          </span>
        </div>
      </div>
    </div>
  );
}
