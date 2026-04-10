"""
employee.py — ETAPA 8: Análise por Funcionário

Calcula:
  - NPS médio por assigned_user_id (dos clientes que o usuário atende)
  - Taxa de atraso por usuário
  - Volume de demandas
  - Ranking de performance
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass


@dataclass
class EmployeeStats:
    user_id: str
    display_name: str
    total_demands: int
    late_demands: int
    late_ratio: float
    sla: float
    avg_delivery_time_days: float | None
    avg_nps_of_clients: float | None   # NPS médio dos clientes atendidos por este usuário
    client_count: int
    performance_score: float           # 0–100
    rank: int
    label: str                         # "Top performer" | "Regular" | "Needs attention"


def compute_employee_stats(
    demands: pd.DataFrame,
    nps: pd.DataFrame,
) -> list[EmployeeStats]:
    """
    Recebe demandas brutas e respostas NPS brutas.
    Retorna ranking de performance por usuário.
    """
    if demands.empty:
        return []

    d = demands.copy()
    for col in ("created_at", "delivered_at", "deadline"):
        d[col] = pd.to_datetime(d[col], errors="coerce").dt.tz_localize(None)

    nps_avg = (
        nps.groupby("client_id")["score"].mean().rename("avg_nps")
        if not nps.empty
        else pd.Series(dtype=float, name="avg_nps")
    )

    results = []
    users = d["assigned_user_id"].dropna().unique()

    for uid in sorted(users):
        ud = d[d["assigned_user_id"] == uid]
        stats = _calc_user(uid, ud, nps_avg)
        results.append(stats)

    # Ranqueia por performance_score desc
    results.sort(key=lambda s: s.performance_score, reverse=True)
    for i, s in enumerate(results):
        object.__setattr__(s, "rank", i + 1) if hasattr(s, "__dataclass_fields__") else None
        s.rank = i + 1

    return results


def _calc_user(uid: str, ud: pd.DataFrame, nps_avg: pd.Series) -> EmployeeStats:
    closed = ud[ud["status"].isin(["on_time", "late"])]
    late = ud[ud["status"] == "late"]
    on_time = ud[ud["status"] == "on_time"]

    total = len(ud)
    n_late = len(late)
    n_on_time = len(on_time)
    n_closed = len(closed)

    late_ratio = n_late / n_closed if n_closed > 0 else 0.0
    sla = n_on_time / n_closed if n_closed > 0 else 1.0

    # Tempo médio de entrega (dias)
    dm = closed["delivered_at"].notna() & closed["created_at"].notna()
    if dm.any():
        avg_delivery = float((closed.loc[dm, "delivered_at"] - closed.loc[dm, "created_at"]).dt.days.mean())
    else:
        avg_delivery = None

    # NPS médio dos clientes atendidos (ao menos parcialmente)
    client_ids = ud["client_id"].unique()
    nps_vals = nps_avg.reindex(client_ids).dropna()
    avg_client_nps = float(nps_vals.mean()) if not nps_vals.empty else None

    # Score de performance (0–100)
    score = _performance_score(sla, late_ratio, avg_client_nps)

    label = (
        "Top performer"    if score >= 80 else
        "Regular"          if score >= 55 else
        "Needs attention"
    )

    return EmployeeStats(
        user_id=uid,
        display_name=uid,
        total_demands=total,
        late_demands=n_late,
        late_ratio=round(late_ratio, 4),
        sla=round(sla, 4),
        avg_delivery_time_days=round(avg_delivery, 1) if avg_delivery is not None else None,
        avg_nps_of_clients=round(avg_client_nps, 2) if avg_client_nps is not None else None,
        client_count=len(client_ids),
        performance_score=round(score, 1),
        rank=0,
        label=label,
    )


def _performance_score(sla: float, late_ratio: float, avg_nps: float | None) -> float:
    # SLA contribui 50%
    sla_score = sla * 100

    # Late ratio penaliza — 0% = 100, 50%+ = 0
    late_score = max(0.0, 100.0 - (late_ratio / 0.50) * 100.0)

    if avg_nps is not None:
        # NPS contribui 30%: NPS 0-10 → 0-100
        nps_score = (avg_nps / 10.0) * 100
        score = sla_score * 0.40 + late_score * 0.30 + nps_score * 0.30
    else:
        score = sla_score * 0.55 + late_score * 0.45

    return float(np.clip(score, 0, 100))
