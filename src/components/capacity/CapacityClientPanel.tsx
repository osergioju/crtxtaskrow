import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, RefreshCw } from "lucide-react";
import type { ClientCapacityBreakdown } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface ClientRowProps {
  client: ClientCapacityBreakdown;
  maxTasks: number;
  rank: number;
}

function ClientRow({ client, maxTasks, rank }: ClientRowProps) {
  const pct = maxTasks > 0 ? (client.totalTasks / maxTasks) * 100 : 0;
  const isDominant = client.capacityShare > 20;
  const hasIssues = client.pendingApproval > 5 || client.reworkCount > 2;

  return (
    <div className={cn(
      "rounded-xl border p-3 space-y-2 transition-all",
      isDominant ? "border-amber-200 bg-amber-50/40" : "bg-card border-border"
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[0.6rem] font-bold",
            rank <= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {rank}
          </span>
          <p className="text-sm font-semibold truncate">{client.clientName}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <span className={cn(
            "text-xs font-bold",
            isDominant ? "text-amber-600" : "text-foreground"
          )}>
            {client.capacityShare}%
          </span>
          <span className="text-[0.6rem] text-muted-foreground">da carga</span>
        </div>
      </div>

      <Progress value={pct} className="h-1.5" />

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[0.65rem] text-muted-foreground">{client.totalTasks} tarefas</span>
        {client.pendingApproval > 0 && (
          <span className="flex items-center gap-1 text-[0.65rem] text-violet-600 font-semibold">
            <Clock className="h-2.5 w-2.5" />
            {client.pendingApproval} aprovação
          </span>
        )}
        {client.reworkCount > 0 && (
          <span className="flex items-center gap-1 text-[0.65rem] text-orange-600 font-semibold">
            <RefreshCw className="h-2.5 w-2.5" />
            {client.reworkCount} retrabalho
          </span>
        )}
      </div>
    </div>
  );
}

interface CapacityClientPanelProps {
  clients: ClientCapacityBreakdown[];
  isLoading?: boolean;
}

export function CapacityClientPanel({ clients, isLoading }: CapacityClientPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  const top15 = clients.slice(0, 15);
  const maxTasks = top15[0]?.totalTasks || 1;

  if (top15.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum dado disponível</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary note */}
      {clients[0] && clients[0].capacityShare > 25 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ <strong>{clients[0].clientName}</strong> concentra {clients[0].capacityShare}% da capacidade operacional.
          Considere redistribuir ou negociar prazos.
        </div>
      )}
      {top15.map((c, i) => (
        <ClientRow key={c.clientID} client={c} maxTasks={maxTasks} rank={i + 1} />
      ))}
    </div>
  );
}
