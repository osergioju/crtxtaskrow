export interface AnalyticsSummary {
  total_clients: number;
  healthy: number;
  warning: number;
  critical: number;
  high_detractor_risk: number;
  critical_alerts: number;
  overall_avg_nps: number | null;
}

export interface HealthInfo {
  score: number | null;
  classification: "healthy" | "warning" | "critical" | null;
  label: string | null;
  color: string | null;
  components: Record<string, number>;
  explanation: string | null;
}

export interface PredictionInfo {
  next_nps: number | null;
  trend: "up" | "stable" | "down" | null;
  trend_label: string | null;
  prob_detractor: number | null;
  prob_promoter: number | null;
  days_to_drop: number | null;
  explanation: string | null;
  confidence: "high" | "medium" | "low" | null;
  method: string | null;
  feature_importances: Record<string, number>;
}

export interface AnalyticsClient {
  client_id: string;
  client_name: string;
  total_demands: number;
  demands_last_30d: number;
  late_ratio: number | null;
  sla: number | null;
  avg_delivery_time_days: number | null;
  avg_delay_days: number | null;
  workload_per_user: number | null;
  demand_growth_rate: number | null;
  category_top: string | null;
  avg_nps: number | null;
  last_nps: number | null;
  nps_count: number;
  nps_trend: number | null;
  health: HealthInfo;
  prediction: PredictionInfo;
}

export interface AnalyticsAlert {
  type: string;
  severity: "critical" | "warning" | "info";
  client_id: string;
  client_name: string;
  title: string;
  description: string;
  metric: string | null;
  value: number | null;
}

export interface AnalyticsInsight {
  category: string;
  severity: "critical" | "warning" | "info";
  text: string;
  metric: string | null;
  value: number | null;
}

export interface CorrelationDetail {
  feature: string;
  label: string;
  pearson_r: number;
  spearman_r: number;
  significant: boolean;
  strength: string;
  direction: string;
  n_samples: number;
}

export interface EmployeeRanking {
  rank: number;
  user_id: string;
  display_name: string;
  performance_score: number;
  label: string;
  total_demands: number;
  late_ratio: number;
  sla: number;
  avg_nps_of_clients: number | null;
  client_count: number;
  avg_delivery_time_days: number | null;
}

export interface ClientRankingEntry {
  rank: number;
  client_id: string;
  client_name: string;
  health_score: number;
  classification: string;
  label: string;
}

export interface AnalyticsResult {
  generated_at: string;
  summary: AnalyticsSummary;
  clients: AnalyticsClient[];
  alerts: AnalyticsAlert[];
  insights: AnalyticsInsight[];
  correlations: {
    top_features: string[];
    critical_thresholds: Record<string, unknown>[];
    details: CorrelationDetail[];
  };
  rankings: {
    clients_by_health: ClientRankingEntry[];
    clients_by_detractor_risk: unknown[];
    employees: EmployeeRanking[];
  };
  chart_suggestions: unknown[];
}
