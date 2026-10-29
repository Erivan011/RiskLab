-- Each quote is stored once. Runs preserve audit counts even when payloads repeat.
SELECT executed_at, source_checked_at, received, invalid, duplicates, accepted, changed,
       payload_sha256
FROM ingestion_runs ORDER BY id DESC;

-- Keep the prior observation before filtering the output period.
WITH returns AS (
  SELECT currency, date, price,
         price / LAG(price) OVER (PARTITION BY currency ORDER BY date) - 1 AS return_rate
  FROM quotes
)
SELECT * FROM returns WHERE date >= '2026-01-01' AND return_rate IS NOT NULL
ORDER BY date, currency;
