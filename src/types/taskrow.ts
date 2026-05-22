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
  colorID: number | null;
  tags: string | null;
  parentTaskID: number | null;
  parentTaskNumber: number | null;
  parentTaskTitle: string | null;
  jobID: number;
  jobNumber: number;
  jobTypeID: number | null;
  jobTitle: string;
  jobType: string | null;
  jobUrlData: string | null;
  jobDisplayTitle: string | null;
  clientID: number;
  clientDisplayName: string;
  clientNickName: string;
  clientUrlData: string | null;
  ownerUserID: number;
  ownerUserLogin: string;
  ownerUserHashCode: string | null;
  creationUserID: number | null;
  creationUserLogin: string | null;
  creationUserHashCode: string | null;
  requestTypeAcronym: string | null;
  requestTypeName: string | null;
  /** Pipeline step as seen by the client (extranet) */
  extranetPipelineStep: string | null;
  /** Color ID corresponding to the extranet pipeline step */
  extranetColorID: number | null;
  hasExternalItems: boolean;
  urlData: string | null;
  absoluteUserOrder: number | null;
  clientContactID: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactRequestDate: string | null;
  currentlyOpen: boolean;
  openInPeriod: boolean;
  closedInPeriod: boolean;
  openAndClosedInPeriod: boolean;
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
  | "andamento" | "backlog" | "atraso" | "atraso_cliente"
  | "em_dia" | "retrabalho" | "urgente" | "concluida";

export interface ClientMetrics {
  client: TaskrowClient;
  tasks: TaskrowTask[];
  total: number;
  andamento: number;
  concluidas: number;
  atrasadas: number;
  atrasadasCliente: number;
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
  atrasadasCliente: number;
  emDia: number;
  backlog: number;
  urgente: number;
  retrabalho: number;
  concluidas: number;
  slaMedia: number;
}
