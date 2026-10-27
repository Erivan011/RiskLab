-- PostgreSQL 15+. Illustrative operational schema; not connected to the hosted demo.
CREATE TABLE fx_reference (
 currency char(3) PRIMARY KEY CHECK(currency IN ('USD','EUR','GBP')),
 reference_date date NOT NULL,
 brl_rate numeric(18,8) NOT NULL CHECK(brl_rate > 0)
);
CREATE TABLE payment (
 id text PRIMARY KEY,
 supplier text NOT NULL,
 currency char(3) NOT NULL REFERENCES fx_reference(currency),
 due_date date NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount > 0),
 fixed_fraction numeric(9,8) NOT NULL CHECK(fixed_fraction BETWEEN 0 AND 1),
 fixed_rate numeric(18,8) NOT NULL CHECK(fixed_rate > 0),
 local_cost numeric(18,2) NOT NULL CHECK(local_cost >= 0),
 status text NOT NULL CHECK(status IN ('open','review','paid'))
);
CREATE INDEX payment_open_due ON payment(due_date) WHERE status <> 'paid';
-- Coverage-independent grouping: do not round each component before aggregating.
CREATE VIEW supplier_exposure AS
 SELECT p.supplier, p.currency, count(*) AS payments,
 sum(p.amount * (1-p.fixed_fraction) * r.brl_rate) AS uncovered_brl,
 min(p.due_date) AS first_due
 FROM payment p JOIN fx_reference r USING(currency)
 WHERE p.status <> 'paid'
 GROUP BY p.supplier,p.currency;
