import type { PipelineHistoryEntry } from "@/hooks/usePipelineHistory";

export interface SLASplit {
  tempoAtivo: number;    // dias que o colaborador esteve com a tarefa
  tempoParado: number;   // dias aguardando retorno do cliente
  total: number;
  hasData: boolean;
}

/** Calcula split de SLA para uma única tarefa a partir do seu histórico. */
export function calcSLASplit(entries: PipelineHistoryEntry[]): SLASplit {
  if (!entries.length) return { tempoAtivo: 0, tempoParado: 0, total: 0, hasData: false };

  const now = new Date();
  let ativo = 0;
  let parado = 0;

  for (const e of entries) {
    const start = new Date(e.entered_at);
    const end = e.exited_at ? new Date(e.exited_at) : now;
    const days = Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
    if (e.is_client_blocking) parado += days;
    else ativo += days;
  }

  return {
    tempoAtivo: +ativo.toFixed(1),
    tempoParado: +parado.toFixed(1),
    total: +(ativo + parado).toFixed(1),
    hasData: true,
  };
}

/**
 * Agrega split de SLA para múltiplas tarefas agrupadas por task_id.
 * Retorna a média entre todas as tarefas que têm histórico.
 */
export function calcAggregateSLASplit(
  taskIds: number[],
  allEntries: PipelineHistoryEntry[]
): SLASplit {
  if (!allEntries.length) return { tempoAtivo: 0, tempoParado: 0, total: 0, hasData: false };

  const byTask = new Map<number, PipelineHistoryEntry[]>();
  for (const e of allEntries) {
    const list = byTask.get(e.task_id) || [];
    list.push(e);
    byTask.set(e.task_id, list);
  }

  const splits = taskIds
    .filter(id => byTask.has(id))
    .map(id => calcSLASplit(byTask.get(id)!));

  if (!splits.length) return { tempoAtivo: 0, tempoParado: 0, total: 0, hasData: false };

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    tempoAtivo: +avg(splits.map(s => s.tempoAtivo)).toFixed(1),
    tempoParado: +avg(splits.map(s => s.tempoParado)).toFixed(1),
    total: +avg(splits.map(s => s.total)).toFixed(1),
    hasData: true,
  };
}
