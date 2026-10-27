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
The HTTP API is implemented; production deployment awaits Render repository access.
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

## Browser verification integration

The Worker proxy `/api/java/price` uses `JAVA_RISK_ORIGIN` (an HTTPS onrender.com origin). The browser sends only the selected demo payment and checks base, stressed cost and impact against the Java result. Missing configuration returns 503; failures are never reported as successful Java calculations. The Render service creation was rejected because the private repository was unfetchable. No service was created.
