import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SLAValue } from "@/components/shared/SLAValue";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { classifyTask } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask, TaskStatus } from "@/types/taskrow";

const areaColors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899"];

export default function ClientDetail() {
  const { nick } = useParams<{ nick: string }>();
  const navigate = useNavigate();
  const { data: allTasks, isLoading } = useAllTasks();
  const { data: users } = useUsers();
  const [taskSearch, setTaskSearch] = useState("");
  const [page, setPage] = useState(0);

  const tasks = useMemo(() => allTasks?.filter(t => t.clientNickName === nick) || [], [allTasks, nick]);

  const clientName = tasks[0]?.clientDisplayName || nick || "";

  const counts = useMemo(() => {
    const c: Record<TaskStatus, number> = { andamento: 0, backlog: 0, atraso: 0, atraso_cliente: 0, em_dia: 0, retrabalho: 0, urgente: 0, concluida: 0 };
    tasks.forEach(t => { c[classifyTask(t)]++; });
    return c;
  }, [tasks]);

  const total = tasks.length;
  const sla = useMemo(() => calcSLA(tasks), [tasks]);

  const topUsers = useMemo(() => {
    if (!users) return [];
    const byUser = new Map<number, number>();
    tasks.forEach(t => byUser.set(t.ownerUserID, (byUser.get(t.ownerUserID) || 0) + 1));
    return Array.from(byUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([uid, count]) => {
        const u = users.find((u: any) => u.UserID === uid);
        return { name: u?.FullName || `User ${uid}`, count };
      });
  }, [tasks, users]);

  const areaData = useMemo(() => {
    if (!users) return [];
    const byArea = new Map<string, number>();
    tasks.filter(t => t.closed).forEach(t => {
      const u = users.find((u: any) => u.UserID === t.ownerUserID);
      const area = u?.FunctionGroupName || "Outros";
      byArea.set(area, (byArea.get(area) || 0) + 1);
    });
    return Array.from(byArea.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [tasks, users]);

  const maxUserCount = Math.max(...topUsers.map(u => u.count), 1);

  const [tab, setTab] = useState("todas");

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (tab === "abertas") list = list.filter(t => !t.closed);
    else if (tab === "atrasadas") list = list.filter(t => classifyTask(t) === "atraso" || classifyTask(t) === "atraso_cliente");
    else if (tab === "concluidas") list = list.filter(t => t.closed);
    if (taskSearch) {
      const q = taskSearch.toLowerCase();
      list = list.filter(t => t.taskTitle.toLowerCase().includes(q) || String(t.taskNumber).includes(q));
    }
    return list;
  }, [tasks, tab, taskSearch]);

  const pageSize = 10;
  const pagedTasks = filteredTasks.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filteredTasks.length / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 gap-1" onClick={() => navigate("/clientes")}>
        <ArrowLeft className="h-4 w-4" /> Voltar para Clientes
      </Button>

      <PageHeader breadcrumb={["CRT", "CLIENTE"]} title={clientName} subtitle="Visão estratégica e operacional" />

      <div className="flex flex-wrap gap-2">
        {[
          { label: "TOTAL", value: total, cls: "text-foreground" },
          { label: "EM ANDAMENTO", value: counts.andamento + counts.em_dia, cls: "text-primary" },
          { label: "CONCLUÍDAS", value: counts.concluida, cls: "text-status-em-dia" },
          { label: "ATRASO CRT", value: counts.atraso, cls: "text-destructive" },
          { label: "AG. CLIENTE", value: counts.atraso_cliente, cls: "text-status-atraso-cliente" },
          { label: "EM DIA", value: counts.em_dia, cls: "text-status-em-dia" },
          { label: "BACKLOG", value: counts.backlog, cls: "text-status-backlog" },
          { label: "RETRABALHO", value: counts.retrabalho, cls: "text-status-retrabalho" },
          { label: "URGENTE", value: counts.urgente, cls: "text-foreground" },
        ].map(p => (
          <Badge key={p.label} variant="outline" className="gap-1 text-xs">
            <span className={`font-bold ${p.cls}`}>{p.value}</span> {p.label}
          </Badge>
        ))}
      </div>

      <Separator className="my-5" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Top Pessoas Envolvidas</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[240px]">
              <div className="space-y-3">
                {topUsers.map((u, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <UserAvatar name={u.name} size={32} />
                      <span className="flex-1 truncate text-sm font-medium">{u.name}</span>
                      <span className="text-xs font-semibold text-primary">{u.count}</span>
                    </div>
                    <ProgressBar value={(u.count / maxUserCount) * 100} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA Médio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            {sla > 0 ? (
              <>
                <div className="text-4xl font-bold"><SLAValue days={sla} /></div>
                <p className="mt-1 text-xs text-muted-foreground">Tempo médio da entrada até conclusão</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa concluída no período</p>
            )}
          </CardContent>
        </Card>
      </div>

      {areaData.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Áreas Mais Demandadas</CardTitle>
            <p className="text-xs text-muted-foreground">
              {areaData.reduce((s, d) => s + d.value, 0)} demandas concluídas em {areaData.length} áreas
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={areaData.length * 40 + 20}>
              <BarChart data={areaData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={95} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {areaData.map((_, i) => (
                    <Cell key={i} fill={areaColors[i % areaColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tarefas do Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={v => { setTab(v); setPage(0); }}>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="todas">Todas</TabsTrigger>
                <TabsTrigger value="abertas">Abertas</TabsTrigger>
                <TabsTrigger value="atrasadas">Atrasadas</TabsTrigger>
                <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
              </TabsList>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar tarefa..." className="pl-9" value={taskSearch} onChange={e => { setTaskSearch(e.target.value); setPage(0); }} />
              </div>
            </div>

            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Responsável</TableHead>
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
                      <TableCell className="max-w-[200px] truncate text-sm">{t.taskTitle}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.ownerUserLogin}</TableCell>
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

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredTasks.length)} de {filteredTasks.length}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
