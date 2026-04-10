import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { ClientAvatar } from "@/components/shared/ClientAvatar";
import { SLAValue } from "@/components/shared/SLAValue";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useClients } from "@/hooks/useClients";
import { classifyTask } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import { cn } from "@/lib/utils";
import type { TaskrowTask, ClientMetrics, TaskrowClient } from "@/types/taskrow";

type SortKey = "name" | "total" | "andamento" | "concluidas" | "atrasadas" | "emDia" | "backlog" | "retrabalho" | "pctRetrabalho" | "urgente" | "slaMedia";

interface ClientInfo {
  id: number;
  name: string;
  nick: string;
}

function buildClientMetricsFromTasks(tasks: TaskrowTask[], clients?: TaskrowClient[]): ClientMetrics[] {
  // Group tasks by clientID
  const byClient = new Map<number, TaskrowTask[]>();
  tasks.forEach(t => {
    const arr = byClient.get(t.clientID) || [];
    arr.push(t);
    byClient.set(t.clientID, arr);
  });

  return Array.from(byClient.entries()).map(([clientId, ct]) => {
    // Try to find official client record, else derive from task data
    const official = clients?.find(c => c.ClientID === clientId);
    const clientObj: TaskrowClient = official || {
      ClientID: clientId,
      ClientName: ct[0]?.clientDisplayName || `Cliente ${clientId}`,
      ClientNickName: ct[0]?.clientNickName || "",
      value: "",
      Inactive: false,
    };

    let andamento = 0, concluidas = 0, atrasadas = 0, emDia = 0, backlog = 0, retrabalho = 0, urgente = 0;
    ct.forEach(t => {
      const s = classifyTask(t);
      if (s === "concluida") concluidas++;
      else if (s === "atraso") atrasadas++;
      else if (s === "em_dia") emDia++;
      else if (s === "backlog") backlog++;
      else if (s === "retrabalho") retrabalho++;
      else if (s === "urgente") urgente++;
      else andamento++;
    });
    const total = ct.length;
    return {
      client: clientObj,
      tasks: ct,
      total,
      andamento,
      concluidas,
      atrasadas,
      emDia,
      backlog,
      retrabalho,
      urgente,
      pctRetrabalho: total > 0 ? +((retrabalho / total) * 100).toFixed(1) : 0,
      slaMedia: calcSLA(ct),
      riskScore: 0,
    };
  }).filter(m => m.total > 0);
}

export default function ClientsView() {
  const navigate = useNavigate();
  const { data: tasks, isLoading: loadingTasks } = useAllTasks();
  const { data: clients, isLoading: loadingClients } = useClients();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);

  const metrics = useMemo(() => {
    if (!tasks) return [];
    return buildClientMetricsFromTasks(tasks, clients as TaskrowClient[] | undefined);
  }, [clients, tasks]);

  const filtered = useMemo(() => {
    let list = metrics;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.client.ClientName.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const va = sortKey === "name" ? a.client.ClientName : (a as any)[sortKey];
      const vb = sortKey === "name" ? b.client.ClientName : (b as any)[sortKey];
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [metrics, search, sortKey, sortAsc]);

  const totals = useMemo(() => ({
    clients: metrics.length,
    open: metrics.reduce((s, m) => s + m.total - m.concluidas, 0),
    atraso: metrics.reduce((s, m) => s + m.atrasadas, 0),
    retrabalho: metrics.reduce((s, m) => s + m.retrabalho, 0),
    urgente: metrics.reduce((s, m) => s + m.urgente, 0),
  }), [metrics]);

  const loading = loadingTasks;

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
      <PageHeader breadcrumb={["CRT", "CLIENTES"]} title="Visão por Cliente" subtitle="Volume, atrasos e qualidade por cliente" />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KPICard label="CLIENTES" value={totals.clients} color="indigo" size="sm" bgColored={false} />
          <KPICard label="TASKS ABERTAS" value={totals.open} color="indigo" size="sm" bgColored />
          <KPICard label="EM ATRASO" value={totals.atraso} color="red" size="sm" bgColored />
          <KPICard label="RETRABALHO" value={totals.retrabalho} color="amber" size="sm" bgColored />
          <KPICard label="URGENTES" value={totals.urgente} color={totals.urgente > 0 ? "red" : "dark"} size="sm" bgColored={totals.urgente > 0} />
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Badge variant="secondary">{filtered.length} clientes</Badge>
      </div>

      <Card className="mt-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("name")}>CLIENTE <SortIcon col="name" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("total")}>TOTAL <SortIcon col="total" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("andamento")}>ANDAMENTO <SortIcon col="andamento" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("concluidas")}>CONCLUÍDAS <SortIcon col="concluidas" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("atrasadas")}>ATRASADAS <SortIcon col="atrasadas" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("emDia")}>NO PRAZO <SortIcon col="emDia" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("backlog")}>BACKLOG <SortIcon col="backlog" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("retrabalho")}>RETRAB. <SortIcon col="retrabalho" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("pctRetrabalho")}>% RETRAB. <SortIcon col="pctRetrabalho" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("urgente")}>URGENTE <SortIcon col="urgente" /></TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("slaMedia")}>SLA <SortIcon col="slaMedia" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.map(m => (
                  <TableRow
                    key={m.client.ClientID}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/clientes/${m.client.ClientNickName}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ClientAvatar name={m.client.ClientName} size={32} />
                        <span className="text-sm font-medium">{m.client.ClientName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">{m.total}</TableCell>
                    <TableCell className={cn("text-right", m.andamento > 0 ? "text-primary font-medium" : "text-muted-foreground")}>{m.andamento}</TableCell>
                    <TableCell className={cn("text-right", m.concluidas > 0 ? "text-status-em-dia font-medium" : "text-muted-foreground")}>{m.concluidas}</TableCell>
                    <TableCell className="text-right">
                      {m.atrasadas > 0 ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">{m.atrasadas}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right", m.emDia > 0 ? "text-status-em-dia font-medium" : "text-muted-foreground")}>{m.emDia}</TableCell>
                    <TableCell className={cn("text-right", m.backlog > 0 ? "text-status-backlog font-medium" : "text-muted-foreground")}>{m.backlog}</TableCell>
                    <TableCell className={cn("text-right", m.retrabalho > 0 ? "text-status-retrabalho font-medium" : "text-muted-foreground")}>{m.retrabalho}</TableCell>
                    <TableCell className={cn("text-right text-xs font-medium", m.pctRetrabalho < 10 ? "text-status-em-dia" : m.pctRetrabalho > 20 ? "text-destructive" : "text-muted-foreground")}>
                      {m.pctRetrabalho}%
                    </TableCell>
                    <TableCell className={cn("text-right", m.urgente > 0 ? "text-destructive font-bold" : "text-muted-foreground")}>{m.urgente}</TableCell>
                    <TableCell className="text-right"><SLAValue days={m.slaMedia} /></TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
