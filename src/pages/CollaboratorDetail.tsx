import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, CalendarDays, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis,
  LineChart, Line,
  AreaChart, Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SLAValue } from "@/components/shared/SLAValue";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { usePipelineHistory } from "@/hooks/usePipelineHistory";
import { classifyTask, getStatusColor, getStatusLabel } from "@/lib/classifyTask";
import { calcSLA, calcSLATrend } from "@/lib/sla";
import { calcAggregateSLASplit } from "@/lib/slaActive";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask, TaskStatus } from "@/types/taskrow";

export default function CollaboratorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userID = Number(id);
  const { data: allTasks, isLoading } = useAllTasks();
  const { data: users } = useUsers();

  const user = useMemo(() => users?.find((u: any) => u.UserID === userID), [users, userID]);
  const tasks = useMemo(() => allTasks?.filter(t => t.ownerUserID === userID) || [], [allTasks, userID]);

  const taskIds = useMemo(() => tasks.map(t => t.taskID), [tasks]);
  const { data: pipelineHistory } = usePipelineHistory(taskIds);

  const slaSplit = useMemo(
    () => calcAggregateSLASplit(taskIds, pipelineHistory || []),
    [taskIds, pipelineHistory]
  );

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { andamento: 0, backlog: 0, atraso: 0, atraso_cliente: 0, em_dia: 0, retrabalho: 0, urgente: 0, concluida: 0 };
    tasks.forEach(t => { c[classifyTask(t)]++; });
    return c;
  }, [tasks]);

  // Kanban state
  const [kanbanSearch, setKanbanSearch] = useState("");
  const [kanbanClient, setKanbanClient] = useState("all");
  const [showClosed, setShowClosed] = useState(false);

  const kanbanColumns = useMemo(() => {
    let list = tasks;
    if (!showClosed) list = list.filter(t => !t.closed);
    if (kanbanSearch) { const q = kanbanSearch.toLowerCase(); list = list.filter(t => t.taskTitle.toLowerCase().includes(q)); }
    if (kanbanClient !== "all") list = list.filter(t => t.clientNickName === kanbanClient);

    const cols = new Map<string, TaskrowTask[]>();
    list.forEach(t => {
      const step = t.closed ? "Concluídas" : (t.pipelineStep || "Sem Pipeline");
      const arr = cols.get(step) || [];
      arr.push(t);
      cols.set(step, arr);
    });
    return cols;
  }, [tasks, kanbanSearch, kanbanClient, showClosed]);

  const clientOptions = useMemo(() => {
    const set = new Set(tasks.map(t => t.clientNickName).filter(Boolean));
    return Array.from(set).sort();
  }, [tasks]);

  // Analysis data
  const statusDonut = useMemo(() => {
    return (Object.entries(counts) as [TaskStatus, number][])
      .filter(([, v]) => v > 0)
      .map(([s, v]) => ({ name: getStatusLabel(s), value: v, fill: getStatusColor(s) }));
  }, [counts]);

  const topClients = useMemo(() => {
    const byClient = new Map<string, number>();
    tasks.forEach(t => byClient.set(t.clientDisplayName || t.clientNickName, (byClient.get(t.clientDisplayName || t.clientNickName) || 0) + 1));
    return Array.from(byClient.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const slaTrend = useMemo(() => calcSLATrend(tasks), [tasks]);
  const slaAvg = useMemo(() => calcSLA(tasks), [tasks]);

  // Tasks tab state
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskPage, setTaskPage] = useState(0);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (taskStatusFilter !== "all") {
      if (taskStatusFilter === "abertas") list = list.filter(t => !t.closed);
      else if (taskStatusFilter === "fechadas") list = list.filter(t => t.closed);
      else list = list.filter(t => classifyTask(t) === taskStatusFilter);
    }
    if (taskSearch) { const q = taskSearch.toLowerCase(); list = list.filter(t => t.taskTitle.toLowerCase().includes(q)); }
    return list;
  }, [tasks, taskStatusFilter, taskSearch]);

  const pageSize = 15;
  const pagedTasks = filteredTasks.slice(taskPage * pageSize, (taskPage + 1) * pageSize);
  const totalPages = Math.ceil(filteredTasks.length / pageSize);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-10 w-64" /></div>;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 gap-1" onClick={() => navigate("/colaboradores")}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <PageHeader
        breadcrumb={["CRT", "COLABORADOR"]}
        title={user?.FullName || `Colaborador ${id}`}
        subtitle={[user?.UserFunctionTitle, user?.FunctionGroupName, user?.ApprovalGroup].filter(Boolean).join(" · ")}
      />

      <div className="flex flex-wrap gap-2">
        {([
          ["TOTAL", tasks.length, "text-foreground"],
          ["EM ANDAMENTO", counts.andamento + counts.em_dia, "text-primary"],
          ["CONCLUÍDAS", counts.concluida, "text-status-em-dia"],
          ["ATRASO CRT", counts.atraso, "text-destructive"],
          ["AG. CLIENTE", counts.atraso_cliente, "text-status-atraso-cliente"],
          ["EM DIA", counts.em_dia, "text-status-em-dia"],
          ["BACKLOG", counts.backlog, "text-status-backlog"],
          ["RETRABALHO", counts.retrabalho, "text-status-retrabalho"],
          ["URGENTE", counts.urgente, "text-foreground"],
        ] as const).map(([label, value, cls]) => (
          <Badge key={label} variant="outline" className="gap-1 text-xs">
            <span className={`font-bold ${cls}`}>{value}</span> {label}
          </Badge>
        ))}
      </div>

      <Separator className="my-5" />

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="analise">Análise</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        {/* KANBAN */}
        <TabsContent value="kanban">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar tarefa..." className="pl-9" value={kanbanSearch} onChange={e => setKanbanSearch(e.target.value)} />
            </div>
            <Select value={kanbanClient} onValueChange={setKanbanClient}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clientOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={showClosed} onCheckedChange={setShowClosed} />
              <span className="text-muted-foreground">Concluídas</span>
            </div>
          </div>

          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-4" style={{ minWidth: kanbanColumns.size * 280 }}>
              {Array.from(kanbanColumns.entries()).map(([step, colTasks]) => (
                <div key={step} className="w-[260px] shrink-0">
                  <Card className="bg-muted/30">
                    <CardHeader className="p-3 pb-1">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-bold uppercase">{step}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 p-3 pt-1">
                      {colTasks.map(t => {
                        const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !t.closed;
                        const isUrgent = (t.tags || "").toLowerCase().includes("urgente");
                        return (
                          <Card
                            key={t.taskID}
                            className={`p-3 ${overdue ? "border-l-2 border-l-destructive" : ""} ${isUrgent ? "border-l-2 border-l-status-retrabalho" : ""}`}
                          >
                            <div className="flex items-center gap-1">
                              <a
                                href={taskrowLink(t)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir no Taskrow"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Badge variant="outline" className="text-[10px] font-mono hover:border-primary hover:text-primary transition-colors cursor-pointer">
                                  #{t.taskNumber} <ExternalLink className="ml-0.5 h-2.5 w-2.5 opacity-50" />
                                </Badge>
                              </a>
                              {isUrgent && <AlertTriangle className="h-3 w-3 text-status-retrabalho" />}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs font-medium">{t.taskTitle}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{t.clientDisplayName}</p>
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />
                              <span className={overdue ? "font-medium text-destructive" : ""}>
                                {t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "Sem prazo"}
                              </span>
                            </div>
                          </Card>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ANALYSIS */}
        <TabsContent value="analise">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Distribuição por Status</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                      {statusDonut.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Clientes que mais demandam</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topClients} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={75} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA do Colaborador</CardTitle>
                <p className="text-2xl font-bold"><SLAValue days={slaAvg} /></p>
              </CardHeader>
              <CardContent>
                {slaSplit.hasData && (
                  <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">Tempo Ativo</p>
                      <p className="text-xl font-bold text-primary">{slaSplit.tempoAtivo}d</p>
                      <p className="text-[0.65rem] text-muted-foreground">colaborador produzindo</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">Ag. Cliente</p>
                      <p className="text-xl font-bold text-status-atraso-cliente">{slaSplit.tempoParado}d</p>
                      <p className="text-[0.65rem] text-muted-foreground">aguardando aprovação</p>
                    </div>
                    <div className="col-span-2">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                        {slaSplit.total > 0 && (
                          <>
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${(slaSplit.tempoAtivo / slaSplit.total) * 100}%` }}
                            />
                            <div
                              className="h-full bg-status-atraso-cliente transition-all"
                              style={{ width: `${(slaSplit.tempoParado / slaSplit.total) * 100}%` }}
                            />
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-[0.6rem] text-muted-foreground">
                        Azul = ativo · Roxo = aguardando cliente (média por tarefa)
                      </p>
                    </div>
                  </div>
                )}
                {!slaSplit.hasData && (
                  <p className="mb-3 text-[0.7rem] text-muted-foreground italic">
                    Histórico de pipeline ainda sendo coletado. Disponível após o próximo refresh de analytics.
                  </p>
                )}
                {slaTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={slaTrend}>
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="sla" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de tendência</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Carga ao Longo do Tempo</CardTitle></CardHeader>
              <CardContent>
                {(() => {
                  const byWeek = new Map<string, number>();
                  tasks.forEach(t => {
                    const w = format(new Date(t.creationDate), "ww/yyyy");
                    byWeek.set(w, (byWeek.get(w) || 0) + 1);
                  });
                  const data = Array.from(byWeek.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count }));
                  return data.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={data}>
                        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <defs>
                          <linearGradient id="colorFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#colorFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <p className="py-8 text-center text-sm text-muted-foreground">Sem dados</p>;
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TASKS TABLE */}
        <TabsContent value="tarefas">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-9" value={taskSearch} onChange={e => { setTaskSearch(e.target.value); setTaskPage(0); }} />
            </div>
            <Select value={taskStatusFilter} onValueChange={v => { setTaskStatusFilter(v); setTaskPage(0); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="abertas">Abertas</SelectItem>
                <SelectItem value="fechadas">Fechadas</SelectItem>
                <SelectItem value="atraso">Atraso CRT</SelectItem>
                <SelectItem value="atraso_cliente">Ag. Aprovação Cliente</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedTasks.map(t => {
                  const status = classifyTask(t);
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
                      <TableCell className="max-w-[180px] truncate text-sm">{t.taskTitle}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.clientDisplayName}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">{t.jobTitle}</TableCell>
                      <TableCell className="text-xs">{t.pipelineStep || "—"}</TableCell>
                      <TableCell className={`text-xs ${overdue ? "font-medium text-destructive" : ""}`}>
                        {t.dueDate ? format(new Date(t.dueDate), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Mostrando {taskPage * pageSize + 1}-{Math.min((taskPage + 1) * pageSize, filteredTasks.length)} de {filteredTasks.length}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={taskPage === 0} onClick={() => setTaskPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={taskPage >= totalPages - 1} onClick={() => setTaskPage(p => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
