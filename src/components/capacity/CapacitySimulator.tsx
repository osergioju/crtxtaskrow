import { useState } from "react";
import { Plus, Trash2, FlaskConical, ArrowRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { CapacityZonePill } from "./CapacityZonePill";
import { ZONE_CONFIG, scoreToZone } from "@/lib/capacityEngine";
import { useCapacityStore } from "@/store/capacityStore";
import type { CapacityPeriod, SimulationResult } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface SimulationResultRowProps {
  result: SimulationResult;
  periodLabel: string;
}

function SimulationResultRow({ result, periodLabel }: SimulationResultRowProps) {
  const origCfg = ZONE_CONFIG[result.originalZone];
  const simCfg = ZONE_CONFIG[result.simulatedZone];
  const deltaPositive = result.delta > 0;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border px-4 py-3",
      result.zoneChanged
        ? "border-amber-200 bg-amber-50"
        : "border-border bg-card"
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{periodLabel}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn("text-xs font-bold", origCfg.textClass)}>{result.originalScore}%</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className={cn("text-xs font-bold", simCfg.textClass)}>{result.simulatedScore}%</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <CapacityZonePill zone={result.simulatedZone} size="xs" />
        <Badge
          variant="outline"
          className={cn(
            "text-[0.6rem] px-1.5",
            deltaPositive ? "text-destructive border-destructive/30" : "text-emerald-600 border-emerald-200"
          )}
        >
          {deltaPositive ? "+" : ""}{result.delta}%
        </Badge>
      </div>

      {result.zoneChanged && (
        <div className="text-xs font-bold text-amber-700 shrink-0">
          ⚠ Zona mudou!
        </div>
      )}
    </div>
  );
}

interface CapacitySimulatorProps {
  periods: CapacityPeriod[];
  simResults: SimulationResult[];
}

export function CapacitySimulator({ periods, simResults }: CapacitySimulatorProps) {
  const {
    simulationActive, toggleSimulation,
    simEntries, addSimEntry, removeSimEntry, clearSim,
    capacityPerUser, setCapacityPerUser,
  } = useCapacityStore();

  const [newLabel, setNewLabel] = useState("");
  const [newCount, setNewCount] = useState(5);
  const [newPeriod, setNewPeriod] = useState(periods[4]?.key || "");
  const [newWeight, setNewWeight] = useState(1.0);

  function handleAdd() {
    if (!newLabel.trim() || !newPeriod) return;
    addSimEntry({
      label: newLabel.trim(),
      taskCount: newCount,
      periodKey: newPeriod,
      weight: newWeight,
    });
    setNewLabel("");
    toggleSimulation();
  }

  const futurePeriods = periods.filter(p => p.isFuture || p.isCurrentMonth);
  const zoneChanges = simResults.filter(r => r.zoneChanged);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-bold">Simulador de Impacto</p>
          <p className="text-xs text-muted-foreground">
            Simule adição de tarefas e veja o impacto na capacidade
          </p>
        </div>
        {simulationActive && (
          <Badge variant="outline" className="ml-auto text-xs border-primary/30 text-primary bg-primary/5">
            Simulação ativa
          </Badge>
        )}
      </div>

      {/* Capacity config */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Parâmetros da Engine
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Capacidade por usuário/mês</Label>
            <span className="text-xs font-bold text-primary">{capacityPerUser} tarefas</span>
          </div>
          <Slider
            value={[capacityPerUser]}
            min={10}
            max={100}
            step={5}
            onValueChange={([v]) => setCapacityPerUser(v)}
            className="w-full"
          />
          <div className="flex justify-between text-[0.6rem] text-muted-foreground">
            <span>Conservador (10)</span>
            <span>Agressivo (100)</span>
          </div>
        </div>
      </div>

      {/* Add simulation entry */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adicionar Cenário
        </p>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">Descrição do cenário</Label>
            <Input
              placeholder="ex: Novo cliente entrando em Agosto"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Mês alvo</Label>
              <Select value={newPeriod} onValueChange={setNewPeriod}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {futurePeriods.map(p => (
                    <SelectItem key={p.key} value={p.key} className="text-xs">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Qtd. tarefas</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={newCount}
                onChange={e => setNewCount(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs">Peso por tarefa</Label>
              <span className="text-xs font-bold text-primary">×{newWeight.toFixed(1)}</span>
            </div>
            <Slider
              value={[newWeight * 10]}
              min={3}
              max={25}
              step={1}
              onValueChange={([v]) => setNewWeight(v / 10)}
              className="w-full"
            />
            <div className="flex justify-between text-[0.6rem] text-muted-foreground mt-0.5">
              <span>Leve (×0.3)</span>
              <span>Normal (×1.0)</span>
              <span>Urgente (×2.5)</span>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={handleAdd}
          disabled={!newLabel.trim() || !newPeriod}
        >
          <Plus className="h-3.5 w-3.5" />
          Simular cenário
        </Button>
      </div>

      {/* Active entries */}
      {simEntries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cenários ativos ({simEntries.length})
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearSim}>
              <Trash2 className="h-3 w-3 mr-1" />
              Limpar tudo
            </Button>
          </div>
          {simEntries.map(e => (
            <div key={e.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{e.label}</p>
                <p className="text-[0.6rem] text-muted-foreground">
                  {e.taskCount} tarefas · ×{e.weight.toFixed(1)} · {e.periodKey}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeSimEntry(e.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {simResults.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Impacto Previsto
              </p>
              {zoneChanges.length > 0 && (
                <Badge variant="outline" className="text-[0.65rem] border-amber-300 text-amber-700 bg-amber-50">
                  {zoneChanges.length} mudança{zoneChanges.length > 1 ? "s" : ""} de zona
                </Badge>
              )}
            </div>
            {simResults.map(r => {
              const period = periods.find(p => p.key === r.periodKey);
              return (
                <SimulationResultRow
                  key={r.periodKey}
                  result={r}
                  periodLabel={period?.label || r.periodKey}
                />
              );
            })}
          </div>
        </>
      )}

      {simEntries.length === 0 && (
        <div className="flex flex-col items-center py-6 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            Adicione um cenário para ver o impacto na capacidade
          </p>
        </div>
      )}
    </div>
  );
}
