import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Zap, Users, PauseCircle, TrendingUp
} from "lucide-react";
import { ZONE_CONFIG } from "@/lib/capacityEngine";
import { CapacityZonePill } from "./CapacityZonePill";
import type { PeriodCapacityScore } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  colorClass?: string;
}

function StatRow({ icon, label, value, sub, colorClass }: StatRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <div className="text-right">
        <span className={cn("text-sm font-bold", colorClass || "text-foreground")}>{value}</span>
        {sub && <p className="text-[0.6rem] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

interface CapacityMonthDetailProps {
  ps: PeriodCapacityScore;
}

export function CapacityMonthDetail({ ps }: CapacityMonthDetailProps) {
  const cfg = ZONE_CONFIG[ps.zone];

  const topClient = ps.topClients[0];
  const topUser = ps.topUsers[0];

  const capacityUsedPct = Math.min(
    Math.round((ps.weightedLoad / ps.theoreticalCapacity) * 100), 100
  );

  return (
    <Card className={cn("border", cfg.borderClass)}>
      <CardHeader className={cn("pb-3 rounded-t-lg", cfg.bgClass)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Detalhe do Período
            </p>
            <h3 className="text-xl font-bold mt-0.5">{ps.period.label}</h3>
          </div>
          <div className="text-right">
            <p className={cn("text-4xl font-bold leading-none", cfg.textClass)}>
              {ps.score}<span className="text-xl">%</span>
            </p>
            <CapacityZonePill zone={ps.zone} size="xs" />
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-3">
          <Progress value={ps.score} className="h-2" />
          <div className="flex justify-between mt-1 text-[0.6rem] text-muted-foreground">
            <span>0%</span>
            <span>Capacidade máxima teórica</span>
            <span>100%</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-1">
        {/* Key stats */}
        <StatRow
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Tarefas concluídas"
          value={ps.closedCount}
          sub={`${ps.completionRate * 100 | 0}% do total`}
          colorClass="text-emerald-600"
        />
        <Separator className="my-0.5" />
        <StatRow
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Tarefas em aberto"
          value={ps.openCount}
          colorClass={ps.openCount > 50 ? "text-amber-600" : "text-foreground"}
        />
        <StatRow
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Em atraso"
          value={ps.overdueCount}
          sub={ps.overdueCount > 0 ? `${Math.round(ps.overdueRate * 100)}% do total` : undefined}
          colorClass={ps.overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}
        />
        <StatRow
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Aguardando aprovação"
          value={ps.approvalCount}
          colorClass={ps.approvalCount > 10 ? "text-violet-600" : "text-foreground"}
        />
        <StatRow
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          label="Retrabalho"
          value={ps.reworkCount}
          colorClass={ps.reworkCount > 3 ? "text-orange-600" : "text-foreground"}
        />
        <StatRow
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Urgentes"
          value={ps.urgentCount}
          colorClass={ps.urgentCount > 5 ? "text-destructive" : "text-foreground"}
        />
        <StatRow
          icon={<PauseCircle className="h-3.5 w-3.5" />}
          label="Stand by"
          value={ps.standByCount}
          colorClass="text-muted-foreground"
        />

        <Separator className="my-2" />

        <StatRow
          icon={<Users className="h-3.5 w-3.5" />}
          label="Usuários ativos"
          value={ps.activeUsers}
          sub={`Capacidade: ${ps.theoreticalCapacity} tarefas`}
        />

        {/* Capacity used */}
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Carga ponderada</span>
            <span className={cn("font-semibold", cfg.textClass)}>{capacityUsedPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", cfg.barClass)}
              style={{ width: `${capacityUsedPct}%` }}
            />
          </div>
          <p className="text-[0.6rem] text-muted-foreground">
            {ps.weightedLoad.toFixed(1)} pontos ponderados / {ps.theoreticalCapacity} capacidade
          </p>
        </div>

        {/* Top user */}
        {topUser && (
          <div className="mt-3 rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              Maior carga
            </p>
            <div className="flex items-center justify-between">
              <span className={cn("text-sm font-medium", topUser.isOverloaded && "text-destructive")}>
                {topUser.isOverloaded && "⚠ "}{topUser.login}
              </span>
              <Badge variant="outline" className={cn(
                "text-xs",
                topUser.isOverloaded ? "border-destructive/30 text-destructive bg-destructive/5" : ""
              )}>
                {topUser.count} tarefas
              </Badge>
            </div>
          </div>
        )}

        {/* Top client */}
        {topClient && (
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-1.5">
              Cliente mais pesado
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{topClient.name}</span>
              <Badge variant="outline" className="text-xs">
                {topClient.count} tarefas
              </Badge>
            </div>
          </div>
        )}

        {/* Alerts for this period */}
        {ps.alerts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Alertas</p>
            {ps.alerts.map(a => (
              <div
                key={a.id}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-xs",
                  a.severity === "critical"
                    ? "border-destructive/20 bg-destructive/5 text-destructive"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                )}
              >
                <p className="font-semibold">{a.title}</p>
                <p className="opacity-80 text-[0.65rem] mt-0.5">{a.description}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
