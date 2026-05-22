import { CheckCircle2, Clock, Zap, PauseCircle, ListChecks, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExtranetClientSummary } from "@/types/extranet";

interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  colorClass: string;
  bgClass: string;
  pulse?: boolean;
  onClick?: () => void;
}

function KpiTile({ icon, label, value, sub, colorClass, bgClass, pulse, onClick }: KpiTileProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border transition-all duration-150 p-4",
        bgClass,
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {label}
          </p>
          <p className={cn("text-3xl font-bold leading-none", colorClass)}>
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-[0.65rem] text-muted-foreground">{sub}</p>
          )}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", bgClass === "bg-card" ? "bg-muted" : "bg-white/60")}>
          <span className={colorClass}>{icon}</span>
        </div>
      </div>

      {pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", colorClass.replace("text-", "bg-"))} />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", colorClass.replace("text-", "bg-"))} />
        </span>
      )}
    </Card>
  );
}

interface ExtranetKPIsProps {
  summary: ExtranetClientSummary;
  onStepClick?: (step: string) => void;
}

export function ExtranetKPIs({ summary, onStepClick }: ExtranetKPIsProps) {
  const { totalTasks, pendingApproval, inProgress, standBy, pctFinalizada, byStep } = summary;
  const activeNonFinal = totalTasks - byStep["Finalizada"];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiTile
        icon={<ListChecks className="h-4 w-4" />}
        label="Total"
        value={totalTasks}
        sub="tarefas no período"
        colorClass="text-foreground"
        bgClass="bg-card"
      />
      <KpiTile
        icon={<Clock className="h-4 w-4" />}
        label="Aprovação"
        value={pendingApproval}
        sub={pendingApproval > 0 ? "aguardam sua ação" : "nenhuma pendente"}
        colorClass="text-violet-600"
        bgClass="bg-violet-50"
        pulse={pendingApproval > 0}
        onClick={pendingApproval > 0 ? () => onStepClick?.("Aprovação") : undefined}
      />
      <KpiTile
        icon={<Zap className="h-4 w-4" />}
        label="Em Produção"
        value={inProgress}
        sub="trabalhando agora"
        colorClass="text-indigo-600"
        bgClass="bg-indigo-50"
        onClick={() => onStepClick?.("Fazendo")}
      />
      <KpiTile
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Concluídas"
        value={byStep["Finalizada"]}
        sub={`${pctFinalizada}% do total`}
        colorClass="text-emerald-600"
        bgClass="bg-emerald-50"
        onClick={() => onStepClick?.("Finalizada")}
      />
      <KpiTile
        icon={<TrendingUp className="h-4 w-4" />}
        label="Andamento"
        value={activeNonFinal}
        sub="tarefas em aberto"
        colorClass="text-sky-600"
        bgClass="bg-sky-50"
      />
      <KpiTile
        icon={<PauseCircle className="h-4 w-4" />}
        label="Em Espera"
        value={standBy}
        sub="stand by"
        colorClass="text-slate-500"
        bgClass="bg-slate-50"
        onClick={standBy > 0 ? () => onStepClick?.("StandBy") : undefined}
      />
    </div>
  );
}
