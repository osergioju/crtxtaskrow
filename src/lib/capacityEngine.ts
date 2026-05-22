import {
  startOfMonth, endOfMonth, addMonths, subMonths, format, parseISO,
  isWithinInterval, isPast, isThisMonth, isFuture, startOfDay, differenceInDays,
  eachMonthOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TaskrowTask } from "@/types/taskrow";
import type {
  CapacityZone, CapacityPeriod, PeriodCapacityScore,
  CapacityAlert, UserCapacityBreakdown, ClientCapacityBreakdown,
  SimulationEntry, SimulationResult, ForecastPoint, ZoneConfig,
} from "@/types/capacity";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Comfortable max tasks per active user per month (tunable in simulation) */
export const DEFAULT_CAPACITY_PER_USER = 45;

/** A user is "overloaded" when their monthly task count exceeds this */
export const OVERLOAD_THRESHOLD = 40;

/** Task weight multipliers */
export const WEIGHTS = {
  normal:   1.0,
  rework:   1.8,  // change cycle = extra effort
  urgent:   2.0,  // high pressure, cuts queue
  overdue:  2.5,  // drags on capacity
  approval: 0.6,  // waiting, less active work but shows friction
  standy:   0.3,  // parked
  campaign: 1.5,  // coordination overhead
} as const;

// ─── Zone Config ──────────────────────────────────────────────────────────────

export const ZONE_CONFIG: Record<CapacityZone, ZoneConfig> = {
  healthy: {
    label: "Saudável", min: 0, max: 36,
    textClass: "text-emerald-600", bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    barClass: "bg-emerald-500", dotClass: "bg-emerald-500",
  },
  attention: {
    label: "Atenção", min: 36, max: 56,
    textClass: "text-amber-600", bgClass: "bg-amber-50",
    borderClass: "border-amber-200", badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    barClass: "bg-amber-500", dotClass: "bg-amber-500",
  },
  heavy: {
    label: "Pesado", min: 56, max: 76,
    textClass: "text-orange-600", bgClass: "bg-orange-50",
    borderClass: "border-orange-200", badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    barClass: "bg-orange-500", dotClass: "bg-orange-500",
  },
  critical: {
    label: "Crítico", min: 76, max: 91,
    textClass: "text-red-600", bgClass: "bg-red-50",
    borderClass: "border-red-200", badgeClass: "bg-red-50 text-red-700 border-red-200",
    barClass: "bg-red-500", dotClass: "bg-red-500",
  },
  collapse: {
    label: "Colapso", min: 91, max: 101,
    textClass: "text-purple-700", bgClass: "bg-purple-50",
    borderClass: "border-purple-300", badgeClass: "bg-purple-50 text-purple-700 border-purple-300",
    barClass: "bg-purple-600", dotClass: "bg-purple-600",
  },
};

export function scoreToZone(score: number): CapacityZone {
  if (score < 36) return "healthy";
  if (score < 56) return "attention";
  if (score < 76) return "heavy";
  if (score < 91) return "critical";
  return "collapse";
}

// ─── Period Helpers ───────────────────────────────────────────────────────────

export function buildPeriod(date: Date): CapacityPeriod {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const key = format(start, "yyyy-MM");
  const label = format(start, "MMM yyyy", { locale: ptBR });
  return {
    key,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    start,
    end,
    isFuture: isFuture(start) && !isThisMonth(start),
    isCurrentMonth: isThisMonth(start),
  };
}

export function buildPeriods(monthsBefore: number, monthsAfter: number): CapacityPeriod[] {
  const today = new Date();
  const start = subMonths(today, monthsBefore);
  const end = addMonths(today, monthsAfter);
  return eachMonthOfInterval({ start, end }).map(buildPeriod);
}

function isTaskInPeriod(task: TaskrowTask, period: CapacityPeriod): boolean {
  if (task.dueDate) {
    const due = parseISO(task.dueDate);
    return isWithinInterval(due, { start: period.start, end: period.end });
  }
  // fallback: use creation date
  const created = parseISO(task.creationDate);
  return isWithinInterval(created, { start: period.start, end: period.end });
}

