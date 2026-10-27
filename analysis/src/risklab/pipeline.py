"""Executa o experimento e exporta resultados auditáveis e um painel offline."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import numpy as np
import pandas as pd
import scipy
import sklearn
from .data import download, load_prices, portfolio_returns, warehouse
from .risk import risk_forecasts, summarize_backtests, historical_summary, block_bootstrap
from .volatility import walk_forward, scores
from .report import render_dashboard


def run(root: Path, fetch=False):
    raw = root / "data" / "raw"
    if fetch:
        download(raw)
    prices, audit = load_prices(raw)
    weights = [.5, .3, .2]
    returns = portfolio_returns(prices, weights)
    if prices.index.min() > pd.Timestamp("2016-01-10") or prices.index.max() < pd.Timestamp("2025-12-20"):
        raise ValueError("O experimento exige o recorte 2016–2025 completo.")
    backtests = risk_forecasts(returns)
    validation_risk = summarize_backtests(backtests, "2021-01-01", "2022-12-31")
    test_risk = summarize_backtests(backtests, "2023-01-01", "2025-12-31")
    volatility = walk_forward(returns)
    validation_vol = scores(volatility.loc["2021":"2022"])
    test_vol = scores(volatility.loc["2023":"2025"])
    champion = min(validation_vol, key=lambda row: row["qlike"])["model"]
    test_returns = returns.loc["2023":"2025"]
    asset_returns = prices.pct_change(fill_method=None).dropna()
    worst = test_returns.nsmallest(5)
    result = {
        "project": "RiskLab", "version": "0.1.0", "created_utc": datetime.now(timezone.utc).isoformat(),
        "data_quality": audit,
        "experiment": {"weights": dict(zip(prices.columns, weights)), "notional_brl": 1_000_000,
                       "confidence": .99, "risk_window": 252, "ewma_decay": .94,
                       "validation": ["2021-01-01", "2022-12-31"], "test": ["2023-01-01", "2025-12-31"],
                       "refit": "trimestral, apenas observações anteriores ao início do trimestre",
                       "seed": 42},
        "historical_full_sample": historical_summary(returns),
        "historical_test": historical_summary(test_returns),
        "risk_validation": validation_risk, "risk_test": test_risk,
        "volatility_validation": validation_vol, "volatility_test": test_vol,
        "volatility_champion": champion,
        "bootstrap": block_bootstrap(returns.tail(252)),
        "stress_days": [{"date": str(date.date()), "portfolio_return": float(value),
                         "currency_returns": {key: float(val) for key, val in asset_returns.loc[date].items()}}
                        for date, value in worst.items()],
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
                        "scipy": scipy.__version__, "scikit_learn": sklearn.__version__},
        "limitations": [
            "Exposição sintética comprada em moedas, rebalanceada diariamente com pesos fixos; não é uma carteira real.",
            "PTAX é referência, não preço executável; juros, carry, spreads, tributos e custos não entram na simulação.",
            "Retornos entre datas comuns podem atravessar feriados; 252 observações é uma convenção anual.",
            "Variância diária é aproximada pelo retorno ao quadrado; não há volatilidade realizada intradiária.",
            "Séries baixadas hoje podem conter revisões históricas; o teste não é uma simulação point-in-time de publicação.",
            "VaR não é limite máximo de perda. ES estima a cauda; p-valor alto não prova que o modelo é correto.",
            "Bootstrap usa apenas as últimas 252 observações e não cria eventos de crise ausentes da amostra."
        ]}
    report_dir = root / "reports"
    report_dir.mkdir(exist_ok=True)
    backtests.to_csv(report_dir / "risk_backtests.csv", index=False)
    volatility.rename_axis("date").to_csv(report_dir / "volatility_walk_forward.csv")
    (report_dir / "experiment.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    warehouse(root / "data" / "warehouse.sqlite", prices, returns, backtests)
    render_dashboard(result, backtests, returns, report_dir / "dashboard.html")
    # The manifest identifies the exact experiment outputs independently of display formatting.
    manifest = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                for path in sorted(report_dir.iterdir()) if path.suffix in {".json", ".csv", ".html"} and path.name != "manifest.json"}
    (report_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--download", action="store_true", help="Baixar os dados oficiais ausentes (sem chave).")
    parser.add_argument("--workspace-output", type=Path, help="Atualizar o dataset JSON do aplicativo interativo.")
    args = parser.parse_args()
    result = run(args.root.resolve(), args.download)
    if args.workspace_output:
        prices, _ = load_prices(args.root.resolve() / "data" / "raw")
        asset_returns = prices.pct_change(fill_method=None).dropna()
        payload = {"summary": result, "assets": [
            {"date": str(date.date()), "values": list(map(float, row))}
            for date, row in zip(asset_returns.index, asset_returns.to_numpy())]}
        args.workspace_output.parent.mkdir(parents=True, exist_ok=True)
        args.workspace_output.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")))
    print(json.dumps({"common_dates": result["data_quality"]["common_rows"],
                      "selected_volatility_model": result["volatility_champion"],
                      "risk_test": result["risk_test"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
