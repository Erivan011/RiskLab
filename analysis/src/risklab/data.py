"""Coleta oficial, qualidade e persistência. Nenhum preenchimento de preços."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlencode
from urllib.request import urlopen
import numpy as np
import pandas as pd

SERIES = {"USD_BRL": 1, "EUR_BRL": 21619, "GBP_BRL": 21623}


def download(directory: Path, start="01/01/2016", end="31/12/2025"):
    directory.mkdir(parents=True, exist_ok=True)
    for symbol, code in SERIES.items():
        path = directory / f"{symbol.lower()}.json"
        if path.exists():
            continue
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados?" + urlencode(
            {"formato": "json", "dataInicial": start, "dataFinal": end})
        with urlopen(url, timeout=60) as response:
            payload = response.read()
        parse_series(payload)  # Validate before committing a cached download.
        path.write_bytes(payload)


def parse_series(payload: bytes) -> pd.Series:
    rows = json.loads(payload)
    if not isinstance(rows, list) or not rows:
        raise ValueError("Resposta BCB vazia ou inválida.")
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["data"], format="%d/%m/%Y", errors="raise")
    frame["price"] = pd.to_numeric(frame["valor"], errors="raise")
    if frame["date"].duplicated().any():
        raise ValueError("Datas duplicadas na série oficial.")
    if not np.isfinite(frame["price"]).all() or frame["price"].le(0).any():
        raise ValueError("Cotações devem ser positivas e finitas.")
    return frame.set_index("date")["price"].sort_index()


def load_prices(directory: Path):
    series, sources = {}, {}
    for symbol, code in SERIES.items():
        payload = (directory / f"{symbol.lower()}.json").read_bytes()
        series[symbol] = parse_series(payload)
        sources[symbol] = {"sgs_code": code, "rows": len(series[symbol]),
                           "sha256": hashlib.sha256(payload).hexdigest()}
    joined = pd.concat(series, axis=1)
    prices = joined.dropna()
    if len(prices) < 1000:
        raise ValueError("A amostra precisa de pelo menos 1.000 datas comuns.")
    audit = {"provider": "Banco Central do Brasil / SGS", "license": "ODbL (base de dados BCB)",
             "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
             "sources": sources, "union_rows": len(joined), "common_rows": len(prices),
             "excluded_noncommon_dates": int(joined.isna().any(axis=1).sum()),
             "first_date": str(prices.index.min().date()), "last_date": str(prices.index.max().date())}
    return prices, audit


def portfolio_returns(prices: pd.DataFrame, weights: list[float]) -> pd.Series:
    weights = np.asarray(weights, dtype=float)
    if len(weights) != len(prices.columns) or not np.isfinite(weights).all() or (weights < 0).any() or not np.isclose(weights.sum(), 1):
        raise ValueError("Pesos não negativos devem corresponder às moedas e somar 1.")
    # pct_change without forward filling; common dates define observation intervals.
    returns = prices.pct_change(fill_method=None).dropna().dot(weights)
    return returns.rename("return")


def warehouse(path, prices, returns, backtests):
    with sqlite3.connect(path) as connection:
        prices.rename_axis("date").reset_index().melt(id_vars="date", var_name="symbol", value_name="price_brl").to_sql(
            "prices", connection, index=False, if_exists="replace")
        returns.rename_axis("date").reset_index().to_sql("portfolio_returns", connection, index=False, if_exists="replace")
        backtests.to_sql("risk_backtests", connection, index=False, if_exists="replace")
        connection.execute("CREATE INDEX IF NOT EXISTS prices_symbol_date ON prices(symbol, date)")
