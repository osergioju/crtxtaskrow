"""
loader.py — carrega e normaliza dados do projeto CRTTask.

Fontes suportadas:
  - data/nps_responses.json  (respostas NPS salvas pelo servidor)
  - JSON exportado da API Taskrow (tasks)
  - DataFrames sintéticos para testes
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ── Caminhos padrão ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"


# ── NPS ───────────────────────────────────────────────────────────────────────

def load_nps(path: str | Path | None = None) -> pd.DataFrame:
    """
    Carrega respostas NPS do JSON do projeto.

    Schema de saída:
        client_id, score, created_at (datetime)
    """
    path = Path(path) if path else DATA_DIR / "nps_responses.json"

    if not path.exists():
        return pd.DataFrame(columns=["client_id", "score", "created_at"])

    with open(path, encoding="utf-8") as f:
        raw: list[dict] = json.load(f)

    if not raw:
        return pd.DataFrame(columns=["client_id", "score", "created_at"])

    rows = []
    for r in raw:
        score = r.get("answers", {}).get("q1")
        if score is None:
            continue
        rows.append(
            {
                "client_id": str(r.get("clientId", "")),
                "score": float(score),
                "created_at": pd.to_datetime(r.get("createdAt")),
            }
        )

    return pd.DataFrame(rows)


# ── Demandas ──────────────────────────────────────────────────────────────────

def load_demands(path: str | Path) -> pd.DataFrame:
    """
    Carrega demandas de um JSON exportado da API Taskrow.

    O JSON pode vir no formato da busca avançada do Taskrow:
        { taskID, taskNumber, creationDate, closeDate, dueDate,
          closed, pipelineStep, clientID, clientNickName,
          ownerUserID, clientDisplayName, jobTitle, ... }

    Schema de saída normalizado:
        demand_id, client_id, client_name, created_at, delivered_at,
        deadline, status, assigned_user_id, category
    """
    with open(path, encoding="utf-8") as f:
        raw: list[dict] = json.load(f)

    rows = []
    now = pd.Timestamp.now(tz="UTC").tz_localize(None)

    for t in raw:
        created = pd.to_datetime(t.get("creationDate") or t.get("created_at"), utc=False, errors="coerce")
        delivered = pd.to_datetime(t.get("closeDate") or t.get("delivered_at"), utc=False, errors="coerce")
        deadline = pd.to_datetime(t.get("dueDate") or t.get("deadline"), utc=False, errors="coerce")
        closed = bool(t.get("closed", False))

        # Normaliza timezone-aware → naive
        for col in (created, delivered, deadline):
            if col is not pd.NaT and hasattr(col, "tz") and col.tz is not None:
                col = col.tz_localize(None)

        # Status
        if closed:
            if pd.notna(deadline) and pd.notna(delivered) and delivered > deadline:
                status = "late"
            else:
                status = "on_time"
        else:
            if pd.notna(deadline) and deadline < now:
                status = "late"
            else:
                status = "in_progress"

        rows.append(
            {
                "demand_id": str(t.get("taskID") or t.get("demand_id", "")),
                "client_id": str(t.get("clientID") or t.get("client_id", "")),
                "client_name": t.get("clientDisplayName") or t.get("client_name", ""),
                "created_at": created,
                "delivered_at": delivered if closed else pd.NaT,
                "deadline": deadline,
                "status": status,
                "assigned_user_id": str(t.get("ownerUserID") or t.get("assigned_user_id", "")),
                "category": t.get("pipelineStep") or t.get("category") or "",
            }
        )

    df = pd.DataFrame(rows)
    for col in ("created_at", "delivered_at", "deadline"):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


# ── Dados sintéticos para teste ───────────────────────────────────────────────

def generate_synthetic_data(
    n_clients: int = 15,
    n_demands_per_client: int = 60,
    n_nps_per_client: int = 6,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Gera dados sintéticos realistas para desenvolvimento/teste.
    Simula diferentes perfis de clientes (saudável, atenção, risco).
    """
    rng = np.random.default_rng(seed)
    now = datetime.now()

    client_profiles = []
    for i in range(n_clients):
        risk = rng.choice(["healthy", "warning", "critical"], p=[0.5, 0.3, 0.2])
        late_rate = {"healthy": 0.08, "warning": 0.22, "critical": 0.45}[risk]
        base_nps = {"healthy": 8.5, "warning": 6.5, "critical": 4.0}[risk]
        client_profiles.append(
            {
                "client_id": f"client_{i+1:03d}",
                "client_name": f"Empresa {i+1}",
                "late_rate": late_rate + rng.normal(0, 0.05),
                "base_nps": base_nps + rng.normal(0, 0.5),
                "trend": rng.choice([-0.3, 0.0, 0.3], p=[0.3, 0.4, 0.3]),
            }
        )

    demand_rows = []
    for cp in client_profiles:
        users = [f"user_{j}" for j in rng.integers(1, 8, size=3)]
        for k in range(n_demands_per_client):
            created = now - timedelta(days=int(rng.integers(1, 180)))
            avg_delivery = 5 + rng.exponential(3)
            is_late = rng.random() < max(0.0, min(1.0, cp["late_rate"]))
            deadline = created + timedelta(days=avg_delivery * (0.8 if is_late else 1.2))
            delivered = created + timedelta(days=avg_delivery * rng.uniform(0.7, 1.5))
            closed = rng.random() > 0.15

            demand_rows.append(
                {
                    "demand_id": f"d_{cp['client_id']}_{k}",
                    "client_id": cp["client_id"],
                    "client_name": cp["client_name"],
                    "created_at": created,
                    "delivered_at": delivered if closed else pd.NaT,
                    "deadline": deadline,
                    "status": ("late" if is_late else "on_time") if closed else "in_progress",
                    "assigned_user_id": rng.choice(users),
                    "category": rng.choice(["Design", "Copy", "Social", "Video", "Mídia"]),
                }
            )

    nps_rows = []
    for cp in client_profiles:
        for k in range(n_nps_per_client):
            days_ago = int(rng.integers(1, 365))
            trend_boost = cp["trend"] * (n_nps_per_client - k) / n_nps_per_client
            score = cp["base_nps"] + trend_boost + rng.normal(0, 0.8)
            score = float(np.clip(score, 0, 10))
            nps_rows.append(
                {
                    "client_id": cp["client_id"],
                    "score": round(score, 1),
                    "created_at": now - timedelta(days=days_ago),
                }
            )

    demands_df = pd.DataFrame(demand_rows)
    nps_df = pd.DataFrame(nps_rows)

    for col in ("created_at", "delivered_at", "deadline"):
        demands_df[col] = pd.to_datetime(demands_df[col])
    nps_df["created_at"] = pd.to_datetime(nps_df["created_at"])

    return demands_df, nps_df