// ─── Task Classification ──────────────────────────────────────────────────────

function taskWeight(task: TaskrowTask, period: CapacityPeriod): number {
  const tags = (task.tags || "").toLowerCase();
  const step = (task.pipelineStep || "").toLowerCase();

  if (tags.includes("retrabalho") || step.includes("retrabalho") || step.includes("ajuste")) {
    return WEIGHTS.rework;
  }
  if (tags.includes("urgente") || step.includes("urgente")) return WEIGHTS.urgent;

  const isApproval = step.includes("aprovação") || step.includes("aprovacao");
  if (isApproval) return WEIGHTS.approval;

  const isStandBy = step.includes("stand by") || step.includes("standy") || step.includes("standby");
  if (isStandBy) return WEIGHTS.standy;

  const isCampaign = step.includes("campanha") || step.includes("campaign");
  if (isCampaign) return WEIGHTS.campaign;

  if (task.dueDate) {
    const due = parseISO(task.dueDate);
    if (isPast(due) && !task.closed) return WEIGHTS.overdue;
  }

  return WEIGHTS.normal;
}

// ─── Core Score Calculation ───────────────────────────────────────────────────

export function calculatePeriodScore(
  tasks: TaskrowTask[],
  period: CapacityPeriod,
  capacityPerUser: number = DEFAULT_CAPACITY_PER_USER,
  extraWeight: number = 0 // from simulation
): PeriodCapacityScore {
  const periodTasks = tasks.filter(t => isTaskInPeriod(t, period));

  const totalTasks = periodTasks.length;

  // Classify tasks
  let overdueCount = 0, reworkCount = 0, urgentCount = 0;
  let approvalCount = 0, standByCount = 0, closedCount = 0;

  periodTasks.forEach(t => {
    const tags = (t.tags || "").toLowerCase();
    const step = (t.pipelineStep || "").toLowerCase();
    if (t.closed) closedCount++;
    if (!t.closed && t.dueDate && isPast(parseISO(t.dueDate))) overdueCount++;
    if (tags.includes("retrabalho") || step.includes("ajuste")) reworkCount++;
    if (tags.includes("urgente")) urgentCount++;
    if (step.includes("aprovação") || step.includes("aprovacao")) approvalCount++;
    if (step.includes("stand by") || step.includes("standby")) standByCount++;
  });

  const openCount = totalTasks - closedCount;

  // Weighted load
  let rawWeightedLoad = periodTasks.reduce((sum, t) => sum + taskWeight(t, period), 0);
  rawWeightedLoad += extraWeight; // simulation adds

  // Active users in this period
  const userSet = new Set(periodTasks.map(t => t.ownerUserID));
  const activeUsers = Math.max(userSet.size, 1);

  // Theoretical capacity
  const theoreticalCapacity = activeUsers * capacityPerUser;

  // Base load ratio
  const baseLoad = Math.min(rawWeightedLoad / theoreticalCapacity, 1.5);

  // Penalty addons (on top of base)
  const overdueRate = totalTasks > 0 ? overdueCount / totalTasks : 0;
  const reworkRate = totalTasks > 0 ? reworkCount / totalTasks : 0;
  const approvalRate = totalTasks > 0 ? approvalCount / totalTasks : 0;

  // Overdue is the heaviest penalty (signifies systemic problems)
  const overduePenalty = overdueRate * 0.25;
  const reworkPenalty = reworkRate * 0.15;
  const approvalPenalty = approvalRate * 0.10;

  const rawScore = (baseLoad + overduePenalty + reworkPenalty + approvalPenalty) * 100;
  const score = Math.min(Math.round(rawScore), 100);

  // Top users
  const userCounts = new Map<string, number>();
  periodTasks.forEach(t => {
    userCounts.set(t.ownerUserLogin, (userCounts.get(t.ownerUserLogin) || 0) + 1);
  });
  const topUsers = Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([login, count]) => ({
      login,
      count,
      isOverloaded: count > OVERLOAD_THRESHOLD,
    }));

  // Top clients
  const clientCounts = new Map<string, number>();
  periodTasks.forEach(t => {
    const name = t.clientNickName || t.clientDisplayName;
    clientCounts.set(name, (clientCounts.get(name) || 0) + 1);
  });
  const topClients = Array.from(clientCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  const zone = scoreToZone(score);
  const alerts = buildPeriodAlerts(score, zone, period, overdueCount, approvalCount, topUsers, reworkCount);

  return {
    period,
    score,
    zone,
    totalTasks,
    weightedLoad: Math.round(rawWeightedLoad * 10) / 10,
    activeUsers,
    theoreticalCapacity,
    overdueCount,
    reworkCount,
    urgentCount,
    approvalCount,
    standByCount,
    closedCount,
    openCount,
    overdueRate: Math.round(overdueRate * 100) / 100,
    completionRate: totalTasks > 0 ? Math.round((closedCount / totalTasks) * 100) / 100 : 0,
    topUsers,
    topClients,
    alerts,
  };
}

