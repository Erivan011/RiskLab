-- Common latest observation date: comparable FX references for all currencies.
WITH common_date AS (
 SELECT date FROM quotes GROUP BY date HAVING COUNT(DISTINCT currency)=3
 ORDER BY date DESC LIMIT 1
), metrics AS (
 SELECT f.*, s.name AS supplier, c.name AS category,
   f.foreign_amount*f.budget_rate+f.local_cost_brl AS budget_brl,
   f.foreign_amount*(f.hedge_percent/100.0*f.hedge_rate+
     (1-f.hedge_percent/100.0)*q.price)+f.local_cost_brl AS reference_brl
 FROM fact_operation f JOIN dim_supplier s ON f.supplier_id=s.id
 JOIN dim_category c ON f.category_id=c.id
 JOIN quotes q ON q.currency=f.currency AND q.date=(SELECT date FROM common_date)
 WHERE f.status='open'
)
SELECT supplier, COUNT(*) AS operations, SUM(budget_brl) AS budget_brl,
 SUM(reference_brl) AS reference_brl, SUM(reference_brl-budget_brl) AS delta_brl
FROM metrics GROUP BY supplier ORDER BY reference_brl DESC;
