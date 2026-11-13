# Build stage
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Run stage
FROM eclipse-temurin:25-jre
WORKDIR /app
# Audit SEC-13: the app runs as an unprivileged user, not root
RUN groupadd --system roomtrack && useradd --system --gid roomtrack --no-create-home --shell /usr/sbin/nologin roomtrack
COPY --from=build --chown=roomtrack:roomtrack /app/target/*.jar app.jar
USER roomtrack
EXPOSE 8080
# Audit SEC-13: Docker marks the container unhealthy when /actuator/health stops answering UP. The image has no
# curl or wget, so bash's /dev/tcp sends the request. start-period covers Flyway migrations on startup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /actuator/health HTTP/1.0\r\nHost: localhost\r\n\r\n" >&3 && grep -q "\"UP\"" <&3'
ENTRYPOINT ["java", "-jar", "app.jar"]
