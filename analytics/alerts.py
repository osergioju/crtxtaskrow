"""
alerts.py — ETAPA 7: Alertas Inteligentes

Gera lista de alertas priorizados por criticidade:
  - clientes com risco alto de se tornarem detratores
  - queda recente de NPS
  - aumento crítico de atraso
  - sobrecarga de demandas
"""

from __future__ import annotations

import pandas as pd
from dataclasses import dataclass


@dataclass
class Alert:
    type: str           # "detractor_risk" | "nps_drop" | "delay_spike" | "overload" | "sla_drop"
    severity: str       # "critical" | "warning" | "info"
    client_id: str
    client_name: str
    title: str
    description: str
    metric: str | None = None
    value: float | None = None


# ── Thresholds de alerta ──────────────────────────────────────────────────────

THRESHOLDS = {
    "prob_detractor_critical": 0.60,
    "prob_detractor_warning":  0.40,
    "nps_drop_critical":       -1.5,
    "nps_drop_warning":        -0.5,
    "late_ratio_critical":     0.35,
    "late_ratio_warning":      0.20,
    "sla_critical":            0.70,
    "sla_warning":             0.80,
    "workload_critical":       40.0,
    "workload_warning":        25.0,
}


# ── Gerador principal ─────────────────────────────────────────────────────────

def generate_alerts(
    features: pd.DataFrame,
    predictions: list,           # list[NPSPrediction] de prediction.py
) -> list[Alert]:
    """
    Combina features e previsões para gerar alertas ordenados por criticidade.
    """
    alerts: list[Alert] = []

    # Índice de previsões por client_id
    pred_map = {p.client_id: p for p in predictions}

    for cid, row in features.iterrows():
        cid = str(cid)
        name = str(row.get("client_name", cid))
        pred = pred_map.get(cid)

        alerts += _detractor_risk_alerts(cid, name, row, pred)
        alerts += _nps_drop_alerts(cid, name, row, pred)
        alerts += _delay_alerts(cid, name, row)
        alerts += _sla_alerts(cid, name, row)
        alerts += _overload_alerts(cid, name, row)

    # Ordena: critical primeiro, depois warning, depois por client_name
    order = {"critical": 0, "warning": 1, "info": 2}
    alerts.sort(key=lambda a: (order.get(a.severity, 3), a.client_name))

    return alerts


# ── Risco de detrator ─────────────────────────────────────────────────────────

def _detractor_risk_alerts(cid, name, row, pred) -> list[Alert]:
    if pred is None:
        return []

    p = pred.prob_detractor
    if p < THRESHOLDS["prob_detractor_warning"]:
        return []

    severity = "critical" if p >= THRESHOLDS["prob_detractor_critical"] else "warning"
    pct = int(p * 100)

    desc_parts = [f"Probabilidade de {pct}% de se tornar detrator (NPS < 7)."]
    if pred.days_to_drop is not None:
        desc_parts.append(f"Queda estimada em até {pred.days_to_drop} dias.")
    desc_parts.append(pred.explanation)

    return [Alert(
        type="detractor_risk",
        severity=severity,
        client_id=cid,
        client_name=name,
        title=f"Risco de detrator: {name}",
        description=" ".join(desc_parts),
        metric="prob_detractor",
        value=round(p, 3),
    )]


# ── Queda recente de NPS ──────────────────────────────────────────────────────

def _nps_drop_alerts(cid, name, row, pred) -> list[Alert]:
    alerts = []
    trend = row.get("nps_trend")

    if trend is None or pd.isna(trend):
        return []

    trend = float(trend)

    if trend <= THRESHOLDS["nps_drop_critical"]:
        severity = "critical"
        title = f"Queda crítica de NPS: {name}"
    elif trend <= THRESHOLDS["nps_drop_warning"]:
        severity = "warning"
        title = f"Queda de NPS detectada: {name}"
    else:
        return []

    last = row.get("last_nps")
    desc = f"NPS caiu {abs(trend):.1f} pontos nos últimos 30 dias."
    if last is not None and not pd.isna(last):
        desc += f" Último NPS registrado: {float(last):.1f}."
    if pred:
        desc += f" Previsão: {pred.next_nps_prediction:.1f}."

    alerts.append(Alert(
        type="nps_drop",
        severity=severity,
        client_id=cid,
        client_name=name,
        title=title,
        description=desc,
        metric="nps_trend",
        value=round(trend, 2),
    ))
    return alerts


# ── Atraso crítico ────────────────────────────────────────────────────────────

def _delay_alerts(cid, name, row) -> list[Alert]:
    late = float(row.get("late_ratio", 0.0) or 0.0)

    if late < THRESHOLDS["late_ratio_warning"]:
        return []

    severity = "critical" if late >= THRESHOLDS["late_ratio_critical"] else "warning"
    pct = int(late * 100)

    avg_delay = row.get("avg_delay_days")
    awaiting = int(row.get("awaiting_approval", 0) or 0)
    desc = f"Taxa de atraso interno em {pct}% das demandas (exclui tarefas em aprovação do cliente)."
    if avg_delay is not None and not pd.isna(avg_delay):
        desc += f" Atraso médio de {float(avg_delay):.0f} dias."
    if awaiting > 0:
        desc += f" {awaiting} tarefa{'s' if awaiting > 1 else ''} aguardando aprovação do cliente."

    return [Alert(
        type="delay_spike",
        severity=severity,
        client_id=cid,
        client_name=name,
        title=f"Aumento de atrasos: {name}",
        description=desc,
        metric="late_ratio",
        value=round(late, 4),
    )]


# ── SLA baixo ─────────────────────────────────────────────────────────────────

def _sla_alerts(cid, name, row) -> list[Alert]:
    sla = float(row.get("sla", 1.0) or 1.0)

    if sla > THRESHOLDS["sla_warning"]:
        return []

    severity = "critical" if sla <= THRESHOLDS["sla_critical"] else "warning"
    pct = int(sla * 100)

    return [Alert(
        type="sla_drop",
        severity=severity,
        client_id=cid,
        client_name=name,
        title=f"SLA abaixo do esperado: {name}",
        description=f"SLA atual de {pct}% — abaixo do mínimo recomendado de 80%.",
        metric="sla",
        value=round(sla, 4),
    )]


# ── Sobrecarga de demandas ────────────────────────────────────────────────────

def _overload_alerts(cid, name, row) -> list[Alert]:
    wl = float(row.get("workload_per_user", 0.0) or 0.0)

    if wl < THRESHOLDS["workload_warning"]:
        return []

    severity = "critical" if wl >= THRESHOLDS["workload_critical"] else "warning"
    growth = float(row.get("demand_growth_rate", 0.0) or 0.0)

    desc = f"Carga de {wl:.0f} demandas por usuário."
    if growth > 0.3:
        desc += f" Demandas cresceram +{int(growth*100)}% nos últimos 30 dias."

    return [Alert(
        type="overload",
        severity=severity,
        client_id=cid,
        client_name=name,
        title=f"Sobrecarga de demandas: {name}",
        description=desc,
        metric="workload_per_user",
        value=round(wl, 1),
    )]
