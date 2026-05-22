import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronRight, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import type { ExtranetClientSummary } from "@/types/extranet";
import { cn } from "@/lib/utils";

interface ClientCardProps {
  summary: ExtranetClientSummary;
  onClick: () => void;
}

function ClientCard({ summary, onClick }: ClientCardProps) {
  const { clientName, clientNickName, totalTasks, pctFinalizada, pendingApproval, inProgress } = summary;

  const urgency = pendingApproval > 5 ? "high" : pendingApproval > 0 ? "medium" : "low";

  return (
    <Card
      className={cn(
        "cursor-pointer border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
        urgency === "high" && "border-violet-200 bg-violet-50/20",
        urgency === "medium" && "border-violet-100"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
              urgency === "high" ? "bg-violet-100 text-violet-700" : "bg-muted text-muted-foreground"
            )}>
              {(clientNickName || clientName).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{clientName}</p>
              <p className="text-[0.65rem] text-muted-foreground">{totalTasks} tarefas</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[0.65rem]">
            <span className="text-muted-foreground">Concluídas</span>
            <span className="font-semibold text-emerald-600">{pctFinalizada}%</span>
          </div>
          <Progress value={pctFinalizada} className="h-1.5" />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {pendingApproval > 0 && (
            <Badge variant="outline" className={cn("text-[0.6rem] px-1.5 h-4", EXTRANET_COLUMN_CONFIG["Aprovação"].badgeClass)}>
              <Clock className="h-2.5 w-2.5 mr-1" />
              {pendingApproval} aprovação
            </Badge>
          )}
          {inProgress > 0 && (
            <Badge variant="outline" className={cn("text-[0.6rem] px-1.5 h-4", EXTRANET_COLUMN_CONFIG["Fazendo"].badgeClass)}>
              ⚡ {inProgress} produção
            </Badge>
          )}
          {pendingApproval === 0 && inProgress === 0 && (
            <span className="text-[0.6rem] text-muted-foreground">Sem pendências</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ExtranetClientOverviewProps {
  summaries: ExtranetClientSummary[];
  isLoading?: boolean;
  onSelect: (clientID: number) => void;
}

export function ExtranetClientOverview({ summaries, isLoading, onSelect }: ExtranetClientOverviewProps) {
  const totalApproval = useMemo(() => summaries.reduce((s, c) => s + c.pendingApproval, 0), [summaries]);
  const totalTasks = useMemo(() => summaries.reduce((s, c) => s + c.totalTasks, 0), [summaries]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aggregate banner */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{summaries.length}</p>
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Clientes</p>
        </Card>
        <Card className={cn("border p-3 text-center", totalApproval > 0 ? "bg-violet-50 border-violet-200" : "bg-card")}>
          <p className={cn("text-2xl font-bold", totalApproval > 0 ? "text-violet-600" : "text-foreground")}>
            {totalApproval}
          </p>
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Aprovações</p>
        </Card>
        <Card className="bg-card border p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{totalTasks}</p>
          <p className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Tarefas</p>
        </Card>
      </div>

      {/* Client grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summaries.map(s => (
          <ClientCard
            key={s.clientID}
            summary={s}
            onClick={() => onSelect(s.clientID)}
          />
        ))}
      </div>

      {summaries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum cliente encontrado</p>
        </div>
      )}
    </div>
  );
}
