"""Walk-forward trimestral; modelo escolhido na validação, teste preservado."""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

FEATURES = ["squared_lag_1", "variance_5", "variance_20", "variance_60", "abs_mean_20", "ewma"]


def design(returns: pd.Series):
    past = returns.shift(1)
    squared = past ** 2
    frame = pd.DataFrame({"squared_lag_1": squared, "variance_5": squared.rolling(5).mean(),
                          "variance_20": squared.rolling(20).mean(), "variance_60": squared.rolling(60).mean(),
                          "abs_mean_20": past.abs().rolling(20).mean(),
                          "ewma": squared.ewm(alpha=.06, adjust=False).mean(), "target": returns ** 2})
    return frame.dropna()


def walk_forward(returns, validation_start="2021-01-01"):
    frame = design(returns)
    out = frame.loc[validation_start:].copy()
    out["rolling_20"] = out.variance_20
    out["gradient_boosting"] = np.nan
    # Quarterly blocks use a fixed model. Daily observed inputs can update after each close.
    for _, dates in out.groupby(out.index.to_period("Q")).groups.items():
        origin = min(dates)
        train = frame.loc[frame.index < origin]
        if len(train) < 500:
            raise ValueError("Menos de 500 observações disponíveis antes do ajuste.")
        # Positive-link loss prevents impossible negative conditional variances.
        model = HistGradientBoostingRegressor(loss="poisson", max_iter=100, max_leaf_nodes=7, learning_rate=.05,
                                              l2_regularization=10, random_state=42)
        # Scale variance targets to avoid numerically tiny regression losses.
        model.fit(train[FEATURES], train.target * 10000)
        prediction = model.predict(out.loc[dates, FEATURES]) / 10000
        if not np.isfinite(prediction).all() or (prediction <= 0).any():
            raise ValueError("O modelo gerou uma previsão de variância inválida.")
        out.loc[dates, "gradient_boosting"] = prediction
    return out


def scores(frame):
    rows = []
    for model in ("rolling_20", "ewma", "gradient_boosting"):
        predicted = np.maximum(frame[model].to_numpy(), 1e-10)
        actual = frame.target.to_numpy()
        rows.append({"model": model, "qlike": float(np.mean(np.log(predicted) + actual / predicted)),
                     "mae_variance": float(np.abs(actual - predicted).mean()), "observations": len(actual)})
    return rows
