import { useState } from "react";
import {
  AlertTriangle, TrendingDown, TrendingUp, Minus, RefreshCw,
  Users, ShieldAlert, Star, ChevronDown, ChevronUp, Info, Database, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, CartesianGrid, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAnalytics, useRefreshAnalytics } from "@/hooks/useAnalytics";
import type { AnalyticsResult } from "@/types/analytics";
import type { AnalyticsAlert, AnalyticsClient, AnalyticsInsight, EmployeeRanking } from "@/types/analytics";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}
function num(v: number | null, decimals = 1) {
  if (v == null) return "—";
  return v.toFixed(decimals);
}
function fmt(v: number | null) {
  if (v == null) return "—";
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

const SEVERITY_COLORS = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
  warning:  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  info:     { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-400" },
};

const CLASS_COLORS = {
  healthy:  { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "#10B981" },
  warning:  { badge: "bg-amber-50 text-amber-700 border-amber-200", bar: "#F59E0B" },
  critical: { badge: "bg-red-50 text-red-700 border-red-200", bar: "#EF4444" },
};

// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: ReturnType<typeof useAnalytics>["data"] extends infer T ? T extends undefined ? never : T["summary"] : never }) {
  const cards = [
    {
      label: "Clientes Totais",
      value: summary.total_clients,
      icon: <Users className="h-4 w-4" />,
      sub: `${summary.healthy} saudáveis`,
      subColor: "text-emerald-600",
    },
    {
      label: "NPS Médio Geral",
      value: summary.overall_avg_nps != null ? summary.overall_avg_nps.toFixed(1) : "—",
      icon: <Star className="h-4 w-4" />,
      sub: "média de todos os clientes",
      subColor: "text-muted-foreground",
    },
    {
      label: "Em Risco",
      value: summary.critical,
      icon: <ShieldAlert className="h-4 w-4 text-red-500" />,
      sub: `${summary.warning} em atenção`,
      subColor: "text-amber-600",
    },
    {
      label: "Risco de Detrator",
      value: summary.high_detractor_risk,
      icon: <TrendingDown className="h-4 w-4 text-red-500" />,
      sub: "prob. > 60% de virar detrator",
      subColor: "text-muted-foreground",
    },
    {
      label: "Alertas Críticos",
      value: summary.critical_alerts,
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      sub: "requerem ação imediata",
      subColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label} className="py-3">
          <CardContent className="px-4 pt-0 pb-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              {c.icon}
            </div>
            <p className="text-2xl font-bold">{c.value}</p>
            <p className={`text-xs mt-0.5 ${c.subColor}`}>{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: AnalyticsAlert }) {
  const [open, setOpen] = useState(false);
  const c = SEVERITY_COLORS[alert.severity];
  return (
    <div className={`rounded-lg border p-3 ${c.bg} ${c.border}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${c.text}`}>{alert.title}</p>
          {open && (
            <p className={`text-xs mt-1 ${c.text} opacity-80`}>{alert.description}</p>
          )}
        </div>
        <button onClick={() => setOpen((v) => !v)} className={`shrink-0 ${c.text} opacity-60 hover:opacity-100`}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function AlertsSection({ alerts }: { alerts: AnalyticsAlert[] }) {
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum alerta ativo.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">
            Crítico ({critical.length})
          </p>
          <div className="space-y-2">
            {critical.map((a, i) => <AlertCard key={i} alert={a} />)}
          </div>
        </div>
      )}
      {warning.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            Atenção ({warning.length})
          </p>
          <div className="space-y-2">
            {warning.map((a, i) => <AlertCard key={i} alert={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────────

function InsightItem({ insight }: { insight: AnalyticsInsight }) {
  const c = SEVERITY_COLORS[insight.severity];
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 ${c.bg} ${c.border}`}>
      <Info className={`h-4 w-4 shrink-0 mt-0.5 ${c.text}`} />
      <p className={`text-sm ${c.text}`}>{insight.text}</p>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

function HealthBarChart({ clients }: { clients: AnalyticsClient[] }) {
  const data = [...clients]
    .filter((c) => c.health.score != null)
    .sort((a, b) => (b.health.score ?? 0) - (a.health.score ?? 0))
    .slice(0, 20)
    .map((c) => ({
      name: c.client_name.length > 14 ? c.client_name.slice(0, 13) + "…" : c.client_name,
      score: c.health.score,
      cls: c.health.classification ?? "warning",
    }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}`} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${v}`, "Health Score"]} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={CLASS_COLORS[entry.cls as keyof typeof CLASS_COLORS]?.bar ?? "#94A3B8"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NpsScatterChart({ clients }: { clients: AnalyticsClient[] }) {
  const data = clients
    .filter((c) => c.avg_nps != null && c.late_ratio != null)
    .map((c) => ({
      x: Math.round((c.late_ratio ?? 0) * 100),
      y: c.avg_nps,
      name: c.client_name,
      cls: c.health.classification ?? "warning",
    }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" name="Atraso %" unit="%" tick={{ fontSize: 11 }} label={{ value: "Taxa de Atraso (%)", position: "insideBottom", offset: -2, fontSize: 11 }} />
        <YAxis dataKey="y" name="NPS" domain={[0, 10]} tick={{ fontSize: 11 }} label={{ value: "NPS Médio", angle: -90, position: "insideLeft", fontSize: 11 }} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
          if (!payload?.length) return null;
          const d = payload[0].payload;
          return (
            <div className="rounded border bg-white px-2.5 py-1.5 text-xs shadow-sm">
              <p className="font-semibold">{d.name}</p>
              <p>Atraso: {d.x}%</p>
              <p>NPS: {d.y?.toFixed(1)}</p>
            </div>
          );
        }} />
        <Scatter data={data}>
          {data.map((entry, i) => (
            <Cell key={i} fill={CLASS_COLORS[entry.cls as keyof typeof CLASS_COLORS]?.bar ?? "#94A3B8"} fillOpacity={0.8} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ── Employee Table ────────────────────────────────────────────────────────────

const PERF_LABEL_COLORS: Record<string, string> = {
  "Top performer": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Regular":       "bg-blue-50 text-blue-700 border-blue-200",
  "Needs attention": "bg-red-50 text-red-700 border-red-200",
};

function EmployeeTable({ employees }: { employees: EmployeeRanking[] }) {
  if (employees.length === 0) return (
    <p className="text-sm text-muted-foreground">Nenhum dado de colaborador disponível.</p>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 pr-4 text-left font-medium">#</th>
            <th className="py-2 pr-4 text-left font-medium">Colaborador</th>
            <th className="py-2 pr-4 text-right font-medium">Score</th>
            <th className="py-2 pr-4 text-right font-medium">SLA</th>
            <th className="py-2 pr-4 text-right font-medium">Atraso</th>
            <th className="py-2 pr-4 text-right font-medium">Demandas</th>
            <th className="py-2 pr-4 text-right font-medium">Clientes</th>
            <th className="py-2 text-right font-medium">NPS médio</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2 pr-4 text-muted-foreground">{e.rank}</td>
              <td className="py-2 pr-4">
                <div>
                  <p className="font-medium">{e.display_name}</p>
                  <Badge variant="outline" className={`text-[0.65rem] px-1.5 py-0 ${PERF_LABEL_COLORS[e.label] ?? ""}`}>
                    {e.label}
                  </Badge>
                </div>
              </td>
              <td className="py-2 pr-4 text-right font-semibold">{e.performance_score?.toFixed(0) ?? "—"}</td>
              <td className="py-2 pr-4 text-right">{pct(e.sla)}</td>
              <td className="py-2 pr-4 text-right">{pct(e.late_ratio)}</td>
              <td className="py-2 pr-4 text-right">{e.total_demands}</td>
              <td className="py-2 pr-4 text-right">{e.client_count}</td>
              <td className="py-2 text-right">{fmt(e.avg_nps_of_clients)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Client Table ──────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ClientTable({ clients }: { clients: AnalyticsClient[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 pr-4 text-left font-medium">Cliente</th>
            <th className="py-2 pr-3 text-center font-medium">Saúde</th>
            <th className="py-2 pr-3 text-right font-medium">NPS atual</th>
            <th className="py-2 pr-3 text-right font-medium">NPS previsto</th>
            <th className="py-2 pr-3 text-center font-medium">Tendência</th>
            <th className="py-2 pr-3 text-right font-medium">Detrator</th>
            <th className="py-2 pr-3 text-right font-medium">SLA</th>
            <th className="py-2 pr-3 text-right font-medium">Atraso</th>
            <th className="py-2 text-right font-medium">Demandas</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const cls = c.health.classification ?? "warning";
            const clsStyle = CLASS_COLORS[cls as keyof typeof CLASS_COLORS];
            const detractorPct = c.prediction.prob_detractor != null
              ? Math.round(c.prediction.prob_detractor * 100)
              : null;

            return (
              <tr key={c.client_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-4">
                  <p className="font-medium">{c.client_name}</p>
                </td>
                <td className="py-2 pr-3 text-center">
                  <Badge variant="outline" className={`text-[0.65rem] px-1.5 py-0 ${clsStyle?.badge ?? ""}`}>
                    {c.health.score?.toFixed(0) ?? "—"} · {c.health.label}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-right font-mono">{num(c.avg_nps)}</td>
                <td className="py-2 pr-3 text-right font-mono">{num(c.prediction.next_nps)}</td>
                <td className="py-2 pr-3">
                  <div className="flex justify-center">
                    <TrendIcon trend={c.prediction.trend} />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right">
                  {detractorPct != null ? (
                    <span className={detractorPct >= 60 ? "text-red-600 font-semibold" : detractorPct >= 40 ? "text-amber-600" : ""}>
                      {detractorPct}%
                    </span>
                  ) : "—"}
                </td>
                <td className="py-2 pr-3 text-right">{pct(c.sla)}</td>
                <td className="py-2 pr-3 text-right">{pct(c.late_ratio)}</td>
                <td className="py-2 text-right">{c.total_demands}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsView() {
  const { data, isLoading, isError, error } = useAnalytics();
  const refresh = useRefreshAnalytics();

  const needsRefresh = data && "needs_refresh" in data && data.needs_refresh;
  const noKey = needsRefresh && (data as any).no_key;
  const fetchError = needsRefresh && (data as any).fetch_error;
  const result = (!needsRefresh && data) ? data as AnalyticsResult : null;

  const generatedAt = result?.generated_at
    ? new Date(result.generated_at).toLocaleString("pt-BR")
    : null;

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "Análise Preditiva"]}
        title="Análise Preditiva de NPS"
        subtitle="Health scores, previsões e alertas gerados automaticamente"
      >
        <div className="flex items-center gap-2">
          {generatedAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              Atualizado: {generatedAt}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || isLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Processando…" : "Atualizar"}
          </Button>
        </div>
      </PageHeader>

      <div className="mt-4 space-y-5">
        {isLoading && <LoadingSkeleton />}

        {/* Servidor buscando dados da Taskrow pela primeira vez */}
        {!isLoading && needsRefresh && !noKey && !fetchError && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-10 text-center">
              <Loader2 className="mx-auto h-8 w-8 text-blue-400 mb-3 animate-spin" />
              <p className="text-sm font-semibold text-blue-700">Buscando dados do Taskrow...</p>
              <p className="text-xs text-blue-600 mt-1">
                Primeira carga — importando todas as tarefas. Clique em Atualizar quando terminar.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Sem API key configurada no servidor */}
        {!isLoading && noKey && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-10 text-center">
              <Database className="mx-auto h-8 w-8 text-amber-400 mb-3" />
              <p className="text-sm font-semibold text-amber-700">API Key não configurada</p>
              <p className="text-xs text-amber-600 mt-1 max-w-sm mx-auto">
                Configure sua API Key do Taskrow (ícone de chave no menu) e clique em Atualizar.
              </p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
                {refresh.isPending ? "Buscando…" : "Atualizar agora"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Erro no fetch da Taskrow */}
        {!isLoading && fetchError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-400 mb-2" />
              <p className="text-sm font-semibold text-red-700">Erro ao buscar dados do Taskrow</p>
              <p className="text-xs text-red-600 mt-1">{fetchError}</p>
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-400 mb-2" />
              <p className="text-sm font-semibold text-red-700">Erro ao carregar análise</p>
              <p className="text-xs text-red-600 mt-1">{(error as Error)?.message}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Verifique se o Python 3 e as dependências do analytics estão instalados.
              </p>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {/* Summary */}
            <SummaryCards summary={result.summary} />

            <Tabs defaultValue="overview">
              <TabsList className="h-8 text-xs">
                <TabsTrigger value="overview" className="text-xs">Visão Geral</TabsTrigger>
                <TabsTrigger value="clientes" className="text-xs">
                  Clientes
                  {result.summary.critical > 0 && (
                    <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[0.6rem]">
                      {result.summary.critical}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="colaboradores" className="text-xs">Colaboradores</TabsTrigger>
                <TabsTrigger value="alertas" className="text-xs">
                  Alertas
                  {result.summary.critical_alerts > 0 && (
                    <Badge variant="destructive" className="ml-1.5 h-4 px-1 text-[0.6rem]">
                      {result.summary.critical_alerts}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
              </TabsList>

              {/* ── Visão Geral ── */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">Ranking de Saúde dos Clientes</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-3">
                      <HealthBarChart clients={result.clients} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">NPS vs Taxa de Atraso</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-3">
                      <NpsScatterChart clients={result.clients} />
                    </CardContent>
                  </Card>
                </div>

                {/* Top correlations */}
                {result.correlations.details.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">Correlações com NPS</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="space-y-2">
                        {result.correlations.details.filter((d) => d.significant).slice(0, 5).map((c) => (
                          <div key={c.feature} className="flex items-center gap-3">
                            <div className="w-40 shrink-0">
                              <p className="text-xs font-medium truncate">{c.label}</p>
                              <p className="text-[0.65rem] text-muted-foreground capitalize">{c.strength} · {c.direction}</p>
                            </div>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${(c.spearman_r ?? 0) < 0 ? "bg-red-400" : "bg-emerald-400"}`}
                                style={{ width: `${Math.abs(c.spearman_r ?? 0) * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-mono w-12 text-right ${(c.spearman_r ?? 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {(c.spearman_r ?? 0) > 0 ? "+" : ""}{(c.spearman_r ?? 0).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        {result.correlations.details.every((d) => !d.significant) && (
                          <p className="text-xs text-muted-foreground">Dados insuficientes para correlações estatisticamente significativas.</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── Clientes ── */}
              <TabsContent value="clientes" className="mt-4">
                <Card>
                  <CardContent className="px-4 py-4">
                    <ClientTable clients={result.clients} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Colaboradores ── */}
              <TabsContent value="colaboradores" className="mt-4">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold">
                      Ranking de Performance — {result.rankings.employees.length} colaboradores
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <EmployeeTable employees={result.rankings.employees} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Alertas ── */}
              <TabsContent value="alertas" className="mt-4">
                <AlertsSection alerts={result.alerts} />
              </TabsContent>

              {/* ── Insights ── */}
              <TabsContent value="insights" className="mt-4 space-y-2">
                {result.insights.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum insight gerado ainda.
                    </CardContent>
                  </Card>
                ) : (
                  result.insights.map((insight, i) => <InsightItem key={i} insight={insight} />)
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
