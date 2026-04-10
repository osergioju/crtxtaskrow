import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { SLAValue } from "@/components/shared/SLAValue";
import { QueryErrorState, EmptyState } from "@/components/shared/QueryStates";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { calcSLA, calcSLATrend } from "@/lib/sla";
import type { TaskrowTask, TaskrowUser } from "@/types/taskrow";

const COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899"];

// Enhanced tooltip
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-bold text-foreground">{label || payload[0]?.payload?.name}</p>
      <p className="text-xs text-muted-foreground">{payload[0]?.value?.toFixed(1)} dias</p>
      {payload[0]?.payload?.total && (
        <p className="text-[10px] text-muted-foreground">{payload[0]?.payload?.total} tarefas concluídas</p>
      )}
    </div>
  );
};

// Custom active dot for line chart
const ActiveDot = (props: any) => {
  const { cx, cy } = props;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" opacity={0.2} />
      <circle cx={cx} cy={cy} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
    </g>
  );
};

export default function SLAView() {
  const { data: tasks, isLoading: loadingTasks, error: errorTasks, refetch } = useAllTasks();
  const { data: users } = useUsers();
  const [activeTab, setActiveTab] = useState("overview");

  const globalSLA = useMemo(() => tasks ? calcSLA(tasks) : 0, [tasks]);
  const trend = useMemo(() => tasks ? calcSLATrend(tasks) : [], [tasks]);

  const doneTasks = useMemo(() => tasks?.filter(t => t.closed && t.closeDate) || [], [tasks]);
  const fastestSLA = useMemo(() => {
    if (!doneTasks.length) return 0;
    return Math.min(...doneTasks.map(t => (new Date(t.closeDate!).getTime() - new Date(t.creationDate).getTime()) / 86400000));
  }, [doneTasks]);
  const slowestSLA = useMemo(() => {
    if (!doneTasks.length) return 0;
    return Math.max(...doneTasks.map(t => (new Date(t.closeDate!).getTime() - new Date(t.creationDate).getTime()) / 86400000));
  }, [doneTasks]);

  const clientSLA = useMemo(() => {
    if (!tasks) return [];
    const byClient = new Map<string, TaskrowTask[]>();
    tasks.forEach(t => {
      const name = t.clientDisplayName || t.clientNickName;
      const arr = byClient.get(name) || [];
      arr.push(t);
      byClient.set(name, arr);
    });
    return Array.from(byClient.entries())
      .map(([name, ct]) => ({ name, sla: calcSLA(ct), total: ct.filter(t => t.closed).length }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.sla - a.sla)
      .slice(0, 10);
  }, [tasks]);

  const areaSLA = useMemo(() => {
    if (!tasks || !users) return [];
    const userAreaMap = new Map<number, string>();
    (users as TaskrowUser[]).forEach(u => userAreaMap.set(u.UserID, u.FunctionGroupName || "Sem Área"));
    const byArea = new Map<string, TaskrowTask[]>();
    tasks.forEach(t => {
      const area = userAreaMap.get(t.ownerUserID) || "Sem Área";
      const arr = byArea.get(area) || [];
      arr.push(t);
      byArea.set(area, arr);
    });
    return Array.from(byArea.entries())
      .map(([name, at]) => ({ name, sla: calcSLA(at), total: at.filter(t => t.closed).length }))
      .filter(a => a.total > 0)
      .sort((a, b) => b.sla - a.sla);
  }, [tasks, users]);

  const userSLA = useMemo(() => {
    if (!tasks || !users) return [];
    const byUser = new Map<number, TaskrowTask[]>();
    tasks.forEach(t => {
      const arr = byUser.get(t.ownerUserID) || [];
      arr.push(t);
      byUser.set(t.ownerUserID, arr);
    });
    return Array.from(byUser.entries())
      .map(([uid, ut]) => {
        const user = (users as TaskrowUser[]).find(u => u.UserID === uid);
        return { name: user?.FullName || `User ${uid}`, sla: calcSLA(ut), total: ut.filter(t => t.closed).length };
      })
      .filter(u => u.total > 0)
      .sort((a, b) => b.sla - a.sla)
      .slice(0, 10);
  }, [tasks, users]);

  if (errorTasks) {
    return (
      <div>
        <PageHeader breadcrumb={["CRT", "SLA"]} title="Análise de SLA" subtitle="Tempo médio de entrega e tendências" />
        <QueryErrorState error={errorTasks as Error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "SLA"]} title="Análise de SLA" subtitle="Tempo médio de entrega e tendências" />

      {loadingTasks ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KPICard label="SLA MÉDIO GERAL" value={`${globalSLA}d`} color="indigo" size="sm" bgColored />
          <KPICard label="CONCLUÍDAS" value={doneTasks.length} color="green" size="sm" bgColored={false} />
          <KPICard label="MAIS RÁPIDA" value={`${fastestSLA.toFixed(1)}d`} color="green" size="sm" bgColored={false} />
          <KPICard label="MAIS LENTA" value={`${slowestSLA.toFixed(1)}d`} color="red" size="sm" bgColored={false} />
        </div>
      )}

      {/* SLA Trend with interactive tooltip */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tendência de SLA (dias médios por mês)</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={globalSLA} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `Média: ${globalSLA}d`, position: "right", fontSize: 10 }} />
                <Line
                  type="monotone"
                  dataKey="sla"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }}
                  activeDot={<ActiveDot />}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Sem dados de tendência" description="Ajuste o período de datas." />
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Por Cliente</TabsTrigger>
          <TabsTrigger value="area">Por Área</TabsTrigger>
          <TabsTrigger value="user">Por Colaborador</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA por Cliente (Top 10 mais lentos)</CardTitle>
            </CardHeader>
            <CardContent>
              {clientSLA.length > 0 ? (
                <ResponsiveContainer width="100%" height={clientSLA.length * 38 + 20}>
                  <BarChart data={clientSLA} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={95} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="sla" radius={[0, 4, 4, 0]} cursor="pointer" animationDuration={600}>
                      {clientSLA.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState title="Sem dados" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="area" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA por Área</CardTitle>
            </CardHeader>
            <CardContent>
              {areaSLA.length > 0 ? (
                <ResponsiveContainer width="100%" height={areaSLA.length * 38 + 20}>
                  <BarChart data={areaSLA} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={95} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="sla" radius={[0, 4, 4, 0]} cursor="pointer" animationDuration={600}>
                      {areaSLA.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState title="Sem dados" />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA por Colaborador (Top 10 mais lentos)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>COLABORADOR</TableHead>
                    <TableHead className="text-right">CONCLUÍDAS</TableHead>
                    <TableHead className="text-right">SLA MÉDIO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userSLA.map((u, i) => (
                    <TableRow key={i} className="transition-colors hover:bg-muted/50">
                      <TableCell className="text-sm font-medium">{u.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{u.total}</TableCell>
                      <TableCell className="text-right"><SLAValue days={u.sla} /></TableCell>
                    </TableRow>
                  ))}
                  {userSLA.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
