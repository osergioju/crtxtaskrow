import { useMemo } from "react";
import { RefreshCw, Gauge, AlertTriangle, TrendingUp, Users, Building2, FlaskConical, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryErrorState } from "@/components/shared/QueryStates";
import { CapacityYearHeatmap } from "@/components/capacity/CapacityYearHeatmap";
import { CapacityMonthDetail } from "@/components/capacity/CapacityMonthDetail";
import { CapacityAlerts } from "@/components/capacity/CapacityAlerts";
import { CapacityUserPanel } from "@/components/capacity/CapacityUserPanel";
import { CapacityClientPanel } from "@/components/capacity/CapacityClientPanel";
import { CapacitySimulator } from "@/components/capacity/CapacitySimulator";
import { CapacityForecast } from "@/components/capacity/CapacityForecast";
import { CapacityZonePill } from "@/components/capacity/CapacityZonePill";
import { CapacityGuide } from "@/components/capacity/CapacityGuide";
import { ZONE_CONFIG, scoreToZone } from "@/lib/capacityEngine";
import { useCapacityData } from "@/hooks/useCapacityData";
import { useCapacityStore } from "@/store/capacityStore";
import { cn } from "@/lib/utils";

// ─── Summary KPIs ─────────────────────────────────────────────────────────────

interface SummaryKPIsProps {
  avgScore: number;
  peakScore: number;
  peakPeriodLabel: string;
  criticalFutureCount: number;
  totalOpenTasks: number;
  totalUsers: number;
  isLoading?: boolean;
}

