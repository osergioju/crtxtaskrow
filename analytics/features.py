"""
features.py — ETAPA 1: Feature Engineering

Calcula métricas operacionais por cliente, usadas como features
para correlações, health score e previsão de NPS.
"""

from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta


# ── Helpers internos ──────────────────────────────────────────────────────────

def _safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    return numerator / denominator if denominator > 0 else default


def _days(td) -> float | None:
    """Converte timedelta/NaT para float de dias."""
    if pd.isna(td):
        return None
    return td.total_seconds() / 86_400


# ── Features por cliente ──────────────────────────────────────────────────────

def compute_client_features(
    demands: pd.DataFrame,
    nps: pd.DataFrame,
    reference_date: datetime | None = None,
) -> pd.DataFrame:
    """
    Computa a matriz de features por cliente.

    Parâmetros
    ----------
    demands : DataFrame com colunas:
        demand_id, client_id, created_at, delivered_at, deadline, status,
        assigned_user_id, category
    nps : DataFrame com colunas:
        client_id, score, created_at
    reference_date : data de referência (default = hoje)

    Retorna
    -------
    DataFrame indexado por client_id com todas as features.
    """
    ref = pd.Timestamp(reference_date or datetime.now())
    cutoff_30 = ref - timedelta(days=30)
    cutoff_60 = cutoff_30 - timedelta(days=30)

    demands = demands.copy()
    nps = nps.copy()

    # Garante datetime sem timezone
    for col in ("created_at", "delivered_at", "deadline"):
        demands[col] = pd.to_datetime(demands[col], errors="coerce").dt.tz_localize(None)
    nps["created_at"] = pd.to_datetime(nps["created_at"], errors="coerce").dt.tz_localize(None)

    all_clients = set(demands["client_id"].unique()) | set(nps["client_id"].unique())
    records: list[dict] = []

    for cid in sorted(all_clients):
        d = demands[demands["client_id"] == cid]
        n = nps[nps["client_id"] == cid].sort_values("created_at")

        feat = _demand_features(d, cutoff_30, cutoff_60, ref)
        nps_feat = _nps_features(n, cutoff_30, ref)

        feat.update(nps_feat)
        feat["client_id"] = cid
        feat["client_name"] = (
            d["client_name"].iloc[0] if "client_name" in d.columns and len(d) > 0 else cid
        )
        records.append(feat)

    df = pd.DataFrame(records).set_index("client_id")
    return df


def _demand_features(d: pd.DataFrame, cutoff_30: pd.Timestamp, cutoff_60: pd.Timestamp, ref: pd.Timestamp) -> dict:
    if d.empty:
        return {
            "total_demands": 0,
            "demands_last_30d": 0,
            "demands_prev_30d": 0,
            "demand_growth_rate": 0.0,
            "late_demands": 0,
            "late_ratio": 0.0,
            "sla": 1.0,
            "avg_delivery_time_days": None,
            "avg_delay_days": None,
            "workload_per_user": 0.0,
            "category_top": None,
        }

    closed = d[d["status"].isin(["on_time", "late"])]
    last_30 = d[d["created_at"] >= cutoff_30]
    prev_30 = d[(d["created_at"] >= cutoff_60) & (d["created_at"] < cutoff_30)]

    late_demands = d[d["status"] == "late"]

    # Tempo de entrega (só demandas fechadas com ambas as datas)
    delivery_mask = closed["delivered_at"].notna() & closed["created_at"].notna()
    if delivery_mask.any():
        delivery_times = (closed.loc[delivery_mask, "delivered_at"] - closed.loc[delivery_mask, "created_at"]).dt.days
        avg_delivery = float(delivery_times.mean())
    else:
        avg_delivery = None

    # Atraso médio (demandas atrasadas com deadline)
    late_with_deadline = late_demands[late_demands["deadline"].notna() & late_demands["delivered_at"].notna()]
    if not late_with_deadline.empty:
        delays = (late_with_deadline["delivered_at"] - late_with_deadline["deadline"]).dt.days
        avg_delay = float(delays.clip(lower=0).mean())
    else:
        avg_delay = None

    # Crescimento de demandas
    cnt_last = len(last_30)
    cnt_prev = len(prev_30)
    growth = _safe_ratio(cnt_last - cnt_prev, cnt_prev, default=0.0)

    # Carga por usuário
    n_users = d["assigned_user_id"].nunique()
    workload = _safe_ratio(len(d), n_users)

    # Categoria dominante
    if "category" in d.columns:
        cat_counts = d["category"].value_counts()
        top_cat = cat_counts.index[0] if not cat_counts.empty else None
    else:
        top_cat = None

    return {
        "total_demands": len(d),
        "demands_last_30d": cnt_last,
        "demands_prev_30d": cnt_prev,
        "demand_growth_rate": round(growth, 4),
        "late_demands": len(late_demands),
        "late_ratio": round(_safe_ratio(len(late_demands), len(d)), 4),
        "sla": round(_safe_ratio(len(d[d["status"] == "on_time"]), max(1, len(d[d["status"].isin(["on_time", "late"])]))), 4),
        "avg_delivery_time_days": round(avg_delivery, 2) if avg_delivery is not None else None,
        "avg_delay_days": round(avg_delay, 2) if avg_delay is not None else None,
        "workload_per_user": round(workload, 2),
        "category_top": top_cat,
    }


