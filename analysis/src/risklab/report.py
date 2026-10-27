"""Painel autocontido: dados calculados pelo pipeline, sem serviços externos."""
import json
from pathlib import Path


def render_dashboard(result, backtests, returns, path: Path):
    data = {"summary": result, "risk": backtests.loc[backtests.date >= "2023-01-01"].to_dict("records"),
            "returns": [{"date": str(date.date()), "value": float(value)} for date, value in returns.loc["2023":"2025"].items()]}
    payload = json.dumps(data, ensure_ascii=False, allow_nan=False).replace("<", "\\u003c")
    template = Path(__file__).with_name("dashboard.html").read_text()
    path.write_text(template.replace("__EXPERIMENT_DATA__", payload))
