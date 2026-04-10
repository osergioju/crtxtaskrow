"""
insights.py — ETAPA 3: Insights Automáticos em Linguagem Natural

Gera frases acionáveis baseadas nas correlações e features calculadas.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass

from analytics.correlations import CorrelationReport, compute_marginal_impact


@dataclass
class Insight:
    category: str           # "correlation" | "threshold" | "segment" | "trend"
    severity: str           # "info" | "warning" | "critical"
    text: str               # frase em português
    metric: str | None = None
    value: float | None = None


def generate_insights(
    features: pd.DataFrame,
    correlation_report: CorrelationReport,
) -> list[Insight]:
    """
    Gera lista de insights automáticos combinando correlações e features.
    """
    insights: list[Insight] = []

    insights += _correlation_insights(features, correlation_report)
    insights += _threshold_insights(correlation_report)
    insights += _segment_insights(features)
    insights += _trend_insights(features)

    # Ordena: crítico > warning > info
    order = {"critical": 0, "warning": 1, "info": 2}
    insights.sort(key=lambda i: order.get(i.severity, 3))

    return insights


# ── Insights de correlação ────────────────────────────────────────────────────

def _correlation_insights(
    features: pd.DataFrame,
    report: CorrelationReport,
) -> list[Insight]:
    insights = []

    for corr in report.correlations:
        if not corr.significant or corr.strength == "negligible":
            continue

        label = corr.label
        r = corr.spearman_r

        if corr.feature in ("late_ratio", "avg_delivery_time_days", "avg_delay_days"):
            # correlação negativa esperada — maior atraso → menor NPS
            delta_impact = compute_marginal_impact(features, corr.feature, delta=0.10)
            if delta_impact is not None:
                direction = "reduz" if delta_impact < 0 else "aumenta"
                severity = "critical" if abs(delta_impact) >= 1.0 else "warning"
                insights.append(Insight(
                    category="correlation",
                    severity=severity,
                    metric=corr.feature,
                    value=round(abs(delta_impact), 2),
                    text=(
                        f"Um aumento de 10% em {label.lower()} {direction} o NPS em "
                        f"{abs(delta_impact):.1f} pontos em média "
                        f"(correlação Spearman r={r:.2f})."
                    ),
                ))

        elif corr.feature == "sla":
            delta_impact = compute_marginal_impact(features, corr.feature, delta=0.10)
            if delta_impact is not None and delta_impact > 0:
                insights.append(Insight(
                    category="correlation",
                    severity="info",
                    metric="sla",
                    value=round(delta_impact, 2),
                    text=(
                        f"Cada 10% de melhora no SLA está associado a +{delta_impact:.1f} pts de NPS "
                        f"(correlação r={r:.2f})."
                    ),
                ))

        elif corr.feature == "demand_growth_rate" and corr.strength in ("moderate", "strong"):
            direction = "negativa" if r < 0 else "positiva"
            insights.append(Insight(
                category="correlation",
                severity="info",
                metric="demand_growth_rate",
                text=(
                    f"Crescimento acelerado de demandas tem correlação {direction} com NPS "
                    f"(r={r:.2f}), sugerindo possível sobrecarga operacional."
                ),
            ))

    return insights


# ── Insights de threshold crítico ────────────────────────────────────────────

def _threshold_insights(report: CorrelationReport) -> list[Insight]:
    insights = []

    for th in report.critical_thresholds:
        feat = th.get("feature", "")
        label = th.get("label", feat)
        threshold_val = th.get("threshold", 0)
        nps_below = th.get("nps_below_threshold", 0)
        nps_above = th.get("nps_above_threshold", 0)
        drop = th.get("nps_drop", 0)

        severity = "critical" if drop >= 1.5 else "warning"

        if feat == "late_ratio":
            pct = int(threshold_val * 100)
            insights.append(Insight(
                category="threshold",
                severity=severity,
                metric=feat,
                value=threshold_val,
                text=(
                    f"Clientes com taxa de atraso acima de {pct}% têm NPS médio de "
                    f"{nps_below:.1f}, versus {nps_above:.1f} dos demais "
                    f"(queda de {drop:.1f} pts)."
                ),
            ))
        elif feat == "sla":
            pct = int(threshold_val * 100)
            insights.append(Insight(
                category="threshold",
                severity=severity,
                metric=feat,
                value=threshold_val,
                text=(
                    f"Clientes com SLA abaixo de {pct}% têm NPS médio de {nps_below:.1f} "
                    f"versus {nps_above:.1f} dos que mantêm SLA acima desse patamar."
                ),
            ))
        else:
            insights.append(Insight(
                category="threshold",
                severity=severity,
                metric=feat,
                value=threshold_val,
                text=(
                    f"Threshold crítico em {label}: acima de {threshold_val:.2f}, "
                    f"o NPS médio cai de {nps_above:.1f} para {nps_below:.1f} "
                    f"({drop:.1f} pts de diferença)."
                ),
            ))

    return insights


# ── Insights de segmento ──────────────────────────────────────────────────────

def _segment_insights(features: pd.DataFrame) -> list[Insight]:
    insights = []
    df = features.dropna(subset=["avg_nps"])

    if df.empty:
        return insights

    # Clientes com SLA < 80%
    low_sla = df[df["sla"] < 0.80]
    if not low_sla.empty:
        avg = round(float(low_sla["avg_nps"].mean()), 1)
        n = len(low_sla)
        insights.append(Insight(
            category="segment",
            severity="warning",
            metric="sla",
            value=avg,
            text=f"Clientes com SLA abaixo de 80% ({n} no total) têm NPS médio de {avg}.",
        ))

    # Clientes com alta carga de demandas
    if "workload_per_user" in df.columns:
        median_wl = df["workload_per_user"].median()
        high_load = df[df["workload_per_user"] > median_wl * 1.5]
        if not high_load.empty and high_load["avg_nps"].notna().any():
            avg_high = round(float(high_load["avg_nps"].mean()), 1)
            avg_normal = round(float(df[df["workload_per_user"] <= median_wl * 1.5]["avg_nps"].mean()), 1)
            if avg_high < avg_normal - 0.3:
                insights.append(Insight(
                    category="segment",
                    severity="info",
                    metric="workload_per_user",
                    text=(
                        f"Clientes com alta carga de demandas por usuário tendem a ter NPS "
                        f"inferior ({avg_high} vs {avg_normal} em carga normal)."
                    ),
                ))

    # Clientes com crescimento acelerado
    if "demand_growth_rate" in df.columns:
        fast_growth = df[df["demand_growth_rate"] > 0.5]
        if not fast_growth.empty and fast_growth["avg_nps"].notna().any():
            avg_fg = round(float(fast_growth["avg_nps"].mean()), 1)
            insights.append(Insight(
                category="segment",
                severity="info",
                metric="demand_growth_rate",
                text=(
                    f"Clientes com crescimento de demandas acima de 50% nos últimos 30 dias "
                    f"têm NPS médio de {avg_fg}."
                ),
            ))

    return insights


# ── Insights de tendência ─────────────────────────────────────────────────────

def _trend_insights(features: pd.DataFrame) -> list[Insight]:
    insights = []
    df = features.dropna(subset=["nps_trend"])

    if df.empty:
        return insights

    declining = df[df["nps_trend"] < -0.5]
    if not declining.empty:
        names = declining.get("client_name", declining.index).tolist()
        n = len(declining)
        insights.append(Insight(
            category="trend",
            severity="warning",
            metric="nps_trend",
            text=(
                f"{n} cliente(s) com tendência de queda de NPS nos últimos 30 dias: "
                f"{', '.join(str(x) for x in names[:5])}"
                + (" e outros." if n > 5 else ".")
            ),
        ))

    improving = df[df["nps_trend"] > 0.5]
    if not improving.empty:
        n = len(improving)
        insights.append(Insight(
            category="trend",
            severity="info",
            metric="nps_trend",
            text=f"{n} cliente(s) com tendência positiva de NPS nos últimos 30 dias.",
        ))

    return insights
