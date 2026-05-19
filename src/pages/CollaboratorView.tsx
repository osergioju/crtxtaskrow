import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { SLAValue } from "@/components/shared/SLAValue";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { classifyTask } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import type { TaskrowTask, TaskrowUser, UserMetrics } from "@/types/taskrow";

function buildUserMetrics(users: TaskrowUser[], tasks: TaskrowTask[]): UserMetrics[] {
  const byUser = new Map<number, TaskrowTask[]>();
  tasks.forEach(t => {
    const arr = byUser.get(t.ownerUserID) || [];
    arr.push(t);
    byUser.set(t.ownerUserID, arr);
  });

  return users.filter(u => !u.Inactive && byUser.has(u.UserID)).map(user => {
    const ut = byUser.get(user.UserID) || [];
    let andamento = 0, atrasadas = 0, atrasadasCliente = 0, emDia = 0, backlog = 0, urgente = 0, retrabalho = 0, concluidas = 0;
    ut.forEach(t => {
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
    return { user, tasks: ut, andamento, atrasadas, atrasadasCliente, emDia, backlog, urgente, retrabalho, concluidas, slaMedia: calcSLA(ut) };
  });
}

export default function CollaboratorView() {
  const navigate = useNavigate();
  const { data: tasks, isLoading: loadingTasks } = useAllTasks();
  const { data: users, isLoading: loadingUsers } = useUsers();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sortBy, setSortBy] = useState("tasks");

  const metrics = useMemo(() => {
    if (!users || !tasks) return [];
    return buildUserMetrics(users as TaskrowUser[], tasks);
  }, [users, tasks]);

  const areas = useMemo(() => {
    const set = new Set(metrics.map(m => m.user.FunctionGroupName).filter(Boolean));
    return Array.from(set).sort();
  }, [metrics]);

  const filtered = useMemo(() => {
    let list = metrics;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.user.FullName.toLowerCase().includes(q));
    }
    if (areaFilter !== "all") list = list.filter(m => m.user.FunctionGroupName === areaFilter);

    if (sortBy === "tasks") list.sort((a, b) => b.tasks.length - a.tasks.length);
    else if (sortBy === "atraso") list.sort((a, b) => b.atrasadas - a.atrasadas);
    else if (sortBy === "nome") list.sort((a, b) => a.user.FullName.localeCompare(b.user.FullName));
    return list;
  }, [metrics, search, areaFilter, sortBy]);

  const loading = loadingTasks || loadingUsers;
  const activeCount = metrics.length;
  const totalTasks = metrics.reduce((s, m) => s + m.tasks.length, 0);
  const avg = activeCount > 0 ? +(totalTasks / activeCount).toFixed(1) : 0;
  const maxLoad = metrics.length > 0 ? metrics.reduce((a, b) => a.tasks.length > b.tasks.length ? a : b) : null;

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "EQUIPE"]} title="Visão por Colaborador" subtitle="Performance individual do time" />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPICard label="COLABORADORES ATIVOS" value={activeCount} color="indigo" size="sm" />
          <KPICard label="TASKS NO PERÍODO" value={totalTasks} color="indigo" size="sm" bgColored={false} />
          <KPICard label="MÉDIA TASKS/PESSOA" value={avg} color="green" size="sm" bgColored={false} />
          <KPICard label="MAIOR CARGA" value={maxLoad?.user.FullName.split(" ").slice(0, 2).join(" ") || "—"} color="amber" size="sm" bgColored={false} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as áreas</SelectItem>
            {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tasks">Mais tarefas</SelectItem>
            <SelectItem value="atraso">Mais atrasadas</SelectItem>
            <SelectItem value="nome">Nome A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
          : filtered.map(m => {
              const open = m.tasks.length - m.concluidas;
              const pctAtraso = open > 0 ? (m.atrasadas / open) * 100 : 0;
              const healthLabel = pctAtraso > 50 ? "Sobrecarregado" : pctAtraso > 25 ? "Atenção" : "Saudável";
              const healthCls = pctAtraso > 50 ? "bg-destructive/10 text-destructive border-destructive/20" : pctAtraso > 25 ? "bg-status-backlog/10 text-status-backlog border-status-backlog/20" : "bg-status-em-dia/10 text-status-em-dia border-status-em-dia/20";

              return (
                <Card
                  key={m.user.UserID}
                  className="cursor-pointer transition-all hover:shadow-md"
                  onClick={() => navigate(`/colaboradores/${m.user.UserID}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <UserAvatar name={m.user.FullName} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{m.user.FullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.user.UserFunctionTitle || m.user.FunctionGroupName}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-primary font-bold">{open}</span> <span className="text-muted-foreground">ABERTAS</span></div>
                      <div><span className="text-destructive font-bold">{m.atrasadas}</span> <span className="text-muted-foreground">ATRASO CRT</span></div>
                      <div><span className="text-status-atraso-cliente font-bold">{m.atrasadasCliente}</span> <span className="text-muted-foreground">AG. CLIENTE</span></div>
                      <div><span className="text-status-em-dia font-bold">{m.concluidas}</span> <span className="text-muted-foreground">CONCLUÍDAS</span></div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar value={pctAtraso} danger={pctAtraso > 40} className="flex-1" />
                      <span className="text-xs text-muted-foreground">SLA: </span>
                      <SLAValue days={m.slaMedia} />
                    </div>

                    <div className="mt-2">
                      <Badge variant="outline" className={`text-xs ${healthCls}`}>{healthLabel}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
