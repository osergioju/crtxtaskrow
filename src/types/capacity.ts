import type { TaskrowTask } from "./taskrow";

// ─── Zone ─────────────────────────────────────────────────────────────────────

export type CapacityZone = "healthy" | "attention" | "heavy" | "critical" | "collapse";

export interface ZoneConfig {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
  barClass: string;
  dotClass: string;
  min: number; // inclusive
  max: number; // exclusive (100 for last)
}

// ─── Period ───────────────────────────────────────────────────────────────────

export interface CapacityPeriod {
  key: string;          // "2026-05"
  label: string;        // "Mai 2026"
  start: Date;
  end: Date;
  isFuture: boolean;
  isCurrentMonth: boolean;
}

// ─── Score output ─────────────────────────────────────────────────────────────

export interface PeriodCapacityScore {
  period: CapacityPeriod;
  score: number;          // 0-100
  zone: CapacityZone;
  totalTasks: number;
  weightedLoad: number;
  activeUsers: number;
  theoreticalCapacity: number;
  overdueCount: number;
  reworkCount: number;
  urgentCount: number;
  approvalCount: number;
  standByCount: number;
  closedCount: number;
  openCount: number;
  overdueRate: number;    // 0-1
  completionRate: number; // 0-1
  topUsers: { login: string; count: number; isOverloaded: boolean }[];
  topClients: { name: string; count: number }[];
  alerts: CapacityAlert[];
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertType =
  | "month_critical"
  | "month_collapse"
  | "user_overload"
  | "approval_bottleneck"
  | "backlog_growth"
  | "rework_spike"
  | "forecast_warning"
  | "team_saturation";

export interface CapacityAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  period?: string;
  affectedEntity?: string;
  value?: number;
}

// ─── User Capacity ────────────────────────────────────────────────────────────

export interface UserCapacityBreakdown {
  userID: number;
  login: string;
  byPeriod: { key: string; taskCount: number; score: number; isOverloaded: boolean }[];
  totalTasks: number;
  peakMonth: string;
  peakCount: number;
  avgMonthly: number;
  overloadedMonths: number;
}

// ─── Client Capacity ──────────────────────────────────────────────────────────

export interface ClientCapacityBreakdown {
  clientID: number;
  clientName: string;
  totalTasks: number;
  capacityShare: number; // % of total capacity consumed
  byPeriod: { key: string; taskCount: number }[];
  pendingApproval: number;
  reworkCount: number;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface SimulationEntry {
  id: string;
  label: string;
  taskCount: number;
  periodKey: string; // "2026-05"
  weight: number;    // multiplier (default 1.0)
}

export interface SimulationResult {
  periodKey: string;
  originalScore: number;
  simulatedScore: number;
  delta: number;
  originalZone: CapacityZone;
  simulatedZone: CapacityZone;
  zoneChanged: boolean;
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  periodKey: string;
  label: string;
  projectedScore: number;
  zone: CapacityZone;
  confidence: "high" | "medium" | "low";
  basis: "data" | "projection";
}
