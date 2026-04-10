import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Inbox, Heart, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { KPICard } from "@/components/shared/KPICard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { QueryErrorState, EmptyState } from "@/components/shared/QueryStates";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { useClients } from "@/hooks/useClients";
import { classifyTask } from "@/lib/classifyTask";
import { calcRiskScore } from "@/lib/riskScore";
import type { TaskrowTask, TaskrowUser, TaskStatus } from "@/types/taskrow";

// Nomes (parciais, case-insensitive) das pessoas classificadas como Gestão.
// Edite esta lista para adicionar ou remover membros.
const GESTAO_NAMES = ["giu", "sérgio junior", "isabel aquino", "bruno", "michelle"];

function countByStatus(tasks: TaskrowTask[]) {
  const counts: Record<TaskStatus, number> = {
    andamento: 0, backlog: 0, atraso: 0, em_dia: 0, retrabalho: 0, urgente: 0, concluida: 0,
  };
  tasks.forEach(t => { counts[classifyTask(t)]++; });
  return counts;
}

function getUserMetrics(tasks: TaskrowTask[], users: TaskrowUser[]) {
  const byUser = new Map<number, TaskrowTask[]>();
  tasks.forEach(t => {
    const arr = byUser.get(t.ownerUserID) || [];
    arr.push(t);
    byUser.set(t.ownerUserID, arr);
  });

  return Array.from(byUser.entries())
    .map(([uid, uTasks]) => {
      const user = users.find(u => u.UserID === uid);
      const c = countByStatus(uTasks);
      return { uid, name: user?.FullName || `User ${uid}`, area: user?.FunctionGroupName || "", profile: user?.ProfileTitle || "", tasks: uTasks, counts: c, total: uTasks.length };
    })
    .sort((a, b) => b.total - a.total);
}

function healthScore(c: ReturnType<typeof countByStatus>, total: number) {
  if (total === 0) return 100;
  const pctAtraso = (c.atraso / total) * 100;
  const pctRetrabalho = (c.retrabalho / total) * 100;
  const pctUrgente = (c.urgente / total) * 100;
  const penalty = pctAtraso * 0.45 + pctRetrabalho * 0.30 + pctUrgente * 0.25;
  return { score: Math.max(0, Math.round(100 - penalty)), pctAtraso, pctRetrabalho, pctUrgente };
}

// ─── Team Health Card ──────────────────────────────────────────────────────────

