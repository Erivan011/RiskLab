-- Exceções por ano e modelo. VaR e perdas são frações de um nocional constante.
SELECT substr(date, 1, 4) AS year, model, COUNT(*) AS observations,
       SUM(breach) AS exceptions, ROUND(100.0 * SUM(breach) / COUNT(*), 3) AS exception_pct,
       AVG(var) AS mean_var, AVG(es) AS mean_es
FROM risk_backtests
WHERE date >= '2023-01-01'
GROUP BY substr(date, 1, 4), model
ORDER BY year, model;
