package com.naumvlavceski.bookingbackend.demo;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * {@code app.demo} in application.yml: "Try the demo" (POST /api/auth/demo). Each visitor gets a private copy of the
 * sample data that is deleted {@code lifetime} after it was created. At most {@code maxActive} demos exist at once.
 */
@ConfigurationProperties("app.demo")
public record DemoProperties(boolean enabled, Duration lifetime, int maxActive) {

    public DemoProperties {
        if (lifetime == null) lifetime = Duration.ofHours(1);
        if (lifetime.isNegative() || lifetime.isZero()) {
            throw new IllegalStateException("app.demo.lifetime must be positive");
        }
        if (maxActive < 1) throw new IllegalStateException("app.demo.max-active must be at least 1");
    }
}
