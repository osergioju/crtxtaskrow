"""
main.py — ETAPA 9: Orquestrador + Saída Final

Executa todo o pipeline e devolve um dict/JSON estruturado com:
  - clients   : métricas, health score e previsão por cliente
  - alerts    : alertas priorizados
  - insights  : insights em linguagem natural
  - rankings  : clientes e funcionários
  - chart_suggestions : sugestões de gráficos

Uso rápido:
    from analytics.main import run_analytics
    result = run_analytics(demands_df, nps_df)
    import json; print(json.dumps(result, ensure_ascii=False, indent=2))

Ou pela CLI:
    python -m analytics.main --demands data/tasks.json [--nps data/nps_responses.json]
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from analytics.features import compute_client_features
from analytics.correlations import compute_correlations, CorrelationReport
from analytics.health_score import compute_health_scores
from analytics.prediction import compute_predictions
from analytics.insights import generate_insights
from analytics.alerts import generate_alerts
from analytics.employee import compute_employee_stats
from analytics.loader import load_demands, load_nps, generate_synthetic_data


# ── Pipeline principal ────────────────────────────────────────────────────────

def run_analytics(
    demands: pd.DataFrame,
    nps: pd.DataFrame,
    reference_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Executa o pipeline completo e retorna um dict JSON-serializável.

    Parâmetros
    ----------
    demands : DataFrame normalizado (saída de loader.load_demands ou equivalente)
    nps     : DataFrame normalizado (saída de loader.load_nps ou equivalente)
    reference_date : data de referência para calcular janelas temporais
    """

    # ── ETAPA 1: Feature Engineering ─────────────────────────────────────────
    features = compute_client_features(demands, nps, reference_date)

    # ── ETAPA 2: Correlações ──────────────────────────────────────────────────
    corr_report: CorrelationReport = compute_correlations(features)

    # ── ETAPA 3: Insights ─────────────────────────────────────────────────────
    insights = generate_insights(features, corr_report)

    # ── ETAPA 4: Health Scores ────────────────────────────────────────────────
    health_scores = compute_health_scores(features)
    health_map = {h.client_id: h for h in health_scores}

    # ── ETAPA 5+6: Previsões de NPS ───────────────────────────────────────────
    predictions = compute_predictions(features, nps)
    pred_map = {p.client_id: p for p in predictions}

    # ── ETAPA 7: Alertas ──────────────────────────────────────────────────────
    alerts = generate_alerts(features, predictions)

    # ── ETAPA 8: Análise por funcionário ──────────────────────────────────────
    employee_stats = compute_employee_stats(demands, nps)

    # ── ETAPA 9: Montar saída estruturada ─────────────────────────────────────
    clients_out = _build_clients(features, health_map, pred_map)
    alerts_out = [_alert_to_dict(a) for a in alerts]
    insights_out = [_insight_to_dict(i) for i in insights]
    rankings_out = _build_rankings(health_scores, predictions, employee_stats)
    chart_suggestions = _build_chart_suggestions(features, corr_report)
    correlations_out = _build_correlations(corr_report)

    return {
        "generated_at": datetime.now().isoformat(),
        "summary": _build_summary(clients_out, alerts_out, predictions),
        "clients": clients_out,
        "alerts": alerts_out,
        "insights": insights_out,
        "correlations": correlations_out,
        "rankings": rankings_out,
        "chart_suggestions": chart_suggestions,
    }


# ── Builders de seção ─────────────────────────────────────────────────────────

