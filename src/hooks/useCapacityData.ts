import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, addMonths } from "date-fns";
import { fetchAllTasks } from "@/lib/api";
import {
  buildPeriods,
  calculateAllPeriods,
  buildGlobalAlerts,
  buildUserBreakdown,
  buildClientBreakdown,
  buildForecast,
  runSimulation,
} from "@/lib/capacityEngine";
import { useCapacityStore } from "@/store/capacityStore";
import type { SimulationEntry } from "@/types/capacity";

/** Fetch a wider date window — independent of the dashboard date picker */
function useCapacityTasks() {
  const today = new Date();
  const startDate = format(subMonths(today, 4), "yyyy-MM-dd");
  const endDate = format(addMonths(today, 8), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["capacity-tasks", startDate, endDate],
    queryFn: () => fetchAllTasks({ StartDate: startDate, EndDate: endDate, Closed: null }),
    staleTime: 1000 * 60 * 10,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useCapacityData() {
  const { capacityPerUser, simEntries } = useCapacityStore();
  const { data: tasks, isLoading, error, refetch } = useCapacityTasks();

  // 4 months past + current + 7 months future = 12 periods
  const periods = useMemo(() => buildPeriods(4, 7), []);

  // Flatten sim entries into periodKey → extraWeight
  const simWeights = useMemo(() => {
    const map = new Map<string, number>();
    simEntries.forEach(e => {
      map.set(e.periodKey, (map.get(e.periodKey) || 0) + e.taskCount * e.weight);
    });
    return Array.from(map.entries()).map(([periodKey, extraWeight]) => ({ periodKey, extraWeight }));
  }, [simEntries]);

  const scores = useMemo(() => {
    if (!tasks) return [];
    return calculateAllPeriods(tasks, periods, capacityPerUser, simWeights);
  }, [tasks, periods, capacityPerUser, simWeights]);

  const globalAlerts = useMemo(() => buildGlobalAlerts(scores), [scores]);

  const userBreakdown = useMemo(() => {
    if (!tasks) return [];
    return buildUserBreakdown(tasks, periods);
  }, [tasks, periods]);

  const clientBreakdown = useMemo(() => {
    if (!tasks) return [];
    const totalCapacity = tasks.length;
    return buildClientBreakdown(tasks, periods, totalCapacity);
  }, [tasks, periods]);

  const forecast = useMemo(() => buildForecast(scores), [scores]);

  const simResults = useMemo(() => {
    if (simEntries.length === 0) return [];
    return runSimulation(scores, simEntries);
  }, [scores, simEntries]);

  const summaryStats = useMemo(() => {
    if (scores.length === 0) return null;
    const present = scores.filter(s => s.period.isCurrentMonth || (!s.period.isFuture && s.totalTasks > 0));
    const future = scores.filter(s => s.period.isFuture);
    const criticalFuture = future.filter(s => s.zone === "critical" || s.zone === "collapse");
    const avgScore = present.length > 0
      ? Math.round(present.reduce((sum, s) => sum + s.score, 0) / present.length)
      : 0;
    const peakScore = scores.reduce((max, s) => s.score > max ? s.score : max, 0);
    const peakPeriod = scores.find(s => s.score === peakScore);
    const totalOpenTasks = scores.filter(s => s.period.isCurrentMonth).reduce((sum, s) => sum + s.openCount, 0);
    const totalUsers = Math.max(...scores.map(s => s.activeUsers), 0);

    return {
      avgScore,
      peakScore,
      peakPeriodLabel: peakPeriod?.period.label || "",
      criticalFutureCount: criticalFuture.length,
      totalOpenTasks,
      totalUsers,
    };
  }, [scores]);

  return {
    tasks: tasks || [],
    periods,
    scores,
    globalAlerts,
    userBreakdown,
    clientBreakdown,
    forecast,
    simResults,
    summaryStats,
    isLoading,
    error,
    refetch,
  };
}
