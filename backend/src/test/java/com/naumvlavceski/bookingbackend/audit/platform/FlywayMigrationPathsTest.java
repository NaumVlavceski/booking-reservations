package com.naumvlavceski.bookingbackend.audit.platform;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Finding OPS-01 (regression): with the Flyway settings from the production application.yml (no
 * SPRING_FLYWAY_LOCATIONS override), the app must start on (a) an empty database, (b) a database built before
 * db/fresh-install existed (1.1 / 2.1 never applied) and (c) a database built with db/fresh-install.
 * Each case uses its own throwaway PostgreSQL 16 container.
 */
class FlywayMigrationPathsTest {

    private static final MigrationVersion LATEST = MigrationVersion.fromVersion("26");

    private record ProdFlywaySettings(String[] locations, String[] ignorePatterns) {}

    private static ProdFlywaySettings prodSettings() throws Exception {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader()
                .load("application.yml", new ClassPathResource("application.yml"));
        PropertySource<?> yml = sources.getFirst();
        Object locations = yml.getProperty("spring.flyway.locations");
        Object patterns = yml.getProperty("spring.flyway.ignore-migration-patterns");
        return new ProdFlywaySettings(
                locations == null ? new String[]{"classpath:db/migration"} : split(locations.toString()),
                patterns == null ? new String[]{"*:future"} : split(patterns.toString()));
    }

    private static String[] split(String value) {
        return java.util.Arrays.stream(value.split(",")).map(String::trim).toArray(String[]::new);
    }

    private static Flyway prodFlyway(PostgreSQLContainer db) throws Exception {
        ProdFlywaySettings s = prodSettings();
        return Flyway.configure()
                .dataSource(db.getJdbcUrl(), db.getUsername(), db.getPassword())
                .locations(s.locations())
                .ignoreMigrationPatterns(s.ignorePatterns())
                .load();
    }

    private static JdbcTemplate jdbc(PostgreSQLContainer db) {
        return new JdbcTemplate(new DriverManagerDataSource(db.getJdbcUrl(), db.getUsername(), db.getPassword()));
    }

    @Test
    void anEmptyDatabaseMigratesWithTheProductionSettings() throws Exception {
        try (PostgreSQLContainer db = new PostgreSQLContainer("postgres:16")) {
            db.start();
            Flyway flyway = prodFlyway(db);
            assertDoesNotThrow(flyway::migrate, "a new or restored server must start on an empty database");
            assertEquals(LATEST, flyway.info().current().getVersion());
            assertEquals(1, jdbc(db).queryForObject(
                    "select count(*) from pg_constraint where conname = 'no_overlap'", Integer.class));
        }
    }

    @Test
    void aDatabaseBuiltBeforeFreshInstallExistedStillStarts() throws Exception {
        try (PostgreSQLContainer db = new PostgreSQLContainer("postgres:16")) {
            db.start();
            // Build the schema, then forget 1.1 / 2.1 in the history: that is what a database looks like that was
            // migrated release by release with the original V1/V2 (it never ran the fresh-install files).
            Flyway.configure().dataSource(db.getJdbcUrl(), db.getUsername(), db.getPassword())
                    .locations("classpath:db/migration", "classpath:db/fresh-install").load().migrate();
            jdbc(db).update("delete from flyway_schema_history where version in ('1.1', '2.1')");

            Flyway flyway = prodFlyway(db);
            assertDoesNotThrow(flyway::validate, "an existing database must not be refused at startup");
            assertDoesNotThrow(flyway::migrate);
            assertEquals(LATEST, flyway.info().current().getVersion());
            assertEquals(0, jdbc(db).queryForObject(
                    "select count(*) from flyway_schema_history where version in ('1.1', '2.1')", Integer.class),
                    "the fresh-install steps must not run on an existing database");
        }
    }

    @Test
    void aDatabaseBuiltWithFreshInstallStillStarts() throws Exception {
        try (PostgreSQLContainer db = new PostgreSQLContainer("postgres:16")) {
            db.start();
            Flyway.configure().dataSource(db.getJdbcUrl(), db.getUsername(), db.getPassword())
                    .locations("classpath:db/migration", "classpath:db/fresh-install").load().migrate();

            Flyway flyway = prodFlyway(db);
            assertDoesNotThrow(flyway::validate);
            assertEquals(LATEST, flyway.info().current().getVersion());
        }
    }
}
