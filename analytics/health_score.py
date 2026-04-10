"""
health_score.py — ETAPA 4: Health Score do Cliente

Score 0–100 que combina NPS, SLA, taxa de atraso e tendências.
Classificação: Saudável / Atenção / Risco.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass


# ── Pesos de cada componente ──────────────────────────────────────────────────

WEIGHTS = {
    "nps":           0.40,   # NPS é o indicador central
    "sla":           0.25,   # SLA tem alto impacto direto
    "late_ratio":    0.20,   # Atraso penaliza experiência
    "demand_growth": 0.15,   # Crescimento excessivo gera sobrecarga
}

# Classificação
THRESHOLDS = {
    "healthy":   (80, 100),
    "warning":   (50, 79),
    "critical":  (0,  49),
}

LABELS = {
    "healthy":  "Saudável",
    "warning":  "Atenção",
    "critical": "Risco",
}

COLORS = {
    "healthy":  "#10B981",  # emerald
    "warning":  "#F59E0B",  # amber
    "critical": "#EF4444",  # red
}


@dataclass
class HealthScoreResult:
    client_id: str
    client_name: str
    score: float                     # 0–100
    classification: str              # healthy | warning | critical
    label: str
    color: str
    components: dict[str, float]     # score parcial de cada componente
    explanation: str


# ── Cálculo ───────────────────────────────────────────────────────────────────

def compute_health_scores(features: pd.DataFrame) -> list[HealthScoreResult]:
    """
    Recebe o DataFrame de features (saída de features.py) e
    retorna a lista de health scores por cliente.
    """
    results = []
    for cid, row in features.iterrows():
        result = _score_client(cid, row)
        results.append(result)

    results.sort(key=lambda r: r.score)
    return results


def _score_client(cid: str, row: pd.Series) -> HealthScoreResult:
    client_name = str(row.get("client_name", cid))
    components: dict[str, float] = {}

    # ── Componente NPS (0–100) ────────────────────────────────────────────────
    avg_nps = row.get("avg_nps")
    nps_score = _nps_component(avg_nps, row.get("nps_trend"))
    components["nps"] = round(nps_score, 1)

    # ── Componente SLA (0–100) ────────────────────────────────────────────────
    sla = row.get("sla", 1.0) or 1.0
    sla_score = float(sla) * 100
    components["sla"] = round(sla_score, 1)

    # ── Componente Late Ratio (0–100, invertido) ──────────────────────────────
    late_ratio = row.get("late_ratio", 0.0) or 0.0
    # 0% atraso → 100; 50%+ atraso → 0
    late_score = max(0.0, 100.0 - (float(late_ratio) / 0.50) * 100.0)
    components["late_ratio"] = round(late_score, 1)

    # ── Componente Crescimento de Demandas (0–100) ────────────────────────────
    growth = row.get("demand_growth_rate", 0.0) or 0.0
    # Crescimento moderado (0–30%) é neutro/bom; acima disso penaliza
    growth_score = max(0.0, 100.0 - max(0.0, (float(growth) - 0.30) / 0.70) * 100.0)
    components["demand_growth"] = round(growth_score, 1)

    # ── Score final ponderado ─────────────────────────────────────────────────
    total = (
        components["nps"]          * WEIGHTS["nps"] +
        components["sla"]          * WEIGHTS["sla"] +
        components["late_ratio"]   * WEIGHTS["late_ratio"] +
        components["demand_growth"] * WEIGHTS["demand_growth"]
    )
    score = round(float(np.clip(total, 0, 100)), 1)

    # ── Classificação ─────────────────────────────────────────────────────────
    classification = (
        "healthy"  if score >= 80 else
        "warning"  if score >= 50 else
        "critical"
    )

    explanation = _build_explanation(score, classification, components, row)

    return HealthScoreResult(
        client_id=str(cid),
        client_name=client_name,
        score=score,
        classification=classification,
        label=LABELS[classification],
        color=COLORS[classification],
        components=components,
        explanation=explanation,
    )


def _nps_component(avg_nps: float | None, trend: float | None) -> float:
    if avg_nps is None:
        return 60.0  # neutro quando não há dados

    # NPS 0–10 → 0–100
    base = float(avg_nps) / 10.0 * 100.0

    # Bonus/penalidade por tendência recente
    if trend is not None:
        trend_adj = float(trend) * 5.0  # cada ponto de NPS de tendência = ±5 pts
        base = base + trend_adj

    return float(np.clip(base, 0, 100))


def _build_explanation(
    score: float,
    classification: str,
    components: dict[str, float],
    row: pd.Series,
) -> str:
    parts: list[str] = []

    sla_pct = int(float(row.get("sla", 1.0) or 1.0) * 100)
    late_pct = int(float(row.get("late_ratio", 0.0) or 0.0) * 100)
    avg_nps = row.get("avg_nps")

    if avg_nps is not None:
        parts.append(f"NPS médio de {avg_nps:.1f}")

    trend = row.get("nps_trend")
    if trend is not None:
        if trend > 0.2:
            parts.append(f"tendência de alta de +{trend:.1f} pts")
        elif trend < -0.2:
            parts.append(f"tendência de queda de {trend:.1f} pts")

    if late_pct > 30:
        parts.append(f"atraso crítico de {late_pct}%")
    elif late_pct > 15:
        parts.append(f"atraso elevado de {late_pct}%")

    if sla_pct < 70:
        parts.append(f"SLA baixo de {sla_pct}%")
    elif sla_pct >= 90:
        parts.append(f"SLA excelente de {sla_pct}%")

    growth = float(row.get("demand_growth_rate", 0.0) or 0.0)
    if growth > 0.5:
        parts.append(f"crescimento de demandas de +{int(growth*100)}%")

    label = LABELS[classification]
    if not parts:
        return f"Score {score:.0f} — {label}."

    return f"Score {score:.0f} ({label}): " + ", ".join(parts) + "."
