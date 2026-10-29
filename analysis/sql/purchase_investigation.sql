-- Materialized monthly reconciliation consumed by the web artifact.
SELECT substr(order_date,1,7) AS month, COUNT(*) AS orders,
       ROUND(SUM(budget_brl),2) AS budget_brl,
       ROUND(SUM(actual_brl),2) AS actual_brl,
       ROUND(SUM(actual_brl-budget_brl),2) AS variance_brl
FROM fact_purchase GROUP BY 1 ORDER BY 1;

-- Delivered-order KPI and censored outcomes remain separate at a fixed cutoff.
WITH outcomes AS (
 SELECT *,
   CASE WHEN delivery_date IS NOT NULL AND delivery_date<='2026-10-28' THEN 1 ELSE 0 END AS delivered,
   CASE WHEN delivery_date IS NOT NULL AND delivery_date<='2026-10-28'
     AND delivery_date<=promised_date THEN 1 ELSE 0 END AS on_time,
   CASE WHEN (delivery_date IS NULL OR delivery_date>'2026-10-28')
     AND promised_date<'2026-10-28' THEN 1 ELSE 0 END AS overdue_pending
 FROM fact_purchase
)
SELECT supplier,COUNT(*) AS orders,SUM(delivered) AS delivered,SUM(on_time) AS on_time,
       1.0*SUM(on_time)/NULLIF(SUM(delivered),0) AS on_time_rate,
       SUM(overdue_pending) AS overdue_pending,
       SUM(overdue_pending*actual_brl) AS pending_value_brl
FROM outcomes GROUP BY supplier ORDER BY pending_value_brl DESC;

-- Country is independent from invoice currency. Values are already in BRL.
SELECT country,currency,COUNT(*) AS orders,
       ROUND(SUM(actual_brl),2) AS actual_brl,
       ROUND(SUM(actual_brl-budget_brl),2) AS variance_brl,
       ROUND(SUM(CASE WHEN paid_date IS NULL OR paid_date>'2026-10-28'
         THEN actual_brl ELSE 0 END),2) AS open_brl
FROM fact_purchase
WHERE order_date<='2026-10-28'
GROUP BY country,currency ORDER BY country,actual_brl DESC;

-- HHI of invoiced purchase value, descriptive only (not a risk rating).
WITH totals AS (
 SELECT country,SUM(actual_brl) AS amount FROM fact_purchase GROUP BY country
), shares AS (
 SELECT country,amount/SUM(amount) OVER () AS share FROM totals
)
SELECT ROUND(SUM(share*share)*10000,2) AS country_hhi FROM shares;

-- Domestic invoices retain purchases but must have zero FX variation.
SELECT COUNT(*) AS brl_orders,ROUND(SUM(actual_brl),2) AS brl_invoiced,
       SUM(CASE WHEN budget_fx<>1 OR actual_fx<>1 THEN 1 ELSE 0 END) AS invalid_brl_fx
FROM fact_purchase WHERE currency='BRL';