// ─── Alert Engine ─────────────────────────────────────────────────────────────

function buildPeriodAlerts(
  score: number,
  zone: CapacityZone,
  period: CapacityPeriod,
  overdueCount: number,
  approvalCount: number,
  topUsers: PeriodCapacityScore["topUsers"],
  reworkCount: number
): CapacityAlert[] {
  const alerts: CapacityAlert[] = [];

  if (zone === "collapse") {
    alerts.push({
      id: `${period.key}-collapse`,
      type: "month_collapse",
      severity: "critical",
      title: "Risco de colapso operacional",
      description: `${period.label} está em ${score}% da capacidade. Redistribuição urgente necessária.`,
      period: period.key,
      value: score,
    });
  } else if (zone === "critical") {
    alerts.push({
      id: `${period.key}-critical`,
      type: "month_critical",
      severity: "critical",
      title: "Mês em zona crítica",
      description: `${period.label} está em ${score}% — risco real de atraso em cascata.`,
      period: period.key,
      value: score,
    });
  }

  const overloadedUsers = topUsers.filter(u => u.isOverloaded);
  if (overloadedUsers.length > 0) {
    alerts.push({
      id: `${period.key}-user-overload`,
      type: "user_overload",
      severity: overloadedUsers.length > 2 ? "critical" : "warning",
      title: `${overloadedUsers.length} colaborador${overloadedUsers.length > 1 ? "es" : ""} sobrecarregado${overloadedUsers.length > 1 ? "s" : ""}`,
      description: `${overloadedUsers.map(u => u.login).join(", ")} excedem ${OVERLOAD_THRESHOLD} tarefas.`,
      period: period.key,
      affectedEntity: overloadedUsers.map(u => u.login).join(", "),
    });
  }

  if (approvalCount > 20) {
    alerts.push({
      id: `${period.key}-approval`,
      type: "approval_bottleneck",
      severity: approvalCount > 40 ? "critical" : "warning",
      title: "Gargalo de aprovações",
      description: `${approvalCount} tarefas aguardam aprovação em ${period.label}.`,
      period: period.key,
      value: approvalCount,
    });
  }

  if (reworkCount > 5) {
    alerts.push({
      id: `${period.key}-rework`,
      type: "rework_spike",
      severity: "warning",
      title: "Pico de retrabalho",
      description: `${reworkCount} tarefas em retrabalho consomem capacidade extra.`,
      period: period.key,
      value: reworkCount,
    });
  }

  return alerts;
}

// ─── All-Periods Score ────────────────────────────────────────────────────────

export function calculateAllPeriods(
  tasks: TaskrowTask[],
  periods: CapacityPeriod[],
  capacityPerUser: number = DEFAULT_CAPACITY_PER_USER,
  simEntries: { periodKey: string; extraWeight: number }[] = []
): PeriodCapacityScore[] {
  return periods.map(period => {
    const sim = simEntries.find(s => s.periodKey === period.key);
    return calculatePeriodScore(tasks, period, capacityPerUser, sim?.extraWeight ?? 0);
  });
}

