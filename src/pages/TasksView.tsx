import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ChevronUp, ChevronDown, TrendingUp, Users, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { classifyTask, getStatusLabel, getStatusColor } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import { cn } from "@/lib/utils";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask, TaskStatus } from "@/types/taskrow";

type SortKey = "taskNumber" | "taskTitle" | "clientDisplayName" | "dueDate" | "status";

function InsightsPanel({
  filtered,
  allTasks,
  users,
  statusLabel,
  statusColor,
}: {
  filtered: (TaskrowTask & { _status: TaskStatus })[];
  allTasks: TaskrowTask[];
  users: any[];
  statusLabel: string;
  statusColor: string;
}) {
  const total = allTasks.length;
  const pct = total > 0 ? Math.round((filtered.length / total) * 100) : 0;
  const slaAvg = calcSLA(filtered);

  const byOwner = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(t => {
      const user = users?.find((u: any) => u.UserID === t.ownerUserID);
      const name = user?.FullName?.split(" ").slice(0, 2).join(" ") || t.ownerUserLogin || `User ${t.ownerUserID}`;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filtered, users]);

  const maxOwnerCount = byOwner[0]?.[1] || 1;

  return (
    <Card className="mb-4 overflow-hidden border-l-4" style={{ borderLeftColor: statusColor }}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Insights — {statusLabel}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Stat chips */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold" style={{ color: statusColor }}>{filtered.length}</span>
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold">tarefas</p>
                <p>{pct}% do total</p>
              </div>
            </div>
            {slaAvg > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>SLA médio (concluídas): <span className="font-semibold text-foreground">{slaAvg}d</span></span>
              </div>
            )}
            {byOwner[0] && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>Maior carga: <span className="font-semibold text-foreground">{byOwner[0][0]}</span> ({byOwner[0][1]})</span>
              </div>
            )}
          </div>

          {/* By responsible mini-chart */}
          {byOwner.length > 0 && (
            <div className="md:col-span-2 space-y-1.5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Top responsáveis
              </p>
              {byOwner.map(([name, count]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate text-muted-foreground">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(count / maxOwnerCount) * 100}%`,
                        backgroundColor: statusColor,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="w-5 text-right font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TasksView() {
  const [searchParams] = useSearchParams();
  const { data: tasks, isLoading } = useAllTasks();
  const { data: users } = useUsers();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") || "all");
  const [sortKey, setSortKey] = useState<SortKey>("taskNumber");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const classified = useMemo(() => {
    if (!tasks) return [];
    return tasks.map(t => ({ ...t, _status: classifyTask(t) }));
  }, [tasks]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: 0, abertas: 0, concluidas: 0, atrasadas: 0, urgentes: 0 };
    classified.forEach(t => {
      c.total++;
      if (t.closed) c.concluidas++;
      else c.abertas++;
      if (t._status === "atraso") c.atrasadas++;
      if (t._status === "urgente") c.urgentes++;
    });
    return c;
  }, [classified]);

  const filtered = useMemo(() => {
    let list = classified;
    if (statusFilter === "abertas") list = list.filter(t => !t.closed);
    else if (statusFilter === "fechadas") list = list.filter(t => t.closed);
    else if (statusFilter !== "all") list = list.filter(t => t._status === statusFilter);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.taskTitle.toLowerCase().includes(q) ||
        String(t.taskNumber).includes(q) ||
        t.clientDisplayName?.toLowerCase().includes(q) ||
        t.ownerUserLogin?.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === "status") { va = a._status; vb = b._status; }
      else if (sortKey === "dueDate") { va = a.dueDate || ""; vb = b.dueDate || ""; }
      else { va = (a as any)[sortKey]; vb = (b as any)[sortKey]; }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [classified, search, statusFilter, sortKey, sortAsc]);

  const pageSize = 25;
  const pagedItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  };

  const activeStatusKey = ["atraso", "em_dia", "backlog", "retrabalho", "urgente", "concluida"].includes(statusFilter)
    ? (statusFilter as TaskStatus)
    : null;

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "TAREFAS"]} title="Todas as Tarefas" subtitle="Listagem completa com filtros e busca" />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KPICard label="TOTAL" value={counts.total} color="indigo" size="sm" />
          <KPICard label="ABERTAS" value={counts.abertas} color="indigo" size="sm" bgColored onClick={() => { setStatusFilter("abertas"); setPage(0); }} />
          <KPICard label="CONCLUÍDAS" value={counts.concluidas} color="green" size="sm" bgColored={false} onClick={() => { setStatusFilter("fechadas"); setPage(0); }} />
          <KPICard label="EM ATRASO" value={counts.atrasadas} color="red" size="sm" bgColored onClick={() => { setStatusFilter("atraso"); setPage(0); }} />
          <KPICard label="URGENTES" value={counts.urgentes} color="dark" size="sm" bgColored={counts.urgentes > 0} onClick={() => { setStatusFilter("urgente"); setPage(0); }} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por título, número, cliente ou responsável..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="abertas">Abertas</SelectItem>
            <SelectItem value="fechadas">Fechadas</SelectItem>
            <SelectItem value="atraso">Em Atraso</SelectItem>
            <SelectItem value="em_dia">Em Dia</SelectItem>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="retrabalho">Retrabalho</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary">{filtered.length} tarefas</Badge>
        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setStatusFilter("all"); setPage(0); }}>
            Limpar filtro ×
          </Button>
        )}
      </div>

      {activeStatusKey && !isLoading && filtered.length > 0 && (
        <div className="mt-4">
          <InsightsPanel
            filtered={filtered}
            allTasks={tasks || []}
            users={users || []}
            statusLabel={getStatusLabel(activeStatusKey)}
            statusColor={getStatusColor(activeStatusKey)}
          />
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 cursor-pointer" onClick={() => handleSort("taskNumber")}># <SortIcon col="taskNumber" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("taskTitle")}>TÍTULO <SortIcon col="taskTitle" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("clientDisplayName")}>CLIENTE <SortIcon col="clientDisplayName" /></TableHead>
              <TableHead>PROJETO</TableHead>
              <TableHead>RESPONSÁVEL</TableHead>
              <TableHead>PIPELINE</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("dueDate")}>PRAZO <SortIcon col="dueDate" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("status")}>STATUS <SortIcon col="status" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              : pagedItems.map(t => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !t.closed;
                  return (
                    <TableRow key={t.taskID}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <a
                          href={taskrowLink(t)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                          title="Abrir no Taskrow"
                        >
                          {t.taskNumber}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{t.taskTitle}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.clientDisplayName}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">{t.jobTitle}</TableCell>
                      <TableCell className="text-xs">{t.ownerUserLogin}</TableCell>
                      <TableCell className="text-xs">{t.pipelineStep || "—"}</TableCell>
                      <TableCell className={cn("text-xs", overdue && "font-medium text-destructive")}>
                        {t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={t._status} /></TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} de {filtered.length}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
