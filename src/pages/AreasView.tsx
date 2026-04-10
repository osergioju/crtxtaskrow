import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Inbox } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Sector,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { SLAValue } from "@/components/shared/SLAValue";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { QueryErrorState, EmptyState } from "@/components/shared/QueryStates";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { classifyTask, getStatusLabel, getStatusColor } from "@/lib/classifyTask";
import { calcSLA } from "@/lib/sla";
import type { TaskrowTask, TaskrowUser, TaskStatus } from "@/types/taskrow";

const AREA_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6", "#A855F7"];

interface AreaMetrics {
  area: string;
  users: number;
  total: number;
  andamento: number;
  concluidas: number;
  atrasadas: number;
  emDia: number;
  backlog: number;
  retrabalho: number;
  urgente: number;
  sla: number;
}

function buildAreaMetrics(tasks: TaskrowTask[], users: TaskrowUser[]): AreaMetrics[] {
  const userAreaMap = new Map<number, string>();
  users.forEach(u => userAreaMap.set(u.UserID, u.FunctionGroupName || "Sem Área"));

  const byArea = new Map<string, { tasks: TaskrowTask[]; userIds: Set<number> }>();

  tasks.forEach(t => {
    const area = userAreaMap.get(t.ownerUserID) || "Sem Área";
    if (!byArea.has(area)) byArea.set(area, { tasks: [], userIds: new Set() });
    const entry = byArea.get(area)!;
    entry.tasks.push(t);
    entry.userIds.add(t.ownerUserID);
  });

  return Array.from(byArea.entries()).map(([area, { tasks: at, userIds }]) => {
    let andamento = 0, concluidas = 0, atrasadas = 0, emDia = 0, backlog = 0, retrabalho = 0, urgente = 0;
    at.forEach(t => {
      const s = classifyTask(t);
      if (s === "concluida") concluidas++;
      else if (s === "atraso") atrasadas++;
      else if (s === "em_dia") emDia++;
      else if (s === "backlog") backlog++;
      else if (s === "retrabalho") retrabalho++;
      else if (s === "urgente") urgente++;
      else andamento++;
    });
    return {
      area, users: userIds.size, total: at.length,
      andamento, concluidas, atrasadas, emDia, backlog, retrabalho, urgente,
      sla: calcSLA(at),
    };
  }).sort((a, b) => b.total - a.total);
}

// Active shape for interactive pie chart
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} dy={0} textAnchor="middle" fill="currentColor" className="text-xs font-bold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} dy={0} textAnchor="middle" fill="currentColor" className="text-[10px]">
        {value} ({(percent * 100).toFixed(0)}%)
      </text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={innerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.3} />
    </g>
  );
};

// Custom tooltip for bar chart
const BarTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-foreground">{d.payload.name}</p>
      <p className="text-xs text-muted-foreground">{d.value} tarefas</p>
    </div>
  );
};