function TeamHealthCard({ tasks, users }: { tasks: TaskrowTask[]; users: TaskrowUser[] }) {
  const open = tasks.filter(t => !t.closed);

  const areaData = useMemo(() => {
    const areaMap = new Map<string, TaskrowTask[]>();
    open.forEach(t => {
      const user = users.find(u => u.UserID === t.ownerUserID);
      const area = user?.FunctionGroupName || "Sem área";
      const arr = areaMap.get(area) || [];
      arr.push(t);
      areaMap.set(area, arr);
    });

    return Array.from(areaMap.entries())
      .map(([area, areaTasks]) => {
        const c = countByStatus(areaTasks);
        const { score, pctAtraso, pctRetrabalho, pctUrgente } = healthScore(c, areaTasks.length);
        return { area, score, pctAtraso, pctRetrabalho, pctUrgente, total: areaTasks.length };
      })
      .sort((a, b) => a.score - b.score);
  }, [open, users]);

  if (areaData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saúde do Time</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[340px] overflow-y-auto space-y-4 pr-1">
          {areaData.map(({ area, score, pctAtraso, pctRetrabalho, pctUrgente, total }) => {
            const { statusLabel, textColor, barColor, badgeClass } = score >= 70
              ? { statusLabel: "Saudável", textColor: "text-emerald-600", barColor: "bg-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" }
              : score >= 40
                ? { statusLabel: "Atenção", textColor: "text-amber-600", barColor: "bg-amber-500", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" }
                : { statusLabel: "Crítico", textColor: "text-red-600", barColor: "bg-red-500", badgeClass: "bg-red-50 text-red-700 border-red-200" };

            return (
              <div key={area} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">{area}</span>
                  <Badge variant="outline" className={`text-[0.65rem] px-1.5 py-0 ${badgeClass}`}>
                    {statusLabel}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${textColor}`}>{score}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-xs font-bold text-destructive">{pctAtraso.toFixed(0)}%</p>
                    <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Atraso</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-orange-500">{pctRetrabalho.toFixed(0)}%</p>
                    <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Retrabalho</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{pctUrgente.toFixed(0)}%</p>
                    <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">Urgente</p>
                  </div>
                </div>

                <p className="text-[0.65rem] text-muted-foreground">{total} tarefas abertas</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Load Balance Card ─────────────────────────────────────────────────────────

function LoadBalanceCard({ tasks, users }: { tasks: TaskrowTask[]; users: TaskrowUser[] }) {
  const open = tasks.filter(t => !t.closed);

  const areaData = useMemo(() => {
    const userTaskCounts = new Map<number, number>();
    open.forEach(t => {
      userTaskCounts.set(t.ownerUserID, (userTaskCounts.get(t.ownerUserID) || 0) + 1);
    });

    const areaMap = new Map<string, { uid: number; name: string; count: number }[]>();
    userTaskCounts.forEach((count, uid) => {
      const user = users.find(u => u.UserID === uid);
      const area = user?.FunctionGroupName || "Sem área";
      const firstName = user?.FullName?.split(" ")[0] || `User ${uid}`;
      const arr = areaMap.get(area) || [];
      arr.push({ uid, name: firstName, count });
      areaMap.set(area, arr);
    });

    return Array.from(areaMap.entries())
      .map(([area, members]) => {
        const vals = members.map(m => m.count);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        const cv = mean > 0 ? std / mean : 0;
        const balanceIndex = Math.max(0, Math.round(100 - cv * 80));
        const maxCount = Math.max(...vals, 1);
        const threshold = mean + 1.5 * std;
        return {
          area,
          members: [...members].sort((a, b) => b.count - a.count),
          mean,
          balanceIndex,
          maxCount,
          threshold,
        };
      })
      .sort((a, b) => a.balanceIndex - b.balanceIndex);
  }, [open, users]);

  if (areaData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Equilíbrio de Carga</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[340px] overflow-y-auto space-y-4 pr-1">
          {areaData.map(({ area, members, mean, balanceIndex, maxCount, threshold }) => {
            const { statusLabel, badgeClass } = balanceIndex >= 70
              ? { statusLabel: "Equilibrado", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" }
              : balanceIndex >= 40
                ? { statusLabel: "Atenção", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" }
                : { statusLabel: "Desbalanceado", badgeClass: "bg-red-50 text-red-700 border-red-200" };

            return (
              <div key={area} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">{area}</span>
                  <Badge variant="outline" className={`text-[0.65rem] px-1.5 py-0 ${badgeClass}`}>
                    {statusLabel}
                  </Badge>
                </div>

                <div className="space-y-1">
                  {members.map(({ uid, name, count }) => {
                    const overloaded = count > threshold;
                    return (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="w-[5.5rem] shrink-0 truncate text-xs text-muted-foreground">{name}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${overloaded ? "bg-amber-500" : "bg-primary/50"}`}
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className={`w-5 shrink-0 text-right text-xs font-semibold ${overloaded ? "text-amber-600" : "text-foreground"}`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[0.65rem] text-muted-foreground">
                  Média {mean.toFixed(1)} tarefas/pessoa
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export default function Overview() {
  const navigate = useNavigate();
  const { data: tasks, isLoading: loadingTasks, error: errorTasks, refetch: refetchTasks } = useAllTasks();
  const { data: users } = useUsers();
  const { data: clients } = useClients();

  const counts = useMemo(() => tasks ? countByStatus(tasks) : null, [tasks]);

  const { gestao, operacao } = useMemo(() => {
    if (!tasks || !users) return { gestao: [], operacao: [] };
    const all = getUserMetrics(tasks, users);
    const g = all.filter(u => GESTAO_NAMES.some(name => u.name.toLowerCase().includes(name)));
    const gIds = new Set(g.map(u => u.uid));
    const o = all.filter(u => !gIds.has(u.uid)).slice(0, 8);
    return { gestao: g, operacao: o };
  }, [tasks, users]);

  const clientRisks = useMemo(() => {
    if (!tasks || !clients) return [];
    const byClient = new Map<number, TaskrowTask[]>();
    tasks.forEach(t => {
      const arr = byClient.get(t.clientID) || [];
      arr.push(t);
      byClient.set(t.clientID, arr);
    });
    return Array.from(byClient.entries())
      .map(([cid, cTasks]) => {
        const client = clients.find((c: any) => c.ClientID === cid);
        return { name: client?.ClientName || cTasks[0]?.clientDisplayName || `Cliente ${cid}`, score: calcRiskScore(cTasks) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [tasks, clients]);

  if (errorTasks) {
    return (
      <div>
        <PageHeader breadcrumb={["CRT", "PAINEL DE CONTROLE"]} title="Visão Geral" subtitle="Panorama das demandas e desempenho do time" />
        <QueryErrorState error={errorTasks as Error} onRetry={() => refetchTasks()} />
      </div>
    );
  }

  const maxTasks = Math.max(...[...gestao, ...operacao].map(u => u.total), 1);
  const totalActive = counts
    ? counts.andamento + counts.em_dia + counts.atraso + counts.backlog + counts.retrabalho + counts.urgente
    : 0;

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "PAINEL DE CONTROLE"]} title="Visão Geral" subtitle="Panorama das demandas e desempenho do time" />

      {loadingTasks || !counts ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <KPICard
            label="EM ANDAMENTO"
            value={totalActive}
            color="indigo"
            bgColored
            onClick={() => navigate("/tarefas?status=abertas")}
          />
          <KPICard
            label="EM ATRASO"
            value={counts.atraso}
            color="red"
            bgColored
            onClick={() => navigate("/tarefas?status=atraso")}
          />
          <KPICard
            label="EM DIA"
            value={counts.em_dia}
            color="green"
            bgColored
            onClick={() => navigate("/tarefas?status=em_dia")}
          />
          <KPICard
            label="RETRABALHO"
            value={counts.retrabalho}
            color="orange"
            bgColored={false}
            onClick={() => navigate("/tarefas?status=retrabalho")}
          />
          <KPICard
            label="URGENTE"
            value={counts.urgente}
            color="dark"
            bgColored={false}
            onClick={() => navigate("/tarefas?status=urgente")}
          />
        </div>
      )}

      {!loadingTasks && tasks?.length === 0 && (
        <EmptyState
          icon={<Inbox className="h-6 w-6 text-muted-foreground" />}
          title="Nenhuma tarefa no período"
          description="Altere o filtro de datas para visualizar tarefas."
          className="mt-6"
        />
      )}

      {tasks && tasks.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <RankingCard
              title="Gestão"
              subtitle="Distribuição entre lideranças"
              items={gestao}
              maxTasks={maxTasks}
              showMedals
              onUserClick={uid => navigate(`/colaboradores/${uid}`)}
            />
            <RankingCard
              title="Operação"
              subtitle="Distribuição das demandas operacionais"
              items={operacao}
              maxTasks={maxTasks}
              onUserClick={uid => navigate(`/colaboradores/${uid}`)}
            />

            <div className="flex flex-col gap-4">
              {counts && counts.atraso > 0 && (
                <Card
                  className="cursor-pointer border-destructive/20 bg-destructive/5 transition-all hover:shadow-md active:scale-[0.99]"
                  onClick={() => navigate("/tarefas?status=atraso")}
                >
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive">
                      <Bell className="h-5 w-5 text-destructive-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-destructive">Atenção Crítica</p>
                      <p className="text-3xl font-bold text-destructive">{counts.atraso}</p>
                      <p className="text-xs text-muted-foreground">em atraso — Clique para ver detalhes.</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ranking de Risco</CardTitle>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/clientes")}>
                      Ver todos →
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {clientRisks.map((cr, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{i + 1}. {cr.name}</p>
                        <p className="text-xs text-muted-foreground">Score: {cr.score}</p>
                      </div>
                      <RiskBadge score={cr.score} />
                    </div>
                  ))}
                  {clientRisks.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum dado disponível</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Health & Balance row */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <TeamHealthCard tasks={tasks} users={(users as TaskrowUser[]) || []} />
            <LoadBalanceCard tasks={tasks} users={(users as TaskrowUser[]) || []} />
          </div>
        </>
      )}
    </div>
  );
}

function RankingCard({
  title,
  subtitle,
  items,
  maxTasks,
  showMedals,
  onUserClick,
}: {
  title: string;
  subtitle: string;
  items: ReturnType<typeof getUserMetrics>;
  maxTasks: number;
  showMedals?: boolean;
  onUserClick?: (uid: number) => void;
}) {
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-[320px] overflow-y-auto">
          <div className="space-y-1">
            {items.map((u, i) => {
              const pctAtraso = u.total > 0 ? (u.counts.atraso / u.total) * 100 : 0;
              return (
                <div
                  key={u.uid}
                  className={`-mx-1 rounded-lg p-1.5 space-y-1 ${onUserClick ? "cursor-pointer hover:bg-muted/60 transition-colors" : ""}`}
                  onClick={() => onUserClick?.(u.uid)}
                >
                  <div className="flex items-center gap-2">
                    {showMedals && i < 3 ? (
                      <span className="w-6 text-center text-lg">{medals[i]}</span>
                    ) : (
                      <UserAvatar name={u.name} size={32} />
                    )}
                    <span className="flex-1 truncate text-sm font-medium">{u.name}</span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold text-primary">{u.counts.andamento + u.counts.em_dia}</span>
                      <span className="font-semibold text-destructive">{u.counts.atraso}</span>
                      <span className="font-semibold text-emerald-600">{u.counts.concluida}</span>
                      <span className="font-semibold text-amber-500">{u.counts.backlog}</span>
                      {u.counts.urgente > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                          {u.counts.urgente}
                        </span>
                      )}
                    </div>
                  </div>
                  <ProgressBar value={(u.total / maxTasks) * 100} danger={pctAtraso > 40} />
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhum dado disponível</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
