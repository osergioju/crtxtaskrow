/** Tarefa "fantasma" criada direto na régua — nunca sincronizada com a Taskrow. */
export interface LocalRulerTask {
  id: string;
  title: string;
  description: string;
  ownerUserID: number | null;
  dueDate: string; // yyyy-mm-dd
  createdAt: string;
}

export interface ReguaState {
  localTasks: LocalRulerTask[];
  /** balde (yyyy-mm-dd, ou "overdue") -> ordem de prioridade (chaves "taskrow:<id>" | "local:<id>") */
  priorities: Record<string, string[]>;
}

export type RulerItemOrigin = "taskrow" | "local";

export function rulerItemKey(origin: RulerItemOrigin, id: number | string): string {
  return `${origin}:${id}`;
}
