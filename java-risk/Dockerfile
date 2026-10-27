FROM eclipse-temurin:17-jdk AS build
WORKDIR /app
COPY src ./src
RUN mkdir out && javac -d out src/risklab/*.java && java -cp out risklab.ExposureTest
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/out ./out
USER 10001
EXPOSE 8080
CMD ["java", "-cp", "out", "risklab.Server"]