// ─── Global Alerts ───────────────────────────────────────────────────────────

export function buildGlobalAlerts(scores: PeriodCapacityScore[]): CapacityAlert[] {
  const allAlerts: CapacityAlert[] = [];

  // Forward-looking: upcoming critical months
  const futureCritical = scores.filter(
    s => (s.period.isFuture || s.period.isCurrentMonth) && (s.zone === "critical" || s.zone === "collapse")
  );
  if (futureCritical.length >= 2) {
    allAlerts.push({
      id: "global-consecutive-critical",
      type: "forecast_warning",
      severity: "critical",
      title: `${futureCritical.length} meses seguidos em zona crítica`,
      description: `${futureCritical.map(s => s.period.label).join(", ")} — o time está em risco de esgotamento operacional.`,
    });
  }

  // Backlog growth: open tasks with no due date or far future
  const totalOpen = scores.filter(s => !s.period.isFuture).reduce((sum, s) => sum + s.openCount, 0);
  if (totalOpen > 200) {
    allAlerts.push({
      id: "global-backlog-growth",
      type: "backlog_growth",
      severity: "warning",
      title: "Volume de backlog elevado",
      description: `${totalOpen} tarefas abertas acumuladas. Risco de crescimento insustentável.`,
      value: totalOpen,
    });
  }

  // All period alerts
  scores.forEach(s => allAlerts.push(...s.alerts));

  // Deduplicate by id, keep most severe
  const seen = new Map<string, CapacityAlert>();
  allAlerts.forEach(a => {
    const existing = seen.get(a.id);
    if (!existing || severityRank(a.severity) > severityRank(existing.severity)) {
      seen.set(a.id, a);
    }
  });

  return Array.from(seen.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(s: CapacityAlert["severity"]): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

// ─── User Breakdown ───────────────────────────────────────────────────────────

export function buildUserBreakdown(
  tasks: TaskrowTask[],
  periods: CapacityPeriod[]
): UserCapacityBreakdown[] {
  const userMap = new Map<number, { login: string; tasks: TaskrowTask[] }>();
  tasks.forEach(t => {
    if (!userMap.has(t.ownerUserID)) {
      userMap.set(t.ownerUserID, { login: t.ownerUserLogin, tasks: [] });
    }
    userMap.get(t.ownerUserID)!.tasks.push(t);
  });

  return Array.from(userMap.entries())
    .map(([userID, { login, tasks: userTasks }]) => {
      const byPeriod = periods.map(period => {
        const count = userTasks.filter(t => isTaskInPeriod(t, period)).length;
        const score = Math.min(Math.round((count / DEFAULT_CAPACITY_PER_USER) * 100), 100);
        return {
          key: period.key,
          taskCount: count,
          score,
          isOverloaded: count > OVERLOAD_THRESHOLD,
        };
      });

      const peakEntry = byPeriod.reduce((a, b) => b.taskCount > a.taskCount ? b : a, byPeriod[0] || { key: "", taskCount: 0 });
      const avgMonthly = byPeriod.length > 0
        ? Math.round(byPeriod.reduce((s, p) => s + p.taskCount, 0) / byPeriod.length)
        : 0;

      return {
        userID,
        login,
        byPeriod,
        totalTasks: userTasks.length,
        peakMonth: peakEntry.key,
        peakCount: peakEntry.taskCount,
        avgMonthly,
        overloadedMonths: byPeriod.filter(p => p.isOverloaded).length,
      };
    })
    .filter(u => u.totalTasks > 0)
    .sort((a, b) => b.totalTasks - a.totalTasks);
}

// ─── Client Breakdown ─────────────────────────────────────────────────────────

export function buildClientBreakdown(
  tasks: TaskrowTask[],
  periods: CapacityPeriod[],
  totalCapacity: number
): ClientCapacityBreakdown[] {
  const clientMap = new Map<number, { name: string; tasks: TaskrowTask[] }>();
  tasks.forEach(t => {
    if (!clientMap.has(t.clientID)) {
      clientMap.set(t.clientID, { name: t.clientNickName || t.clientDisplayName, tasks: [] });
    }
    clientMap.get(t.clientID)!.tasks.push(t);
  });

  return Array.from(clientMap.entries())
    .map(([clientID, { name, tasks: clientTasks }]) => {
      const byPeriod = periods.map(period => ({
        key: period.key,
        taskCount: clientTasks.filter(t => isTaskInPeriod(t, period)).length,
      }));

      const pendingApproval = clientTasks.filter(t => {
        const step = (t.pipelineStep || "").toLowerCase();
        return !t.closed && (step.includes("aprovação") || step.includes("aprovacao"));
      }).length;

      const reworkCount = clientTasks.filter(t =>
        (t.tags || "").toLowerCase().includes("retrabalho")
      ).length;

      return {
        clientID,
        clientName: name,
        totalTasks: clientTasks.length,
        capacityShare: totalCapacity > 0 ? Math.round((clientTasks.length / totalCapacity) * 100) : 0,
        byPeriod,
        pendingApproval,
        reworkCount,
      };
    })
    .filter(c => c.totalTasks > 0)
    .sort((a, b) => b.totalTasks - a.totalTasks);
}

// ─── Simulation Engine ────────────────────────────────────────────────────────

export function runSimulation(
  originalScores: PeriodCapacityScore[],
  simEntries: SimulationEntry[]
): SimulationResult[] {
  const results: SimulationResult[] = [];

  const grouped = new Map<string, number>();
  simEntries.forEach(e => {
    const current = grouped.get(e.periodKey) || 0;
    grouped.set(e.periodKey, current + e.taskCount * e.weight);
  });

  grouped.forEach((extraWeightedTasks, periodKey) => {
    const original = originalScores.find(s => s.period.key === periodKey);
    if (!original) return;

    const capacityDelta = extraWeightedTasks / original.theoreticalCapacity;
    const simulatedScore = Math.min(Math.round(original.score + capacityDelta * 100), 100);
    const simulatedZone = scoreToZone(simulatedScore);

    results.push({
      periodKey,
      originalScore: original.score,
      simulatedScore,
      delta: simulatedScore - original.score,
      originalZone: original.zone,
      simulatedZone,
      zoneChanged: simulatedZone !== original.zone,
    });
  });

  return results;
}

// ─── Forecast ────────────────────────────────────────────────────────────────

export function buildForecast(scores: PeriodCapacityScore[]): ForecastPoint[] {
  const historical = scores.filter(s => !s.period.isFuture && !s.period.isCurrentMonth && s.totalTasks > 0);
  const withData = scores.filter(s => s.totalTasks > 0);

  // Trend: slope of scores over last 3 months
  const recent = historical.slice(-3);
  let trend = 0;
  if (recent.length >= 2) {
    const deltas = recent.slice(1).map((s, i) => s.score - recent[i].score);
    trend = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }

  return scores.map(s => {
    const hasData = s.totalTasks > 0;
    const isProjected = s.period.isFuture && !hasData;

    let projectedScore = s.score;
    let confidence: ForecastPoint["confidence"] = "high";
    let basis: ForecastPoint["basis"] = "data";

    if (isProjected) {
      // Project from last known score + trend
      const lastKnown = withData[withData.length - 1];
      const monthsAhead = scores.indexOf(s) - scores.indexOf(lastKnown || scores[0]);
      projectedScore = Math.min(
        Math.max(Math.round((lastKnown?.score || 50) + trend * monthsAhead), 0),
        100
      );
      confidence = monthsAhead <= 2 ? "medium" : "low";
      basis = "projection";
    } else if (s.period.isFuture && hasData) {
      confidence = "medium";
    }

    return {
      periodKey: s.period.key,
      label: s.period.label,
      projectedScore,
      zone: scoreToZone(projectedScore),
      confidence,
      basis,
    };
  });
}
