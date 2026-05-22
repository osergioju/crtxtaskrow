import { useState } from "react";
import {
  ChevronDown, ChevronUp, HelpCircle, Gauge, Scale,
  AlertTriangle, FlaskConical, TrendingUp, Users, Info,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ZONE_CONFIG } from "@/lib/capacityEngine";
import { cn } from "@/lib/utils";

// ─── Building blocks ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary">{icon}</span>
      <p className="text-sm font-bold">{title}</p>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border", className)}>
      {children}
    </span>
  );
}

function WeightRow({ label, weight, color, description }: {
  label: string; weight: string; color: string; description: string;
}) {
  const pct = Math.round(parseFloat(weight) * 40); // visual bar width
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 shrink-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[0.6rem] text-muted-foreground">{description}</p>
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-right w-8 shrink-0">×{weight}</span>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function SectionScore() {
  return (
    <div>
      <SectionHeader icon={<Gauge className="h-4 w-4" />} title="O que é o Score de Capacidade?" />
      <p className="text-sm text-muted-foreground leading-relaxed">
        Um número de <strong>0% a 100%</strong> que representa o quanto a equipe está carregada num determinado mês.
        Ele combina a quantidade de tarefas, o peso de cada uma e penalidades por problemas (atrasos, retrabalho, gargalos de aprovação).
      </p>

      <div className="mt-3 rounded-lg border bg-muted/30 px-4 py-3 font-mono text-xs text-muted-foreground space-y-1">
        <p><span className="text-foreground font-bold">score</span> = (carga_base + penalidades) × 100</p>
        <p className="opacity-70">carga_base = soma_ponderada / (usuários_ativos × 45 tarefas/mês)</p>
        <p className="opacity-70">penalidades = % atrasos + % retrabalho + % aprovação</p>
      </div>

      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 flex gap-2">
        <Info className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
        <p className="text-xs text-sky-800">
          <strong>Carga ponderada</strong> (ex: 63%) é só a carga_base — o volume de trabalho.
          O <strong>score final</strong> (ex: 71%) é maior porque adiciona as penalidades de atrasos e aprovações presas.
          Um mês com muitas tarefas simples pode ter carga baixa mas score alto se houver muito retrabalho.
        </p>
      </div>
    </div>
  );
}

