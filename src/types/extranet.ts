export type ExtranetStep =
  | "Input"
  | "Backlog"
  | "Fazer"
  | "Fazendo"
  | "Campanhas em andamento"
  | "Aprovação"
  | "Alteração"
  | "StandBy"
  | "Finalizada";

export interface ExtranetColumnConfig {
  step: ExtranetStep;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  dotClass: string;
  ringClass: string;
  needsAction: boolean;
  emoji: string;
}

export interface ExtranetClientSummary {
  clientID: number;
  clientName: string;
  clientNickName: string;
  totalTasks: number;
  byStep: Record<ExtranetStep, number>;
  pctFinalizada: number;
  pendingApproval: number;
  inProgress: number;
  standBy: number;
}

export interface ExtranetFiltersState {
  search: string;
  step: ExtranetStep | "all";
}
