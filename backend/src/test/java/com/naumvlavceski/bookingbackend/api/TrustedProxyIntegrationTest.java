package com.naumvlavceski.bookingbackend.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static com.naumvlavceski.bookingbackend.api.ForwardedHeadersSupport.forgotPassword;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Requests arrive from 127.0.0.1, which Tomcat's default internal-proxies count as a proxy (like Caddy on the Docker
 * network): its X-Forwarded-For is the client address and its X-Forwarded-Proto makes the request HTTPS.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class TrustedProxyIntegrationTest {

    @Value("${local.server.port}") int port;

    @Test
    void aTrustedProxysForwardedForIsTheClientAddress() throws Exception {
        String client = "198.51.100.20";
        for (int i = 0; i < 5; i++) assertEquals(200, forgotPassword(port, client, "https").status());
        assertEquals(429, forgotPassword(port, client, "https").status(), "the forwarded client is limited");
        assertEquals(200, forgotPassword(port, "198.51.100.21", "https").status(), "another client is not");
    }

    @Test
    void hstsIsStillSentBehindTheProxy() throws Exception {
        assertNotNull(forgotPassword(port, "198.51.100.30", "https").hsts());
    }
}
