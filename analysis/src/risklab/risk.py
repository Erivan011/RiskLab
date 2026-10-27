"""Perdas positivas, VaR de um intervalo e testes de cobertura."""
import numpy as np
import pandas as pd
from scipy.special import xlogy
from scipy.stats import chi2, norm


def risk_forecasts(returns: pd.Series, confidence=.99, window=252, decay=.94):
    if not .5 < confidence < 1 or window < 20 or not 0 < decay < 1:
        raise ValueError("Configuração de risco inválida.")
    if not np.isfinite(returns).all() or returns.le(-1).any():
        raise ValueError("Retornos inválidos.")
    rows = []
    for i in range(window, len(returns)):
        past = returns.iloc[i - window:i].to_numpy()
        losses = -past
        historical_var = float(np.quantile(losses, confidence))
        historical_es = float(losses[losses >= historical_var].mean())
        mu, sigma = float(past.mean()), float(past.std(ddof=1))
        weights = decay ** np.arange(window - 1, -1, -1)
        ewma_sigma = float(np.sqrt(np.average(past ** 2, weights=weights)))
        z = norm.ppf(confidence)
        estimators = {"historical": (historical_var, historical_es),
                      "gaussian": (-mu + z * sigma, -mu + sigma * norm.pdf(z) / (1 - confidence)),
                      "ewma": (z * ewma_sigma, ewma_sigma * norm.pdf(z) / (1 - confidence))}
        for model, (var, es) in estimators.items():
            loss = -float(returns.iloc[i])
            rows.append({"date": str(returns.index[i].date()), "model": model, "loss": loss,
                         "var": var, "es": es, "breach": bool(loss > var),
                         "confidence": confidence, "training_end": str(returns.index[i - 1].date())})
    return pd.DataFrame(rows)


def bernoulli_log_likelihood(successes, count, probability):
    return float(xlogy(successes, probability) + xlogy(count - successes, 1 - probability))


def coverage_tests(breaches, expected_rate=.01):
    flags = np.asarray(breaches, dtype=int)
    n, x = len(flags), int(flags.sum())
    if n < 2:
        raise ValueError("Amostra insuficiente para testes de cobertura.")
    lr_uc = max(0., -2 * (bernoulli_log_likelihood(x, n, expected_rate) - bernoulli_log_likelihood(x, n, x / n)))
    counts = np.zeros((2, 2), dtype=int)
    for previous, current in zip(flags[:-1], flags[1:]):
        counts[previous, current] += 1
    common_p = counts[:, 1].sum() / counts.sum()
    ll_independent = bernoulli_log_likelihood(counts[:, 1].sum(), counts.sum(), common_p)
    ll_markov = sum(bernoulli_log_likelihood(row[1], row.sum(), row[1] / row.sum())
                    for row in counts if row.sum())
    lr_ind = max(0., -2 * (ll_independent - ll_markov))
    # A transition test with no observed transitions from one state is not informative.
    identifiable = bool((counts.sum(axis=1) > 0).all())
    return {"observations": n, "breaches": x, "breach_rate": x / n,
            "expected_breaches": n * expected_rate, "kupiec_pvalue": float(chi2.sf(lr_uc, 1)),
            "independence_pvalue": float(chi2.sf(lr_ind, 1)) if identifiable else None,
            "conditional_coverage_pvalue": float(chi2.sf(lr_uc + lr_ind, 2)) if identifiable else None}


def summarize_backtests(backtests, start, end):
    period = backtests.loc[backtests.date.between(start, end)]
    rows = []
    for model, group in period.groupby("model"):
        stats = coverage_tests(group.breach, 1 - float(group.confidence.iloc[0]))
        error = group.loss - group["var"]
        # Quantile loss rewards both calibration and sharpness, unlike breach count alone.
        pinball = np.where(error >= 0, group.confidence * error, (group.confidence - 1) * error)
        rows.append({"model": model, **stats, "quantile_loss": float(pinball.mean()),
                     "mean_var": float(group["var"].mean()), "mean_es": float(group.es.mean())})
    return rows


def historical_summary(returns):
    wealth = pd.concat([pd.Series([1.]), (1 + returns).cumprod().reset_index(drop=True)], ignore_index=True)
    drawdown = wealth / wealth.cummax() - 1
    return {"annualized_volatility": float(returns.std(ddof=1) * np.sqrt(252)),
            "max_drawdown": float(drawdown.min()), "cumulative_return": float(wealth.iloc[-1] - 1),
            "worst_interval": float(returns.min()), "best_interval": float(returns.max())}


def block_bootstrap(returns, horizon=10, simulations=5000, block=5, confidence=.99, seed=42):
    history = np.asarray(returns, dtype=float)
    if horizon < 1 or simulations < 100 or block < 1 or len(history) < block:
        raise ValueError("Parâmetros de simulação inválidos.")
    rng = np.random.default_rng(seed)
    paths = np.empty((simulations, horizon))
    for offset in range(0, horizon, block):
        length = min(block, horizon - offset)
        starts = rng.integers(0, len(history) - length + 1, size=simulations)
        paths[:, offset:offset + length] = history[starts[:, None] + np.arange(length)]
    losses = 1 - np.prod(1 + paths, axis=1)
    var = float(np.quantile(losses, confidence))
    return {"horizon_observations": horizon, "simulations": simulations, "block": block,
            "confidence": confidence, "var": var, "es": float(losses[losses >= var].mean()),
            "seed": seed}