def _build_clients(features, health_map, pred_map) -> list[dict]:
    rows = []
    for cid, feat in features.iterrows():
        cid = str(cid)
        h = health_map.get(cid)
        p = pred_map.get(cid)

        row: dict[str, Any] = {
            "client_id": cid,
            "client_name": str(feat.get("client_name", cid)),
            # ── Métricas operacionais
            "total_demands":          _safe(feat.get("total_demands")),
            "demands_last_30d":       _safe(feat.get("demands_last_30d")),
            "demands_prev_30d":       _safe(feat.get("demands_prev_30d")),
            "demand_growth_rate":     _safe(feat.get("demand_growth_rate")),
            "late_demands":           _safe(feat.get("late_demands")),
            "late_ratio":             _safe(feat.get("late_ratio")),
            "awaiting_approval":      _safe(feat.get("awaiting_approval")),
            "sla":                    _safe(feat.get("sla")),
            "avg_delivery_time_days": _safe(feat.get("avg_delivery_time_days")),
            "avg_delay_days":         _safe(feat.get("avg_delay_days")),
            "workload_per_user":      _safe(feat.get("workload_per_user")),
            "category_top":           feat.get("category_top"),
            # ── NPS histórico
            "avg_nps":        _safe(feat.get("avg_nps")),
            "last_nps":       _safe(feat.get("last_nps")),
            "nps_count":      _safe(feat.get("nps_count")),
            "nps_last_30d":   _safe(feat.get("nps_last_30d")),
            "nps_prev_30d":   _safe(feat.get("nps_prev_30d")),
            "nps_trend":      _safe(feat.get("nps_trend")),
            # ── Health Score
            "health": {
                "score":          h.score if h else None,
                "classification": h.classification if h else None,
                "label":          h.label if h else None,
                "color":          h.color if h else None,
                "components":     h.components if h else {},
                "explanation":    h.explanation if h else None,
            },
            # ── Previsão de NPS
            "prediction": {
                "next_nps":          p.next_nps_prediction if p else None,
                "trend":             p.trend if p else None,
                "trend_label":       p.trend_label if p else None,
                "prob_detractor":    p.prob_detractor if p else None,
                "prob_promoter":     p.prob_promoter if p else None,
                "days_to_drop":      p.days_to_drop if p else None,
                "explanation":       p.explanation if p else None,
                "confidence":        p.confidence if p else None,
                "method":            p.method_used if p else None,
                "feature_importances": p.feature_importances if p else {},
            },
        }
        rows.append(row)

    # Ordena por health score asc (piores primeiro) para facilitar triagem
    rows.sort(key=lambda r: (r["health"]["score"] or 100))
    return rows


def _build_correlations(report: CorrelationReport) -> dict:
    return {
        "top_features": report.top_features,
        "critical_thresholds": report.critical_thresholds,
        "details": [
            {
                "feature":      c.feature,
                "label":        c.label,
                "pearson_r":    c.pearson_r,
                "spearman_r":   c.spearman_r,
                "significant":  c.significant,
                "strength":     c.strength,
                "direction":    c.direction,
                "n_samples":    c.n_samples,
            }
            for c in report.correlations
        ],
    }


def _build_rankings(health_scores, predictions, employee_stats) -> dict:
    clients_by_health = [
        {
            "rank":           i + 1,
            "client_id":      h.client_id,
            "client_name":    h.client_name,
            "health_score":   h.score,
            "classification": h.classification,
            "label":          h.label,
        }
        for i, h in enumerate(sorted(health_scores, key=lambda h: h.score, reverse=True))
    ]

    clients_by_detractor_risk = [
        {
            "rank":           i + 1,
            "client_id":      p.client_id,
            "client_name":    p.client_name,
            "prob_detractor": p.prob_detractor,
            "next_nps":       p.next_nps_prediction,
            "trend":          p.trend,
        }
        for i, p in enumerate(
            sorted(predictions, key=lambda p: p.prob_detractor, reverse=True)[:10]
        )
    ]

    employees = [
        {
            "rank":                 e.rank,
            "user_id":              e.user_id,
            "display_name":         e.display_name,
            "performance_score":    e.performance_score,
            "label":                e.label,
            "total_demands":        e.total_demands,
            "late_ratio":           e.late_ratio,
            "sla":                  e.sla,
            "avg_nps_of_clients":   e.avg_nps_of_clients,
            "client_count":         e.client_count,
            "avg_delivery_time_days": e.avg_delivery_time_days,
        }
        for e in employee_stats
    ]

    return {
        "clients_by_health":         clients_by_health,
        "clients_by_detractor_risk": clients_by_detractor_risk,
        "employees":                 employees,
    }


def _build_summary(clients_out, alerts_out, predictions) -> dict:
    total = len(clients_out)
    healthy = sum(1 for c in clients_out if (c["health"]["classification"] or "") == "healthy")
    warning = sum(1 for c in clients_out if (c["health"]["classification"] or "") == "warning")
    critical = sum(1 for c in clients_out if (c["health"]["classification"] or "") == "critical")

    high_risk = sum(1 for p in predictions if p.prob_detractor >= 0.6)
    critical_alerts = sum(1 for a in alerts_out if a["severity"] == "critical")

    avg_nps_vals = [
        c["avg_nps"] for c in clients_out if c["avg_nps"] is not None
    ]
    overall_avg_nps = round(sum(avg_nps_vals) / len(avg_nps_vals), 2) if avg_nps_vals else None

    return {
        "total_clients":     total,
        "healthy":           healthy,
        "warning":           warning,
        "critical":          critical,
        "high_detractor_risk": high_risk,
        "critical_alerts":   critical_alerts,
        "overall_avg_nps":   overall_avg_nps,
    }


