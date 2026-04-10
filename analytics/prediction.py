"""
prediction.py — ETAPA 5 & 6: Previsão de NPS + Explicação

Estratégia adaptativa:
  - ≥ 5 respostas NPS com features: regressão linear (sklearn)
  - < 5 respostas:                  heurística operacional

Outputs por cliente:
  - next_nps_prediction   (0–10)
  - trend                 (up | stable | down)
  - prob_detractor        (0–1, score < 7)
  - days_to_drop          (None ou int)
  - explanation           (texto em pt-BR)
  - confidence            (high | medium | low)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sklearn.linear_model import LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.exceptions import NotFittedError


# ── Estrutura de resultado ────────────────────────────────────────────────────

@dataclass
class NPSPrediction:
    client_id: str
    client_name: str
    current_avg_nps: float | None
    next_nps_prediction: float | None
    trend: str                          # "up" | "stable" | "down"
    trend_label: str
    prob_detractor: float               # probabilidade de virar detrator (score < 7)
    prob_promoter: float                # probabilidade de ser promotor (score >= 9)
    days_to_drop: int | None            # estimativa de dias até queda, se detectado
    explanation: str
    confidence: str                     # "high" | "medium" | "low"
    feature_importances: dict[str, float] = field(default_factory=dict)
    method_used: str = "heuristic"      # "regression" | "heuristic"


# ── Features usadas para regressão ───────────────────────────────────────────

REGRESSION_FEATURES = [
    "late_ratio",
    "sla",
    "avg_delivery_time_days",
    "demand_growth_rate",
    "avg_delay_days",
    "workload_per_user",
]

FEATURE_LABELS = {
    "late_ratio":             "taxa de atraso",
    "sla":                    "SLA",
    "avg_delivery_time_days": "tempo de entrega",
    "demand_growth_rate":     "crescimento de demandas",
    "avg_delay_days":         "atraso médio",
    "workload_per_user":      "carga por usuário",
}


# ── Previsão em batch ─────────────────────────────────────────────────────────

def compute_predictions(
    features: pd.DataFrame,
    nps_raw: pd.DataFrame,
) -> list[NPSPrediction]:
    """
    Computa previsões de NPS para todos os clientes.

    Parâmetros
    ----------
    features : saída de features.compute_client_features()
    nps_raw  : DataFrame bruto com colunas (client_id, score, created_at)
    """
    # Tenta treinar modelo global com clientes que têm dados suficientes
    global_model = _try_fit_global_model(features)

    predictions: list[NPSPrediction] = []
    for cid, row in features.iterrows():
        client_nps = nps_raw[nps_raw["client_id"] == cid].sort_values("created_at")
        pred = _predict_client(str(cid), row, client_nps, global_model)
        predictions.append(pred)

    predictions.sort(key=lambda p: p.prob_detractor, reverse=True)
    return predictions


# ── Modelo global ─────────────────────────────────────────────────────────────

def _try_fit_global_model(features: pd.DataFrame) -> Pipeline | None:
    """Tenta ajustar regressão Ridge com clientes que têm NPS e features."""
    df = features.dropna(subset=["avg_nps"]).copy()

    avail_features = [f for f in REGRESSION_FEATURES if f in df.columns]
    if not avail_features:
        return None

    df_clean = df[avail_features + ["avg_nps"]].dropna()
    if len(df_clean) < 5:
        return None

    X = df_clean[avail_features].values.astype(float)
    y = df_clean["avg_nps"].values.astype(float)

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("reg", Ridge(alpha=1.0)),
    ])
    model.fit(X, y)
    return model


# ── Previsão individual ───────────────────────────────────────────────────────

def _predict_client(
    cid: str,
    row: pd.Series,
    client_nps: pd.DataFrame,
    global_model: Pipeline | None,
) -> NPSPrediction:

    client_name = str(row.get("client_name", cid))
    current_avg = row.get("avg_nps")
    last_nps = row.get("last_nps")
    nps_trend = row.get("nps_trend")

    avail_features = [f for f in REGRESSION_FEATURES if f in row.index]
    has_op_data = any(pd.notna(row.get(f)) for f in avail_features)
    has_nps = current_avg is not None and not pd.isna(current_avg)

    # ── Escolhe método ────────────────────────────────────────────────────────
    use_regression = (
        global_model is not None
        and has_op_data
        and has_nps
        and len(client_nps) >= 3
    )

    if use_regression:
        next_pred, feat_imp, confidence = _regression_predict(row, avail_features, global_model)
        method = "regression"
    else:
        next_pred, feat_imp, confidence = _heuristic_predict(row, current_avg)
        method = "heuristic"

    if next_pred is None:
        next_pred = float(current_avg) if has_nps else 7.0

    next_pred = float(np.clip(next_pred, 0, 10))

    # ── Tendência ─────────────────────────────────────────────────────────────
    ref = float(current_avg) if has_nps else 7.0
    delta = next_pred - ref

    if abs(delta) < 0.4:
        trend = "stable"
        trend_label = "Estável"
    elif delta > 0:
        trend = "up"
        trend_label = f"Alta esperada (+{delta:.1f} pts)"
    else:
        trend = "down"
        trend_label = f"Queda esperada ({delta:.1f} pts)"

    # ── Probabilidade de detrator / promotor ──────────────────────────────────
    prob_detractor = _score_to_prob_detractor(next_pred)
    prob_promoter = _score_to_prob_promoter(next_pred)

    # ── Estimativa de dias para queda ─────────────────────────────────────────
    days_to_drop = _estimate_days_to_drop(row, client_nps, trend)

    # ── Explicação ────────────────────────────────────────────────────────────
    explanation = _build_explanation(
        cid=cid,
        current_avg=current_avg,
        next_pred=next_pred,
        trend=trend,
        nps_trend=nps_trend,
        row=row,
        feat_imp=feat_imp,
    )

    return NPSPrediction(
        client_id=cid,
        client_name=client_name,
        current_avg_nps=round(float(current_avg), 2) if has_nps else None,
        next_nps_prediction=round(next_pred, 2),
        trend=trend,
        trend_label=trend_label,
        prob_detractor=round(prob_detractor, 3),
        prob_promoter=round(prob_promoter, 3),
        days_to_drop=days_to_drop,
        explanation=explanation,
        confidence=confidence,
        feature_importances=feat_imp,
        method_used=method,
    )


# ── Modelos ───────────────────────────────────────────────────────────────────

def _regression_predict(
    row: pd.Series,
    avail_features: list[str],
    model: Pipeline,
) -> tuple[float, dict, str]:
    """Previsão via regressão linear global."""
    x_vals = []
    feat_imp: dict[str, float] = {}

    for f in REGRESSION_FEATURES:
        val = row.get(f)
        x_vals.append(float(val) if pd.notna(val) else 0.0)

    X = np.array(x_vals).reshape(1, -1)

    try:
        pred = float(model.predict(X)[0])
    except Exception:
        pred = float(row.get("avg_nps", 7.0))

    # Importâncias aproximadas via coeficientes escalados
    try:
        coefs = model.named_steps["reg"].coef_
        scale = model.named_steps["scaler"].scale_
        raw_imp = np.abs(coefs / (scale + 1e-9))
        raw_imp = raw_imp / (raw_imp.sum() + 1e-9)
        for f, imp in zip(REGRESSION_FEATURES, raw_imp):
            feat_imp[f] = round(float(imp), 4)
    except Exception:
        pass

    confidence = "high" if len(avail_features) >= 4 else "medium"
    return pred, feat_imp, confidence


def _heuristic_predict(row: pd.Series, current_avg: float | None) -> tuple[float, dict, str]:
    """
    Previsão heurística quando dados são insuficientes.
    Parte de 7.0 e aplica penalidades/bonificações operacionais.
    """
    base = float(current_avg) if current_avg is not None and not pd.isna(current_avg) else 7.0
    feat_imp: dict[str, float] = {}
    adjustments = []

    late_ratio = float(row.get("late_ratio", 0.0) or 0.0)
    sla        = float(row.get("sla", 1.0) or 1.0)
    avg_delay  = row.get("avg_delay_days")
    growth     = float(row.get("demand_growth_rate", 0.0) or 0.0)
    trend      = row.get("nps_trend")

    # Penalidade por atraso
    if late_ratio > 0.05:
        adj = -(late_ratio * 3.5)
        base += adj
        adjustments.append(("late_ratio", adj))
        feat_imp["late_ratio"] = abs(adj)

    # Penalidade por SLA baixo
    if sla < 0.85:
        adj = -(1 - sla) * 2.5
        base += adj
        adjustments.append(("sla", adj))
        feat_imp["sla"] = abs(adj)

    # Penalidade por atraso médio alto
    if avg_delay is not None and not pd.isna(avg_delay) and float(avg_delay) > 5:
        adj = -min(1.5, (float(avg_delay) - 5) / 10)
        base += adj
        adjustments.append(("avg_delay_days", adj))
        feat_imp["avg_delay_days"] = abs(adj)

    # Penalidade por crescimento excessivo
    if growth > 0.5:
        adj = -(growth - 0.5) * 1.5
        base += adj
        adjustments.append(("demand_growth_rate", adj))
        feat_imp["demand_growth_rate"] = abs(adj)

    # Incorpora tendência histórica do NPS
    if trend is not None and not pd.isna(trend):
        adj = float(trend) * 0.5
        base += adj

    confidence = "medium" if current_avg is not None else "low"
    return float(np.clip(base, 0, 10)), feat_imp, confidence


# ── Helpers de probabilidade ──────────────────────────────────────────────────

def _score_to_prob_detractor(score: float) -> float:
    """Mapeia score previsto para probabilidade de detrator (< 7)."""
    # Logística suavizada: prob alta quando score < 7
    if score <= 4:
        return 0.95
    if score >= 9:
        return 0.02
    # Interpolação sigmoide
    x = (score - 7.0) * 1.2
    return float(1 / (1 + np.exp(x)))


def _score_to_prob_promoter(score: float) -> float:
    if score >= 9.5:
        return 0.95
    if score <= 6:
        return 0.05
    x = (score - 9.0) * 1.5
    return float(1 / (1 + np.exp(-x)))


# ── Estimativa de dias até queda ─────────────────────────────────────────────

def _estimate_days_to_drop(row: pd.Series, client_nps: pd.DataFrame, trend: str) -> int | None:
    if trend != "down":
        return None

    if len(client_nps) < 2:
        # Usa métricas operacionais para estimar urgência
        late_ratio = float(row.get("late_ratio", 0.0) or 0.0)
        if late_ratio > 0.40:
            return 15
        if late_ratio > 0.25:
            return 30
        return 45

    # Calcula velocidade de queda com base nas últimas 3 respostas
    recent = client_nps.tail(3)
    if len(recent) >= 2:
        scores = recent["score"].values.astype(float)
        dates = (recent["created_at"] - recent["created_at"].iloc[0]).dt.days.values
        if dates[-1] > 0:
            slope = (scores[-1] - scores[0]) / dates[-1]  # pts/dia
            current = scores[-1]
            detractor_threshold = 6.5
            if slope < 0 and current > detractor_threshold:
                days = (detractor_threshold - current) / slope
                return max(1, int(np.ceil(days)))

    return None


# ── Explicação em linguagem natural ──────────────────────────────────────────

def _build_explanation(
    cid: str,
    current_avg: float | None,
    next_pred: float,
    trend: str,
    nps_trend: float | None,
    row: pd.Series,
    feat_imp: dict[str, float],
) -> str:
    """Gera explicação clara em português."""

    late_ratio = float(row.get("late_ratio", 0.0) or 0.0)
    sla        = float(row.get("sla", 1.0) or 1.0)
    avg_delay  = row.get("avg_delay_days")
    growth     = float(row.get("demand_growth_rate", 0.0) or 0.0)

    reasons: list[str] = []
    positives: list[str] = []

    # ── Fatores de risco ──────────────────────────────────────────────────────
    if late_ratio > 0.30:
        reasons.append(f"taxa de atraso de {int(late_ratio*100)}% (acima do limite crítico de 30%)")
    elif late_ratio > 0.15:
        reasons.append(f"taxa de atraso de {int(late_ratio*100)}%")

    if sla < 0.70:
        reasons.append(f"SLA caiu para {int(sla*100)}% (abaixo do mínimo aceitável de 70%)")
    elif sla < 0.85:
        reasons.append(f"SLA de {int(sla*100)}%")

    if avg_delay is not None and not pd.isna(avg_delay) and float(avg_delay) > 5:
        reasons.append(f"atraso médio de {float(avg_delay):.0f} dias nas entregas")

    if growth > 0.50:
        reasons.append(f"crescimento acelerado de demandas de +{int(growth*100)}%")

    if nps_trend is not None and not pd.isna(nps_trend) and float(nps_trend) < -0.5:
        reasons.append(f"queda de {abs(float(nps_trend)):.1f} pts de NPS nas últimas semanas")

    # ── Fatores positivos ─────────────────────────────────────────────────────
    if sla >= 0.90:
        positives.append(f"SLA excelente de {int(sla*100)}%")
    if late_ratio <= 0.05:
        positives.append("baixíssima taxa de atraso")
    if nps_trend is not None and not pd.isna(nps_trend) and float(nps_trend) > 0.5:
        positives.append(f"NPS em alta de +{float(nps_trend):.1f} pts recentemente")

    # ── Monta texto ──────────────────────────────────────────────────────────
    current_str = f"{current_avg:.1f}" if current_avg is not None else "desconhecido"
    pred_str = f"{next_pred:.1f}"

    if trend == "down":
        intro = f"O NPS previsto é {pred_str} (atual: {current_str}) — queda esperada."
        if reasons:
            intro += " Principais fatores: " + "; ".join(reasons) + "."
    elif trend == "up":
        intro = f"O NPS previsto é {pred_str} (atual: {current_str}) — melhora esperada."
        if positives:
            intro += " Indicadores positivos: " + "; ".join(positives) + "."
    else:
        intro = f"O NPS previsto é {pred_str} (atual: {current_str}) — estável."
        if reasons:
            intro += " Pontos de atenção: " + "; ".join(reasons) + "."
        elif positives:
            intro += " " + "; ".join(positives).capitalize() + "."

    return intro
