import { useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SLAValue } from "@/components/shared/SLAValue";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { useAllTasks } from "@/hooks/useAllTasks";
import { classifyTask } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import type { TaskrowTask, TaskStatus } from "@/types/taskrow";

interface ProjectMetrics {
  jobID: number;
  jobNumber: number;
  jobTitle: string;
  clientName: string;
  total: number;
  abertas: number;
  concluidas: number;
  atrasadas: number;
  atrasadasCliente: number;
  emDia: number;
  backlog: number;
  retrabalho: number;
  urgente: number;
  sla: number;
}

type SortKey = "jobTitle" | "clientName" | "total" | "abertas" | "concluidas" | "atrasadas" | "sla";

function buildProjectMetrics(tasks: TaskrowTask[]): ProjectMetrics[] {
  const byJob = new Map<number, TaskrowTask[]>();
  tasks.forEach(t => {
    const arr = byJob.get(t.jobID) || [];
    arr.push(t);
    byJob.set(t.jobID, arr);
  });

  return Array.from(byJob.entries()).map(([jobID, jt]) => {
    let concluidas = 0, atrasadas = 0, atrasadasCliente = 0, emDia = 0, backlog = 0, retrabalho = 0, urgente = 0, andamento = 0;
    jt.forEach(t => {
      const s = classifyTask(t);
      if (s === "concluida") concluidas++;
      else if (s === "atraso") atrasadas++;
      else if (s === "atraso_cliente") atrasadasCliente++;
      else if (s === "em_dia") emDia++;
      else if (s === "backlog") backlog++;
      else if (s === "retrabalho") retrabalho++;
      else if (s === "urgente") urgente++;
      else andamento++;
    });
    const abertas = jt.length - concluidas;
    return {
      jobID,
      jobNumber: jt[0].jobNumber,
      jobTitle: jt[0].jobTitle,
      clientName: jt[0].clientDisplayName || jt[0].clientNickName,
      total: jt.length,
      abertas,
      concluidas,
      atrasadas,
      atrasadasCliente,
      emDia,
      backlog,
      retrabalho,
      urgente,
      sla: calcSLA(jt),
    };
  }).sort((a, b) => b.total - a.total);
}

export default function ProjectsView() {
  const { data: tasks, isLoading } = useAllTasks();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const metrics = useMemo(() => tasks ? buildProjectMetrics(tasks) : [], [tasks]);

  const filtered = useMemo(() => {
    let list = metrics;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.jobTitle.toLowerCase().includes(q) || m.clientName.toLowerCase().includes(q) || String(m.jobNumber).includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = (a as any)[sortKey];
      const vb = (b as any)[sortKey];
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [metrics, search, sortKey, sortAsc]);

  const pageSize = 20;
  const pagedItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const totals = useMemo(() => ({
    projects: metrics.length,
    tasks: metrics.reduce((s, m) => s + m.total, 0),
    abertas: metrics.reduce((s, m) => s + m.abertas, 0),
    atrasadas: metrics.reduce((s, m) => s + m.atrasadas, 0),
    atrasadasCliente: metrics.reduce((s, m) => s + m.atrasadasCliente, 0),
  }), [metrics]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  };

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "PROJETOS"]} title="Visão por Projeto" subtitle="Acompanhamento de projetos e suas demandas" />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KPICard label="PROJETOS" value={totals.projects} color="indigo" size="sm" />
          <KPICard label="TOTAL TASKS" value={totals.tasks} color="indigo" size="sm" bgColored={false} />
          <KPICard label="ABERTAS" value={totals.abertas} color="amber" size="sm" bgColored />
          <KPICard label="ATRASO CRT" value={totals.atrasadas} color="red" size="sm" bgColored />
          <KPICard label="AG. CLIENTE" value={totals.atrasadasCliente} color="purple" size="sm" bgColored />
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar projeto, cliente ou número..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Badge variant="secondary">{filtered.length} projetos</Badge>
      </div>

      <Card className="mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("jobTitle")}>PROJETO <SortIcon col="jobTitle" /></TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort("clientName")}>CLIENTE <SortIcon col="clientName" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("total")}>TOTAL <SortIcon col="total" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("abertas")}>ABERTAS <SortIcon col="abertas" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("concluidas")}>CONCLUÍDAS <SortIcon col="concluidas" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("atrasadas")}>ATRASO CRT <SortIcon col="atrasadas" /></TableHead>
              <TableHead className="text-right">AG. CLIENTE</TableHead>
              <TableHead className="text-right">BACKLOG</TableHead>
              <TableHead className="text-right">URGENTE</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("sla")}>SLA <SortIcon col="sla" /></TableHead>
              <TableHead className="w-24">PROGRESSO</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))
              : pagedItems.map(m => {
                  const pctDone = m.total > 0 ? (m.concluidas / m.total) * 100 : 0;
                  return (
                    <TableRow key={m.jobID}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{m.jobNumber}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm font-medium">{m.jobTitle}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.clientName}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{m.total}</TableCell>
                      <TableCell className="text-right">{m.abertas}</TableCell>
                      <TableCell className="text-right text-status-em-dia">{m.concluidas}</TableCell>
                      <TableCell className="text-right">
                        {m.atrasadas > 0 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">{m.atrasadas}</span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.atrasadasCliente > 0 ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-status-atraso-cliente/10 text-xs font-bold text-status-atraso-cliente">{m.atrasadasCliente}</span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-status-backlog">{m.backlog}</TableCell>
                      <TableCell className="text-right">{m.urgente}</TableCell>
                      <TableCell className="text-right"><SLAValue days={m.sla} /></TableCell>
                      <TableCell><ProgressBar value={pctDone} /></TableCell>
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
            <button className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <button className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
