import json
import unittest
import numpy as np
import pandas as pd
from risklab.data import parse_series, portfolio_returns
from risklab.risk import risk_forecasts, coverage_tests, historical_summary, block_bootstrap
from risklab.volatility import design, walk_forward


class RiskTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(11)
        self.returns = pd.Series(rng.normal(0, .01, 900), index=pd.bdate_range('2018-01-01', periods=900))

    def test_risk_predictions_cannot_see_current_or_future_returns(self):
        before = risk_forecasts(self.returns)
        changed = self.returns.copy()
        changed.iloc[400:] = .5
        after = risk_forecasts(changed)
        day = str(self.returns.index[400].date())
        np.testing.assert_allclose(before.loc[before.date <= day, ['var', 'es']], after.loc[after.date <= day, ['var', 'es']])
        self.assertTrue((before.training_end < before.date).all())

    def test_expected_shortfall_is_in_the_tail(self):
        rows = risk_forecasts(self.returns)
        self.assertTrue((rows.es >= rows['var']).all())

    def test_no_breaches_and_all_breaches_are_numerically_valid(self):
        for flags in ([False] * 250, [True] * 250):
            result = coverage_tests(flags)
            self.assertTrue(np.isfinite(result['kupiec_pvalue']))
            self.assertIsNone(result['independence_pvalue'])

    def test_drawdown_includes_initial_capital(self):
        self.assertAlmostEqual(historical_summary(pd.Series([-.1, .05]))['max_drawdown'], -.1)

    def test_block_bootstrap_is_reproducible(self):
        a = block_bootstrap(self.returns, simulations=200)
        b = block_bootstrap(self.returns, simulations=200)
        self.assertEqual(a, b)
        self.assertGreaterEqual(a['es'], a['var'])

    def test_current_target_is_absent_from_features(self):
        original = design(self.returns)
        changed = self.returns.copy()
        changed.iloc[400:] = .3
        modified = design(changed)
        np.testing.assert_allclose(original.drop(columns='target').loc[:self.returns.index[400]],
                                   modified.drop(columns='target').loc[:self.returns.index[400]])

    def test_walk_forward_does_not_fit_on_future_targets(self):
        before = walk_forward(self.returns, '2021-01-01')
        self.assertTrue((before.gradient_boosting > 0).all())
        changed = self.returns.copy()
        cutoff = pd.Timestamp('2021-02-01')
        changed.loc[cutoff:] = .2
        after = walk_forward(changed, '2021-01-01')
        np.testing.assert_allclose(before.loc[:cutoff, 'gradient_boosting'], after.loc[:cutoff, 'gradient_boosting'])


class DataTests(unittest.TestCase):
    def test_rejects_nonpositive_prices_and_duplicate_dates(self):
        for rows in ([{'data':'01/01/2020','valor':'0'}],
                     [{'data':'01/01/2020','valor':'4'}] * 2):
            with self.assertRaises(ValueError):
                parse_series(json.dumps(rows).encode())

    def test_weight_validation_and_no_calendar_fill(self):
        prices = pd.DataFrame({'USD':[4., 4.4], 'EUR':[5., 5.]}, index=pd.to_datetime(['2020-01-01','2020-01-03']))
        result = portfolio_returns(prices, [.5, .5])
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result.iloc[0], .05)
        with self.assertRaises(ValueError):
            portfolio_returns(prices, [.8, .8])


if __name__ == '__main__':
    unittest.main()