function SectionZones() {
  const zones = [
    { zone: "healthy" as const, range: "0 – 35%", meaning: "Operação tranquila. Equipe tem folga para absorver novas demandas.", action: "Momento ideal para onboarding de novos projetos." },
    { zone: "attention" as const, range: "36 – 55%", meaning: "Carga crescendo. Sem crise, mas vale monitorar.", action: "Evite empilhar urgências ou campanhas extras." },
    { zone: "heavy" as const, range: "56 – 75%", meaning: "Operação pesada. Cada nova tarefa tem impacto real.", action: "Priorize e negocie prazos antes de aceitar mais jobs." },
    { zone: "critical" as const, range: "76 – 90%", meaning: "Risco real de atraso em cascata. Equipe no limite.", action: "Redistribua carga, bloqueie novos jobs, negocie escopo." },
    { zone: "collapse" as const, range: "91 – 100%", meaning: "Colapso iminente. Atrasos se tornam inevitáveis.", action: "Ação imediata: cancelar, delegar ou contratar." },
  ];

  return (
    <div>
      <SectionHeader icon={<AlertTriangle className="h-4 w-4" />} title="O que significa cada cor?" />
      <div className="space-y-2">
        {zones.map(({ zone, range, meaning, action }) => {
          const cfg = ZONE_CONFIG[zone];
          return (
            <div key={zone} className={cn("rounded-xl border px-4 py-3", cfg.bgClass, cfg.borderClass)}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", cfg.dotClass)} />
                <span className={cn("text-sm font-bold", cfg.textClass)}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{range}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{meaning}</p>
              <p className={cn("mt-1 text-xs font-medium", cfg.textClass)}>→ {action}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionWeights() {
  return (
    <div>
      <SectionHeader icon={<Scale className="h-4 w-4" />} title="Por que tarefas têm pesos diferentes?" />
      <p className="text-sm text-muted-foreground mb-3">
        Nem toda tarefa custa o mesmo. Uma tarefa com retrabalho ou urgência consome mais energia da equipe do que uma tarefa nova e planejada.
        O sistema multiplica cada tarefa pelo seu peso antes de calcular a carga total.
      </p>
      <div className="space-y-0.5">
        <WeightRow label="Normal" weight="1.0" color="bg-slate-400" description="Tarefa planejada, sem pendências" />
        <WeightRow label="Campanha" weight="1.5" color="bg-teal-500" description="Exige mais coordenação" />
        <WeightRow label="Retrabalho" weight="1.8" color="bg-orange-500" description="Reprocessar custa mais tempo" />
        <WeightRow label="Urgente" weight="2.0" color="bg-red-500" description="Corta o queue, gera pressão" />
        <WeightRow label="Atrasada" weight="2.5" color="bg-red-700" description="Arrasta toda a operação" />
        <Separator className="my-2" />
        <WeightRow label="Aprovação" weight="0.6" color="bg-violet-400" description="Aguardando cliente, menos trabalho ativo" />
        <WeightRow label="Stand-by" weight="0.3" color="bg-slate-300" description="Pausada, não consome capacidade" />
      </div>
    </div>
  );
}

function SectionDifference() {
  return (
    <div>
      <SectionHeader icon={<Info className="h-4 w-4" />} title="Por que os números diferem da Visão Geral?" />
      <div className="space-y-3">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-bold mb-1.5">Visão Geral — contagem mais restrita</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Usa a janela de datas do filtro do dashboard (padrão: últimos 30 dias) e classifica tarefas
            numa hierarquia estrita: se uma tarefa está marcada como <strong>urgente</strong> ou
            <strong> retrabalho</strong>, ela <em>não</em> entra no contador de "atraso" — é contada
            na própria categoria. Só vira "atraso" o que passou por todos os filtros e sobrou.
          </p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-bold mb-1.5">Workload Intelligence — contagem mais ampla</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Usa uma janela própria de dados (4 meses atrás até 8 meses à frente) independente do filtro.
            Conta como "em atraso" <em>qualquer</em> tarefa aberta cujo prazo já passou, sem exceção de
            pipeline ou tag. Por isso o número tende a ser maior — é intencionalmente mais conservador
            para revelar o risco real de acúmulo.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionSimulator() {
  return (
    <div>
      <SectionHeader icon={<FlaskConical className="h-4 w-4" />} title="Como usar o Simulador?" />
      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
        O simulador responde a pergunta: <em>"e se eu aceitar mais demanda?"</em>
      </p>
      <ol className="space-y-2 text-xs text-muted-foreground list-none">
        {[
          ["Descreva o cenário", "Ex: Novo cliente entrando em agosto, ou 5 campanhas extras no Q3"],
          ["Escolha o mês alvo", "O mês onde essas tarefas cairiam (normalmente o mês de entrega esperada)"],
          ["Defina a quantidade", "Quantas tarefas novas esse cenário adicionaria à operação"],
          ["Ajuste o peso", "Tarefas simples = ×1.0 · campanhas = ×1.5 · urgentes = ×2.0"],
          ["Leia o impacto", "O sistema recalcula o score e mostra se o mês muda de zona (ex: de Atenção para Crítico)"],
        ].map(([title, desc], i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
              {i + 1}
            </span>
            <span>
              <strong className="text-foreground">{title}.</strong> {desc}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Se o simulador mostrar <strong>"Zona mudou!"</strong>, significa que aceitar aquela demanda
          empurraria o mês para um nível de risco acima. Use isso para negociar prazos ou redistribuir antes de confirmar o job.
        </p>
      </div>
    </div>
  );
}

function SectionForecast() {
  return (
    <div>
      <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Como funciona o Forecast?" />
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        O forecast combina dados reais com projeção baseada em tendência.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          {
            label: "Dados reais",
            color: "border-primary/20 bg-primary/5",
            text: "Meses que já têm tarefas com dueDate definida. Alta confiança — as tarefas existem no Taskrow.",
          },
          {
            label: "Projeção",
            color: "border-border bg-muted/30",
            text: "Meses sem tarefas definidas ainda. O sistema extrapola a tendência dos últimos meses. Confiança menor — serve como alerta antecipado.",
          },
        ].map(({ label, color, text }) => (
          <div key={label} className={cn("rounded-xl border px-3 py-2.5", color)}>
            <p className="text-xs font-bold mb-1">{label}</p>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionUsers() {
  return (
    <div>
      <SectionHeader icon={<Users className="h-4 w-4" />} title="Como ler a visão de Equipe?" />
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        Cada linha é um colaborador. Cada célula é um mês. A cor da célula indica o nível de carga daquele colaborador naquele mês, usando a mesma escala de zonas (verde → roxo).
      </p>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <span className="h-4 w-4 rounded bg-emerald-100 border border-emerald-200 shrink-0 mt-0.5" />
          <span>Verde claro = colaborador abaixo de 35% da capacidade — tem folga.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="h-4 w-4 rounded bg-orange-100 border border-orange-200 shrink-0 mt-0.5" />
          <span>Laranja = próximo do limite — monitorar antes de jogar mais tarefas.</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="h-4 w-4 rounded bg-red-100 border border-red-200 shrink-0 mt-0.5" />
          <span>Vermelho + badge "overload" = acima de 40 tarefas/mês — risco de burnout operacional.</span>
        </div>
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 flex gap-2">
          <Info className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
          <span className="text-sky-800">
            O limiar de sobrecarga (40 tarefas/mês) é uma referência. Colaboradores com tarefas mais complexas podem chegar ao limite antes.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "score",      label: "Score de Capacidade",   icon: <Gauge className="h-3.5 w-3.5" />,         content: <SectionScore /> },
  { id: "zones",      label: "Significado das Cores",  icon: <AlertTriangle className="h-3.5 w-3.5" />,  content: <SectionZones /> },
  { id: "weights",    label: "Pesos das Tarefas",      icon: <Scale className="h-3.5 w-3.5" />,          content: <SectionWeights /> },
  { id: "difference", label: "Diferença da Visão Geral", icon: <Info className="h-3.5 w-3.5" />,         content: <SectionDifference /> },
  { id: "simulator",  label: "Como usar o Simulador",  icon: <FlaskConical className="h-3.5 w-3.5" />,   content: <SectionSimulator /> },
  { id: "forecast",   label: "Como ler o Forecast",    icon: <TrendingUp className="h-3.5 w-3.5" />,     content: <SectionForecast /> },
  { id: "users",      label: "Visão de Equipe",        icon: <Users className="h-3.5 w-3.5" />,          content: <SectionUsers /> },
];

export function CapacityGuide() {
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20">
      {/* Toggle header */}
      <button
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/30 rounded-xl"
        onClick={() => setOpen(s => !s)}
      >
        <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-semibold text-muted-foreground">
          Como interpretar este módulo?
        </span>
        <span className="text-[0.65rem] text-muted-foreground/60 mr-2">
          {open ? "Fechar guia" : "Abrir guia · scores, zonas, simulador, forecast"}
        </span>
        {open
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-dashed border-muted-foreground/20 px-4 pt-4 pb-5 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Selecione um tópico para expandir a explicação.
          </p>

          {SECTIONS.map(({ id, label, icon, content }) => {
            const isOpen = openSection === id;
            return (
              <div key={id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                  onClick={() => setOpenSection(isOpen ? null : id)}
                >
                  <span className="text-muted-foreground">{icon}</span>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  {isOpen
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-4">
                    {content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