def _nps_features(n: pd.DataFrame, cutoff_30: pd.Timestamp, ref: pd.Timestamp) -> dict:
    if n.empty:
        return {
            "avg_nps": None,
            "last_nps": None,
            "nps_count": 0,
            "nps_last_30d": None,
            "nps_prev_30d": None,
            "nps_trend": None,
        }

    last_30 = n[n["created_at"] >= cutoff_30]
    prev_30 = n[(n["created_at"] >= cutoff_30 - timedelta(days=30)) & (n["created_at"] < cutoff_30)]

    avg_last = float(last_30["score"].mean()) if not last_30.empty else None
    avg_prev = float(prev_30["score"].mean()) if not prev_30.empty else None

    if avg_last is not None and avg_prev is not None:
        trend = round(avg_last - avg_prev, 3)
    else:
        trend = None

    return {
        "avg_nps": round(float(n["score"].mean()), 3),
        "last_nps": float(n["score"].iloc[-1]),
        "nps_count": len(n),
        "nps_last_30d": round(avg_last, 3) if avg_last is not None else None,
        "nps_prev_30d": round(avg_prev, 3) if avg_prev is not None else None,
        "nps_trend": trend,
    }


# ── Métricas temporais (por semana/mês) ───────────────────────────────────────

def compute_temporal_features(
    demands: pd.DataFrame,
    period: str = "ME",
) -> pd.DataFrame:
    """
    Agrega métricas por cliente e por período (semana 'W' ou mês 'ME').

    Retorna DataFrame com MultiIndex (client_id, period).
    """
    d = demands.copy()
    d["created_at"] = pd.to_datetime(d["created_at"], errors="coerce").dt.tz_localize(None)
    d["period"] = d["created_at"].dt.to_period(period)

    rows = []
    for (cid, period_val), grp in d.groupby(["client_id", "period"]):
        closed = grp[grp["status"].isin(["on_time", "late"])]
        on_time = grp[grp["status"] == "on_time"]
        late = grp[grp["status"] == "late"]

        rows.append(
            {
                "client_id": cid,
                "period": str(period_val),
                "total": len(grp),
                "on_time": len(on_time),
                "late": len(late),
                "in_progress": len(grp[grp["status"] == "in_progress"]),
                "late_ratio": round(_safe_ratio(len(late), len(closed)), 4),
                "sla": round(_safe_ratio(len(on_time), max(1, len(closed))), 4),
            }
        )

    return pd.DataFrame(rows).set_index(["client_id", "period"])
