import { useState, useMemo } from "react";
import { ArrowLeft, RefreshCw, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryStates";
import { useExtranetTasks } from "@/hooks/useExtranetTasks";
import { ExtranetKPIs } from "@/components/extranet/ExtranetKPIs";
import { ExtranetKanban } from "@/components/extranet/ExtranetKanban";
import { ExtranetApprovalCenter } from "@/components/extranet/ExtranetApprovalCenter";
import { ExtranetActivityFeed } from "@/components/extranet/ExtranetActivityFeed";
import { ExtranetFilters } from "@/components/extranet/ExtranetFilters";
import { ExtranetClientOverview } from "@/components/extranet/ExtranetClientOverview";
import { filterTasks, groupTasksByExtranetStep } from "@/lib/extranet";
import type { ExtranetFiltersState, ExtranetStep } from "@/types/extranet";
import { cn } from "@/lib/utils";

// ─── Client Detail View ────────────────────────────────────────────────────────

interface ClientDetailViewProps {
  clientID: number;
  onBack: () => void;
}

function ClientDetailView({ clientID, onBack }: ClientDetailViewProps) {
  const { tasks, byStep, clientSummaries, isLoading, error, refetch } = useExtranetTasks(clientID);
  const [activeTab, setActiveTab] = useState("kanban");
  const [filters, setFilters] = useState<ExtranetFiltersState>({ search: "", step: "all" });

  const summary = clientSummaries.find(s => s.clientID === clientID);
  const clientName = summary?.clientName || tasks[0]?.clientDisplayName || `Cliente ${clientID}`;

  const filteredTasks = useMemo(() => filterTasks(tasks, filters.search, filters.step), [tasks, filters]);
  const filteredByStep = useMemo(() => groupTasksByExtranetStep(filteredTasks), [filteredTasks]);
  const approvalTasks = useMemo(() => byStep["Aprovação"] || [], [byStep]);

  function handleStepClick(step: string) {
    setFilters(f => ({ ...f, step: step as ExtranetStep }));
    setActiveTab("kanban");
  }

  if (error) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Todos os clientes
        </Button>
        <QueryErrorState error={error as Error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back + client name */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Todos
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary truncate">
              CRT · EXTRANET
            </p>
            <h2 className="text-lg font-bold truncate">{clientName}</h2>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : summary ? (
        <ExtranetKPIs summary={summary} onStepClick={handleStepClick} />
      ) : null}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-9 gap-0.5 bg-muted/60 p-1">
            <TabsTrigger value="kanban" className="h-7 text-xs px-3">
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="aprovacoes" className="h-7 text-xs px-3 relative">
              Aprovações
              {approvalTasks.length > 0 && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[0.6rem] font-bold text-white">
                  {approvalTasks.length > 9 ? "9+" : approvalTasks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="atividades" className="h-7 text-xs px-3">
              Atividade
            </TabsTrigger>
            <TabsTrigger value="lista" className="h-7 text-xs px-3">
              Lista
            </TabsTrigger>
          </TabsList>

          {(activeTab === "kanban" || activeTab === "lista") && (
            <ExtranetFilters
              filters={filters}
              onChange={f => setFilters(prev => ({ ...prev, ...f }))}
              totalResults={filteredTasks.length}
            />
          )}
        </div>

        <TabsContent value="kanban" className="mt-4">
          <ExtranetKanban
            byStep={filteredByStep}
            isLoading={isLoading}
            onTaskClick={() => {}}
          />
        </TabsContent>

        <TabsContent value="aprovacoes" className="mt-4">
          <ExtranetApprovalCenter tasks={approvalTasks} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="atividades" className="mt-4">
          <ExtranetActivityFeed tasks={tasks} isLoading={isLoading} limit={80} />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <TaskListView tasks={filteredTasks} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Task List View ────────────────────────────────────────────────────────────

import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Calendar, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExtranetStepBadge } from "@/components/extranet/ExtranetStepBadge";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask } from "@/types/taskrow";

function TaskListView({ tasks, isLoading }: { tasks: TaskrowTask[]; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {tasks.map(task => {
        const step = (task.extranetPipelineStep || "Backlog") as ExtranetStep;
        const dueDate = task.dueDate ? parseISO(task.dueDate) : null;
        const isOverdue = dueDate && isPast(dueDate) && !task.closed;
        const link = taskrowLink(task);
        return (
          <div
            key={task.taskID}
            className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 transition-colors hover:bg-muted/30"
          >
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", task.closed && "line-through text-muted-foreground")}>
                {task.taskTitle}
              </p>
              <p className="text-[0.65rem] text-muted-foreground truncate">
                #{task.taskNumber} · {task.jobDisplayTitle || task.jobTitle}
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <ExtranetStepBadge step={step} size="xs" />
              {dueDate && (
                <span className={cn(
                  "text-[0.65rem] flex items-center gap-1",
                  isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
                )}>
                  <Calendar className="h-2.5 w-2.5" />
                  {format(dueDate, "dd/MM", { locale: ptBR })}
                </span>
              )}
              {task.ownerUserLogin && (
                <span className="text-[0.65rem] text-muted-foreground flex items-center gap-1">
                  <User className="h-2.5 w-2.5" />
                  {task.ownerUserLogin}
                </span>
              )}
            </div>

            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0 text-muted-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ExtranetView ─────────────────────────────────────────────────────────

export default function ExtranetView() {
  const [selectedClientID, setSelectedClientID] = useState<number | null>(null);
  const [clientSearchQ, setClientSearchQ] = useState("");

  const { clientSummaries, isLoading, error, refetch } = useExtranetTasks(null);

  const filteredSummaries = useMemo(() => {
    if (!clientSearchQ.trim()) return clientSummaries;
    const q = clientSearchQ.toLowerCase();
    return clientSummaries.filter(s =>
      s.clientName.toLowerCase().includes(q) ||
      s.clientNickName.toLowerCase().includes(q)
    );
  }, [clientSummaries, clientSearchQ]);

  if (selectedClientID !== null) {
    return (
      <ClientDetailView
        clientID={selectedClientID}
        onBack={() => setSelectedClientID(null)}
      />
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          breadcrumb={["CRT", "EXTRANET"]}
          title="Extranet"
          subtitle="Visão do cliente sobre jobs e entregas"
        />
        <QueryErrorState error={error as Error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "EXTRANET"]}
        title="Extranet"
        subtitle="Visão do cliente sobre jobs e entregas"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5" />
            Visão do cliente
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </PageHeader>

      {/* Client search for overview */}
      {!isLoading && clientSummaries.length > 6 && (
        <div className="mb-4 max-w-xs">
          <div className="relative">
            <input
              type="text"
              placeholder="Filtrar cliente..."
              value={clientSearchQ}
              onChange={e => setClientSearchQ(e.target.value)}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      <ExtranetClientOverview
        summaries={filteredSummaries}
        isLoading={isLoading}
        onSelect={id => setSelectedClientID(id)}
      />
    </div>
  );
}
