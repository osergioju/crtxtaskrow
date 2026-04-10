export interface TaskrowUser {
  UserID: number;
  FullName: string;
  MainEmail: string;
  UserLogin: string;
  UserHashCode: string;
  ExternalCode: string | null;
  Inactive: boolean;
  ProfileID: number;
  ProfileTitle: string;
  ApprovalGroup: string;
  ProfileRate: number;
  FunctionGroupName: string;
  UserFunctionTitle: string;
}

export interface TaskrowClient {
  ClientID: number;
  ClientName: string;
  ClientNickName: string;
  value: string;
  Inactive: boolean;
}

export interface TaskrowJob {
  jobID: number;
  jobNumber: number;
  jobTitle: string;
  inactive: boolean;
  externalCode: string | null;
  client: {
    clientID: number;
    clientNickname: string;
    displayName: string;
  };
}

/** Matches the camelCase JSON returned by /api/search/tasks/advancedsearch */
export interface TaskrowTask {
  taskID: number;
  taskNumber: number;
  taskTitle: string;
  creationDate: string;
  closed: boolean;
  closeDate: string | null;
  dueDate: string | null;
  pipelineStep: string;
  tags: string | null;
  parentTaskID: number | null;
  parentTaskNumber: number | null;
  jobID: number;
  jobNumber: number;
  jobTitle: string;
  clientID: number;
  clientDisplayName: string;
  clientNickName: string;
  ownerUserID: number;
  ownerUserLogin: string;
}

export interface AdvancedSearchPayload {
  ClientID?: number;
  JobID?: number;
  Term?: string;
  FilterUserID?: number;
  OnlyMainTasks?: boolean;
  OnlySubtasks?: boolean;
  StartDate?: string;
  EndDate?: string;
  Offset?: number;
  Closed?: boolean | null;
  Sort?: "DueDateDesc" | "Title" | 0;
}

export type TaskStatus =
  | "andamento" | "backlog" | "atraso"
  | "em_dia" | "retrabalho" | "urgente" | "concluida";

export interface ClientMetrics {
  client: TaskrowClient;
  tasks: TaskrowTask[];
  total: number;
  andamento: number;
  concluidas: number;
  atrasadas: number;
  emDia: number;
  backlog: number;
  retrabalho: number;
  urgente: number;
  pctRetrabalho: number;
  slaMedia: number;
  riskScore: number;
}

export interface UserMetrics {
  user: TaskrowUser;
  tasks: TaskrowTask[];
  andamento: number;
  atrasadas: number;
  emDia: number;
  backlog: number;
  urgente: number;
  retrabalho: number;
  concluidas: number;
  slaMedia: number;
}
