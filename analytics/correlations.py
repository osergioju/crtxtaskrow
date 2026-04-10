"""
correlations.py — ETAPA 2: Análise de Correlações

Calcula correlações entre métricas operacionais e NPS,
identifica variáveis de maior impacto e thresholds críticos.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from dataclasses import dataclass, field


# ── Estruturas de dados ───────────────────────────────────────────────────────

@dataclass
class CorrelationResult:
    feature: str
    label: str
    pearson_r: float
    pearson_p: float
    spearman_r: float
    spearman_p: float
    n_samples: int
    significant: bool          # p < 0.05
    direction: str             # "positive" | "negative" | "none"
    strength: str              # "strong" | "moderate" | "weak" | "negligible"
    threshold: dict | None = None  # threshold crítico detectado


@dataclass
class CorrelationReport:
    correlations: list[CorrelationResult]
    top_features: list[str]           # ordenado por |r| decrescente
    critical_thresholds: list[dict]   # thresholds que disparam queda de NPS


# ── Features que analisamos vs NPS ───────────────────────────────────────────

FEATURE_LABELS = {
    "late_ratio":            "Taxa de Atraso",
    "avg_delivery_time_days": "Tempo Médio de Entrega (dias)",
    "sla":                   "SLA (entregas no prazo)",
    "total_demands":         "Volume de Demandas",
    "demand_growth_rate":    "Crescimento de Demandas",
    "avg_delay_days":        "Atraso Médio (dias)",
    "workload_per_user":     "Carga por Usuário",
}


# ── Análise principal ─────────────────────────────────────────────────────────

def compute_correlations(features: pd.DataFrame) -> CorrelationReport:
    """
    Recebe o DataFrame de features por cliente (saída de features.py)
    e retorna um relatório completo de correlações com NPS.
    """
    target_col = "avg_nps"

    # Filtra somente clientes com NPS registrado
    df = features.dropna(subset=[target_col]).copy()
    results: list[CorrelationResult] = []

    for feat, label in FEATURE_LABELS.items():
        if feat not in df.columns:
            continue

        pair = df[[feat, target_col]].dropna()
        n = len(pair)

        if n < 3:
            continue

        x = pair[feat].values.astype(float)
        y = pair[target_col].values.astype(float)

        # Pearson (relação linear)
        p_r, p_p = stats.pearsonr(x, y)
        # Spearman (relação monotônica, robusta a outliers)
        s_r, s_p = stats.spearmanr(x, y)

        abs_r = abs(p_r)
        strength = (
            "strong"      if abs_r >= 0.6 else
            "moderate"    if abs_r >= 0.4 else
            "weak"        if abs_r >= 0.2 else
            "negligible"
        )
        direction = (
            "positive" if p_r > 0.05 else
            "negative" if p_r < -0.05 else
            "none"
        )
        significant = p_p < 0.05

        threshold = _detect_threshold(x, y, feat)

        results.append(
            CorrelationResult(
                feature=feat,
                label=label,
                pearson_r=round(float(p_r), 4),
                pearson_p=round(float(p_p), 4),
                spearman_r=round(float(s_r), 4),
                spearman_p=round(float(s_p), 4),
                n_samples=n,
                significant=significant,
                direction=direction,
                strength=strength,
                threshold=threshold,
            )
        )

    # Ordena por força da correlação (Spearman como critério principal)
    results.sort(key=lambda r: abs(r.spearman_r), reverse=True)

    top_features = [r.feature for r in results if r.significant and r.strength in ("strong", "moderate")]
    if not top_features:
        top_features = [r.feature for r in results[:3]]

    critical = [r.threshold for r in results if r.threshold is not None]

    return CorrelationReport(
        correlations=results,
        top_features=top_features,
        critical_thresholds=critical,
    )


# ── Detecção de thresholds críticos ──────────────────────────────────────────

def _detect_threshold(x: np.ndarray, y: np.ndarray, feat: str) -> dict | None:
    """
    Divide os dados em bins de x e calcula queda média de NPS entre bins.
    Retorna o valor de x onde a queda de NPS é mais acentuada.
    """
    if len(x) < 6:
        return None

    # Usa percentis para criar 4 grupos
    try:
        quantiles = np.quantile(x, [0.25, 0.50, 0.75])
        labels = ["Q1", "Q2", "Q3", "Q4"]

        bins = [-np.inf] + list(quantiles) + [np.inf]
        group_nps: list[float] = []
        for i in range(len(bins) - 1):
            mask = (x >= bins[i]) & (x < bins[i + 1])
            if mask.sum() >= 1:
                group_nps.append(float(np.mean(y[mask])))
            else:
                group_nps.append(float(np.mean(y)))

        # Maior queda entre grupos consecutivos
        drops = [group_nps[i] - group_nps[i + 1] for i in range(len(group_nps) - 1)]
        max_drop_idx = int(np.argmax(drops))

        if drops[max_drop_idx] < 0.3:
            return None

        threshold_val = float(quantiles[max_drop_idx])
        nps_below = group_nps[max_drop_idx + 1]
        nps_above = group_nps[max_drop_idx]

        return {
            "feature": feat,
            "label": FEATURE_LABELS.get(feat, feat),
            "threshold": round(threshold_val, 4),
            "nps_below_threshold": round(nps_below, 2),
            "nps_above_threshold": round(nps_above, 2),
            "nps_drop": round(drops[max_drop_idx], 2),
        }

    except Exception:
        return None


# ── Impacto marginal ──────────────────────────────────────────────────────────

def compute_marginal_impact(features: pd.DataFrame, feature: str, delta: float = 0.10) -> float | None:
    """
    Estima quanto o NPS muda para uma variação de `delta` em `feature`.
    Usa regressão linear simples.

    Ex: compute_marginal_impact(df, "late_ratio", 0.10)
    → "aumento de 10% no atraso reduz NPS em X pontos"
    """
    df = features[[feature, "avg_nps"]].dropna()
    if len(df) < 3:
        return None

    from sklearn.linear_model import LinearRegression

    x = df[[feature]].values
    y = df["avg_nps"].values
    model = LinearRegression().fit(x, y)
    return round(float(model.coef_[0]) * delta, 3)