export default function AreasView() {
  const { data: tasks, isLoading: loadingTasks, error: errorTasks, refetch } = useAllTasks();
  const { data: users, isLoading: loadingUsers } = useUsers();
  const [search, setSearch] = useState("");
  const [activePieIndex, setActivePieIndex] = useState(0);
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    if (!tasks || !users) return [];
    return buildAreaMetrics(tasks, users as TaskrowUser[]);
  }, [tasks, users]);

  const filtered = useMemo(() => {
    if (!search) return metrics;
    const q = search.toLowerCase();
    return metrics.filter(m => m.area.toLowerCase().includes(q));
  }, [metrics, search]);

  const loading = loadingTasks || loadingUsers;
  const totalAreas = metrics.length;
  const totalTasks = metrics.reduce((s, m) => s + m.total, 0);
  const totalOverdue = metrics.reduce((s, m) => s + m.atrasadas, 0);
  const maxArea = metrics.length > 0 ? metrics[0] : null;

  const chartData = useMemo(() => metrics.slice(0, 10).map(m => ({ name: m.area, value: m.total })), [metrics]);

  const statusDistribution = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<TaskStatus, number> = { andamento: 0, backlog: 0, atraso: 0, em_dia: 0, retrabalho: 0, urgente: 0, concluida: 0 };
    tasks.forEach(t => { counts[classifyTask(t)]++; });
    return (Object.entries(counts) as [TaskStatus, number][])
      .filter(([, v]) => v > 0)
      .map(([s, v]) => ({ name: getStatusLabel(s), value: v, fill: getStatusColor(s) }));
  }, [tasks]);

  if (errorTasks) {
    return (
      <div>
        <PageHeader breadcrumb={["CRT", "ÁREAS"]} title="Visão por Área" subtitle="Performance e carga de trabalho por departamento" />
        <QueryErrorState error={errorTasks as Error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "ÁREAS"]} title="Visão por Área" subtitle="Performance e carga de trabalho por departamento" />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPICard label="ÁREAS ATIVAS" value={totalAreas} color="indigo" size="sm" />
          <KPICard label="TASKS NO PERÍODO" value={totalTasks} color="indigo" size="sm" bgColored={false} />
          <KPICard label="EM ATRASO" value={totalOverdue} color="red" size="sm" bgColored />
          <KPICard label="ÁREA COM MAIS CARGA" value={maxArea?.area || "—"} color="amber" size="sm" bgColored={false} />
        </div>
      )}

      {!loading && metrics.length === 0 && (
        <EmptyState icon={<Inbox className="h-6 w-6 text-muted-foreground" />} title="Nenhuma área encontrada" className="mt-6" />
      )}

      {metrics.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Volume por Área</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={chartData.length * 38 + 20}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={95} />
                    <Tooltip content={<BarTooltip />} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer" animationDuration={800}>
                      {chartData.map((_, i) => <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Distribuição Geral de Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      activeIndex={activePieIndex}
                      activeShape={renderActiveShape}
                      onMouseEnter={(_, index) => setActivePieIndex(index)}
                      animationDuration={600}
                    >
                      {statusDistribution.map((d, i) => <Cell key={i} fill={d.fill} cursor="pointer" />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar área..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Badge variant="secondary">{filtered.length} áreas</Badge>
          </div>

          <Card className="mt-4 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ÁREA</TableHead>
                  <TableHead className="text-right">PESSOAS</TableHead>
                  <TableHead className="text-right">TOTAL</TableHead>
                  <TableHead className="text-right">ANDAMENTO</TableHead>
                  <TableHead className="text-right">CONCLUÍDAS</TableHead>
                  <TableHead className="text-right">ATRASADAS</TableHead>
                  <TableHead className="text-right">EM DIA</TableHead>
                  <TableHead className="text-right">BACKLOG</TableHead>
                  <TableHead className="text-right">URGENTE</TableHead>
                  <TableHead className="text-right">SLA</TableHead>
                  <TableHead className="w-24">CARGA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 11 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : filtered.map(m => {
                      const maxTotal = metrics[0]?.total || 1;
                      const pctAtraso = m.total > 0 ? (m.atrasadas / m.total) * 100 : 0;
                      return (
                        <TableRow key={m.area} className="cursor-pointer transition-colors hover:bg-muted/50">
                          <TableCell className="font-medium">{m.area}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{m.users}</TableCell>
                          <TableCell className="text-right font-bold text-primary">{m.total}</TableCell>
                          <TableCell className="text-right">{m.andamento}</TableCell>
                          <TableCell className="text-right text-emerald-600">{m.concluidas}</TableCell>
                          <TableCell className="text-right">
                            {m.atrasadas > 0 ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">{m.atrasadas}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600">{m.emDia}</TableCell>
                          <TableCell className="text-right text-amber-500">{m.backlog}</TableCell>
                          <TableCell className="text-right">{m.urgente}</TableCell>
                          <TableCell className="text-right"><SLAValue days={m.sla} /></TableCell>
                          <TableCell><ProgressBar value={(m.total / maxTotal) * 100} danger={pctAtraso > 40} /></TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
