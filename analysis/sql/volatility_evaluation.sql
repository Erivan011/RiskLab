-- Same evaluation dates for every model; training boundary is constrained at insertion.
SELECT currency, model, COUNT(*) AS observations,
       MIN(date) AS evaluation_start, MAX(date) AS evaluation_end,
       AVG(squared_error) AS mse_variance, AVG(qlike) AS mean_qlike,
       SUM(CASE WHEN training_end >= date THEN 1 ELSE 0 END) AS future_leakage_rows
FROM volatility_evaluation
GROUP BY currency,model ORDER BY currency, mean_qlike;
