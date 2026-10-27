# Java risk module

First implementation of the deterministic FX costing domain in Java 17.
Uses immutable records, validated inputs and BigDecimal with HALF_UP rounding
per payment. Fixed coverage is an input assumption, not the price of a hedge.

With a JDK installed:

```sh
mkdir -p java-risk/out
javac -d java-risk/out java-risk/src/risklab/*.java
java -cp java-risk/out risklab.ExposureTest
```

`sql/exposure.sql` defines a PostgreSQL schema and a grouped exposure view.
This module is not yet an HTTP API and is not connected to the online Worker.
Validated locally with Java 17: compilation, domain checks, HTTP health and
POST costing endpoint. A standalone JDK was used because package installation
was restricted. The Java API is not deployed online.

## HTTP service

Run `java -cp java-risk/out risklab.Server` after compilation. `PORT` defaults
to 8080. `GET /health` reports health. `POST /api/price` accepts a form with
currency, amount, referenceRate, fixedFraction, fixedRate, localCost and shock.
Request bodies are limited to 4096 bytes; responses use decimal JSON numbers.
No portfolio data is persisted. The SQL schema is a separate draft, not yet
wired to JDBC. The hosted browser demo still uses the tested JavaScript engine.

A Dockerfile and a Java CI job compile and run checks before release. This is
an initial API, not a production trading service; portfolio authentication,
request timeouts, deployment and browser integration remain follow-up work.