def _build_chart_suggestions(features: pd.DataFrame, report: CorrelationReport) -> list[dict]:
    suggestions = [
        {
            "id":    "nps_vs_late_ratio",
            "type":  "scatter",
            "title": "NPS vs Taxa de Atraso",
            "x":     "late_ratio",
            "y":     "avg_nps",
            "description": "Identifica correlação entre atrasos e satisfação do cliente.",
        },
        {
            "id":    "nps_timeline",
            "type":  "line",
            "title": "Evolução do NPS por Cliente (temporal)",
            "x":     "created_at",
            "y":     "score",
            "group": "client_id",
            "description": "Permite detectar tendências e sazonalidade no NPS.",
        },
        {
            "id":    "health_score_ranking",
            "type":  "bar",
            "title": "Ranking de Saúde dos Clientes",
            "x":     "client_name",
            "y":     "health_score",
            "color": "classification",
            "description": "Visão geral do status de cada cliente (saudável/atenção/risco).",
        },
        {
            "id":    "employee_ranking",
            "type":  "bar",
            "title": "Ranking de Performance dos Colaboradores",
            "x":     "display_name",
            "y":     "performance_score",
            "color": "label",
            "description": "Performance operacional por colaborador baseada em SLA e atrasos.",
        },
        {
            "id":    "nps_vs_sla",
            "type":  "scatter",
            "title": "NPS vs SLA",
            "x":     "sla",
            "y":     "avg_nps",
            "description": "Mostra o impacto direto do SLA na satisfação.",
        },
        {
            "id":    "detractor_risk_heatmap",
            "type":  "bar",
            "title": "Risco de Detrator por Cliente",
            "x":     "client_name",
            "y":     "prob_detractor",
            "description": "Prioriza clientes que precisam de atenção imediata.",
        },
    ]

    # Adiciona sugestão para a feature com maior correlação
    if report.top_features:
        top = report.top_features[0]
        from analytics.correlations import FEATURE_LABELS
        label = FEATURE_LABELS.get(top, top)
        suggestions.append({
            "id":    f"nps_vs_{top}",
            "type":  "scatter",
            "title": f"NPS vs {label} (maior correlação detectada)",
            "x":     top,
            "y":     "avg_nps",
            "description": f"Esta é a feature com maior correlação com NPS neste conjunto de dados.",
        })

    return suggestions


# ── Utils ─────────────────────────────────────────────────────────────────────

def _safe(val) -> Any:
    """Converte NaN/NaT para None para compatibilidade JSON."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, (int, float)):
        return val
    return val


def _sanitize(obj: Any) -> Any:
    """Percorre recursivamente e substitui NaN/Infinity por None (JSON não suporta)."""
    import math
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


def _alert_to_dict(a) -> dict:
    return {
        "type":        a.type,
        "severity":    a.severity,
        "client_id":   a.client_id,
        "client_name": a.client_name,
        "title":       a.title,
        "description": a.description,
        "metric":      a.metric,
        "value":       a.value,
    }


def _insight_to_dict(i) -> dict:
    return {
        "category": i.category,
        "severity": i.severity,
        "text":     i.text,
        "metric":   i.metric,
        "value":    i.value,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def _cli():
    import argparse

    parser = argparse.ArgumentParser(description="Analytics pipeline CRTTask")
    parser.add_argument("--demands", type=str, help="Caminho para JSON de demandas (Taskrow export)")
    parser.add_argument("--nps",     type=str, default=None, help="Caminho para JSON de respostas NPS")
    parser.add_argument("--out",     type=str, default=None, help="Salvar resultado em arquivo JSON")
    parser.add_argument("--synthetic", action="store_true", help="Usar dados sintéticos para teste")
    args = parser.parse_args()

    if args.synthetic or not args.demands:
        print("[analytics] Usando dados sintéticos para demonstração...", file=sys.stderr)
        demands, nps = generate_synthetic_data()
    else:
        demands = load_demands(args.demands)
        nps_path = args.nps
        nps = load_nps(nps_path)

    print(f"[analytics] Demandas: {len(demands)} | NPS responses: {len(nps)}", file=sys.stderr)
    result = run_analytics(demands, nps)

    output = json.dumps(_sanitize(result), ensure_ascii=False, indent=2, default=str)

    if args.out:
        Path(args.out).write_text(output, encoding="utf-8")
        print(f"[analytics] Resultado salvo em: {args.out}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    _cli()
