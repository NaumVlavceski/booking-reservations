package com.naumvlavceski.bookingbackend.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static com.naumvlavceski.bookingbackend.api.ForwardedHeadersSupport.forgotPassword;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Here 127.0.0.1 is NOT a trusted proxy (as for a client connecting directly): whatever X-Forwarded-For it sends,
 * every request counts against its own address, so spoofing the header cannot dodge a limit.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.tomcat.remoteip.internal-proxies=10\\.255\\.255\\.254")
@ActiveProfiles("test")
class UntrustedProxyIntegrationTest {

    @Value("${local.server.port}") int port;

    @Test
    void aSpoofedForwardedForIsIgnored() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertEquals(200, forgotPassword(port, "203.0.113." + i, null).status());
        }
        assertEquals(429, forgotPassword(port, "203.0.113.99", null).status());
    }

    @Test
    void aSpoofedForwardedProtoDoesNotMakeTheRequestHttps() throws Exception {
        assertNull(forgotPassword(port, null, "https").hsts());
    }
}
