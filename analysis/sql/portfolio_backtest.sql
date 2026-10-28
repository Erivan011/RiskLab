-- Run after: python3 analysis/scripts/portfolio_reference.py --sqlite portfolio.db
-- Daily peaks include initial capital, so a loss on the first evaluated day counts.
WITH paths AS (
  SELECT *,
    MAX(initial_capital, MAX(wealth) OVER (
      PARTITION BY case_id ORDER BY date ROWS UNBOUNDED PRECEDING
    )) AS running_peak
  FROM portfolio_forecasts
)
SELECT case_id,
  MIN(date) AS first_evaluation,
  MAX(date) AS last_evaluation,
  COUNT(*) AS observations,
  SUM(breach) AS exceptions,
  AVG(breach) AS exception_rate,
  SUM(fee_paid) AS deducted_fees,
  MIN(wealth / running_peak - 1) AS maximum_drawdown,
  SUM(CASE WHEN training_end >= date THEN 1 ELSE 0 END) AS temporal_leaks
FROM paths GROUP BY case_id;
