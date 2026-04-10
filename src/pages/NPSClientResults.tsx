import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { useNpsResults, useNpsTokens } from "@/hooks/useNPS";
import { calcNPS, calcAverages, NPS_QUESTIONS } from "@/types/nps";

function NpsGauge({ score }: { score: number }) {
  const color = score >= 50 ? "text-emerald-600" : score >= 0 ? "text-amber-600" : "text-red-600";
  const label = score >= 50 ? "Excelente" : score >= 0 ? "Bom" : "Crítico";
  const badgeClass = score >= 50
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : score >= 0
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-6xl font-black ${color}`}>{score > 0 ? "+" : ""}{score}</span>
      <Badge variant="outline" className={badgeClass}>{label}</Badge>
      <span className="text-xs text-muted-foreground">NPS Score</span>
    </div>
  );
}

function BreakdownBar({ promoters, neutrals, detractors, total }: {
  promoters: number; neutrals: number; detractors: number; total: number;
}) {
  const pPct = total > 0 ? (promoters / total) * 100 : 0;
  const nPct = total > 0 ? (neutrals / total) * 100 : 0;
  const dPct = total > 0 ? (detractors / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full">
        {dPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${dPct}%` }} />}
        {nPct > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${nPct}%` }} />}
        {pPct > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${pPct}%` }} />}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-sm font-bold text-red-600">{dPct.toFixed(0)}%</span>
          </div>
          <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Detratores</span>
          <span className="text-xs text-muted-foreground">0–6 · {detractors} resp.</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <Minus className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-bold text-amber-600">{nPct.toFixed(0)}%</span>
          </div>
          <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Neutros</span>
          <span className="text-xs text-muted-foreground">7–8 · {neutrals} resp.</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600">{pPct.toFixed(0)}%</span>
          </div>
          <span className="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Promotores</span>
          <span className="text-xs text-muted-foreground">9–10 · {promoters} resp.</span>
        </div>
      </div>
    </div>
  );
}

function ScoreDot({ value }: { value: number }) {
  const color = value >= 9 ? "bg-emerald-500" : value >= 7 ? "bg-amber-400" : "bg-red-500";
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-white ${color}`}>
      {value}
    </span>
  );
}

export default function NPSClientResults() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [selectedToken, setSelectedToken] = useState<string>("all");

  const { data: allResponses, isLoading } = useNpsResults(clientId);
  const { data: tokens } = useNpsTokens();

  const clientTokens = (tokens ?? []).filter((t) => t.clientId === clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clientName = clientTokens[0]?.clientName ?? `Cliente ${clientId}`;

  const responses = selectedToken === "all"
    ? allResponses
    : allResponses?.filter((r) => r.token === selectedToken);

  const npsData = responses ? calcNPS(responses) : null;
  const averages = responses ? calcAverages(responses) : [];

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "NPS", clientName]}
        title={clientName}
        subtitle="Resultados da pesquisa de satisfação"
      />

      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => navigate("/nps")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para lista
        </Button>

        {clientTokens.length > 1 && (
          <Select value={selectedToken} onValueChange={setSelectedToken}>
            <SelectTrigger className="h-7 w-44 text-xs ml-auto">
              <SelectValue placeholder="Todos os períodos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os períodos</SelectItem>
              {clientTokens.map((t) => (
                <SelectItem key={t.token} value={t.token}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      ) : !responses || responses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhuma resposta ainda</p>
            <p className="text-xs text-muted-foreground">
              Compartilhe o link de pesquisa com o cliente para começar a receber avaliações.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Score + breakdown */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Score NPS
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center py-4">
                {npsData && <NpsGauge score={npsData.nps} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Distribuição
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {npsData?.total} resposta{npsData?.total !== 1 ? "s" : ""}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {npsData && (
                  <BreakdownBar
                    promoters={npsData.promoters}
                    neutrals={npsData.neutrals}
                    detractors={npsData.detractors}
                    total={npsData.total}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Averages per question */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Média por Pergunta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {averages.map((q) => (
                <div key={q.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate text-muted-foreground">{q.label}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.avg !== null ? (
                      <>
                        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${q.avg >= 9 ? "bg-emerald-500" : q.avg >= 7 ? "bg-amber-400" : "bg-red-500"}`}
                            style={{ width: `${(q.avg / 10) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-bold">{q.avg.toFixed(1)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Individual responses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Respostas Individuais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...responses].reverse().map((r) => (
                <div key={r.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {NPS_QUESTIONS.map((q) => {
                        const val = Number(r.answers[q.id]);
                        return isNaN(val) ? null : <ScoreDot key={q.id} value={val} />;
                      })}
                    </div>
                    <span className="text-[0.65rem] text-muted-foreground shrink-0 ml-2">
                      {new Date(r.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {r.answers.comment && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                      "{r.answers.comment}"
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