function SummaryKPIs({ avgScore, peakScore, peakPeriodLabel, criticalFutureCount, totalOpenTasks, totalUsers, isLoading }: SummaryKPIsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const avgZone = scoreToZone(avgScore);
  const peakZone = scoreToZone(peakScore);
  const avgCfg = ZONE_CONFIG[avgZone];
  const peakCfg = ZONE_CONFIG[peakZone];

  const kpis = [
    {
      label: "SCORE MÉDIO",
      value: `${avgScore}%`,
      sub: avgCfg.label,
      textClass: avgCfg.textClass,
      bgClass: avgCfg.bgClass,
      borderClass: avgCfg.borderClass,
    },
    {
      label: "PICO MÁXIMO",
      value: `${peakScore}%`,
      sub: peakPeriodLabel,
      textClass: peakCfg.textClass,
      bgClass: peakCfg.bgClass,
      borderClass: peakCfg.borderClass,
    },
    {
      label: "MESES CRÍTICOS",
      value: criticalFutureCount,
      sub: "futuros",
      textClass: criticalFutureCount > 0 ? "text-destructive" : "text-emerald-600",
      bgClass: criticalFutureCount > 0 ? "bg-destructive/5" : "bg-emerald-50",
      borderClass: criticalFutureCount > 0 ? "border-destructive/20" : "border-emerald-200",
    },
    {
      label: "TAREFAS ABERTAS",
      value: totalOpenTasks,
      sub: "mês atual",
      textClass: "text-foreground",
      bgClass: "bg-card",
      borderClass: "border-border",
    },
    {
      label: "USUÁRIOS ATIVOS",
      value: totalUsers,
      sub: "no período",
      textClass: "text-foreground",
      bgClass: "bg-card",
      borderClass: "border-border",
    },
    {
      label: "STATUS GERAL",
      value: avgCfg.label,
      sub: `${avgScore}% de carga`,
      textClass: avgCfg.textClass,
      bgClass: avgCfg.bgClass,
      borderClass: avgCfg.borderClass,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((k) => (
        <Card key={k.label} className={cn("border p-4 transition-all", k.bgClass, k.borderClass)}>
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
          <p className={cn("mt-1 text-2xl font-bold leading-none", k.textClass)}>{k.value}</p>
          {k.sub && <p className="mt-1 text-[0.65rem] text-muted-foreground">{k.sub}</p>}
        </Card>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CapacityView() {
  const {
    scores, periods, globalAlerts, userBreakdown,
    clientBreakdown, forecast, simResults,
    summaryStats, isLoading, error, refetch,
  } = useCapacityData();

  const { selectedPeriodKey, setSelectedPeriodKey, activeTab, setActiveTab, simulationActive } = useCapacityStore();

  const selectedScore = useMemo(
    () => scores.find(s => s.period.key === selectedPeriodKey) || null,
    [scores, selectedPeriodKey]
  );

  const criticalCount = globalAlerts.filter(a => a.severity === "critical").length;

  if (error) {
    return (
      <div>
        <PageHeader
          breadcrumb={["CRT", "CAPACIDADE"]}
          title="Workload Intelligence"
          subtitle="Radar operacional e previsão de capacidade"
        />
        <QueryErrorState error={error as Error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "CAPACIDADE"]}
        title="Workload Intelligence"
        subtitle="Radar operacional · Previsão de colapso · Simulação de impacto"
      >
        <div className="flex items-center gap-2">
          {!isLoading && criticalCount > 0 && (
            <Badge variant="outline" className="gap-1.5 border-destructive/30 bg-destructive/5 text-destructive text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              {criticalCount} alerta{criticalCount > 1 ? "s" : ""} crítico{criticalCount > 1 ? "s" : ""}
            </Badge>
          )}
          {simulationActive && (
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-xs">
              <FlaskConical className="h-3 w-3 mr-1" />
              Simulação ativa
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </PageHeader>

      {/* KPI Row */}
      {summaryStats && (
        <SummaryKPIs
          {...summaryStats}
          isLoading={isLoading}
        />
      )}
      {isLoading && !summaryStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-5 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-9 gap-0.5 bg-muted/60 p-1">
              <TabsTrigger value="heatmap" className="h-7 text-xs px-3 gap-1.5">
                <Gauge className="h-3.5 w-3.5" />
                Heatmap
              </TabsTrigger>
              <TabsTrigger value="forecast" className="h-7 text-xs px-3 gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Forecast
              </TabsTrigger>
              <TabsTrigger value="users" className="h-7 text-xs px-3 gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Equipe
              </TabsTrigger>
              <TabsTrigger value="clients" className="h-7 text-xs px-3 gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Clientes
              </TabsTrigger>
              <TabsTrigger value="alerts" className="h-7 text-xs px-3 relative gap-1.5">
                <BellRing className="h-3.5 w-3.5" />
                Alertas
                {criticalCount > 0 && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[0.58rem] font-bold text-white">
                    {criticalCount > 9 ? "9+" : criticalCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ─── Heatmap Tab ───────────────────────────────────────────────── */}
            <TabsContent value="heatmap" className="mt-4 space-y-5">
              <CapacityYearHeatmap
                scores={scores}
                selectedPeriodKey={selectedPeriodKey}
                onSelectPeriod={setSelectedPeriodKey}
                isLoading={isLoading}
              />

              {/* Selected month drill-down (inline on mobile, moved to sidebar on desktop) */}
              {selectedScore && (
                <div className="lg:hidden">
                  <CapacityMonthDetail ps={selectedScore} />
                </div>
              )}

              {/* Explanatory guide */}
              <CapacityGuide />
            </TabsContent>

            {/* ─── Forecast Tab ─────────────────────────────────────────────── */}
            <TabsContent value="forecast" className="mt-4">
              <CapacityForecast
                forecast={forecast}
                isLoading={isLoading}
                onSelectPeriod={(key) => {
                  setSelectedPeriodKey(key);
                  setActiveTab("heatmap");
                }}
              />
            </TabsContent>

            {/* ─── Users Tab ────────────────────────────────────────────────── */}
            <TabsContent value="users" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Carga por Colaborador
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Número de tarefas por mês. Células mais escuras = mais sobrecarregado.
                  </p>
                </CardHeader>
                <CardContent>
                  <CapacityUserPanel
                    users={userBreakdown}
                    periods={periods}
                    isLoading={isLoading}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Clients Tab ──────────────────────────────────────────────── */}
            <TabsContent value="clients" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Consumo de Capacidade por Cliente
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Qual cliente mais pesa na operação, com pendências e retrabalho.
                  </p>
                </CardHeader>
                <CardContent>
                  <CapacityClientPanel
                    clients={clientBreakdown}
                    isLoading={isLoading}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Alerts Tab ───────────────────────────────────────────────── */}
            <TabsContent value="alerts" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-muted-foreground" />
                    Central de Alertas Operacionais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CapacityAlerts alerts={globalAlerts} isLoading={isLoading} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right sidebar */}
        <div className="hidden lg:flex flex-col gap-4">
          {/* Month detail — shows when a month is selected */}
          {selectedScore ? (
            <CapacityMonthDetail ps={selectedScore} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <Gauge className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground">
                  Clique em um mês no heatmap para ver o detalhe
                </p>
              </CardContent>
            </Card>
          )}

          {/* Simulator panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FlaskConical className="h-3.5 w-3.5" />
                Simulador
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CapacitySimulator periods={periods} simResults={simResults} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile: Simulator below main content */}
      <div className="mt-5 lg:hidden">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5" />
              Simulador de Impacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CapacitySimulator periods={periods} simResults={simResults} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
