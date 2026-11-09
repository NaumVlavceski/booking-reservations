package com.naumvlavceski.bookingbackend.api;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Raw HTTP to the real embedded Tomcat, so its RemoteIpValve (forward-headers-strategy: native) is in the path. */
final class ForwardedHeadersSupport {
    private ForwardedHeadersSupport() {}

    record Answer(int status, String hsts) {}

    /** POST /api/auth/forgot-password (limited to 5 per IP per hour) as if a proxy forwarded it. */
    static Answer forgotPassword(int port, String forwardedFor, String forwardedProto) throws IOException {
        HttpURLConnection c = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + "/api/auth/forgot-password")
                .toURL().openConnection();
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        if (forwardedFor != null) c.setRequestProperty("X-Forwarded-For", forwardedFor);
        if (forwardedProto != null) c.setRequestProperty("X-Forwarded-Proto", forwardedProto);
        try (OutputStream out = c.getOutputStream()) {
            out.write(("{\"email\":\"fh_" + UUID.randomUUID() + "@example.test\"}").getBytes(StandardCharsets.UTF_8));
        }
        int status = c.getResponseCode();
        String hsts = c.getHeaderField("Strict-Transport-Security");
        c.disconnect();
        return new Answer(status, hsts);
    }
}
