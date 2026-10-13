package com.naumvlavceski.bookingbackend.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(name = "app.mail.enabled", havingValue = "true")
public class ResendEmailSender implements EmailSender {
    private final RestClient client;
    private final String from;

    ResendEmailSender(@Value("${app.mail.resend-api-key}") String key,
                      @Value("${app.mail.from}") String from) {
        if (key == null || key.isBlank()) {
            throw new IllegalStateException("MAIL_ENABLED=true but RESEND_API_KEY is not set");
        }
        this.from = from;
        this.client = RestClient.builder()
                .baseUrl("https://api.resend.com")
                .defaultHeader("Authorization", "Bearer " + key)
                .build();
    }

    @Override
    public String send(EmailMessage m) {
        Map<String, Object> body = new HashMap<>();
        body.put("from", from);
        body.put("to", List.of(m.to()));
        body.put("subject", m.subject());
        body.put("html", m.html());
        body.put("text", m.text());
        if (m.headers() != null && !m.headers().isEmpty()) body.put("headers", m.headers());
        Map<?, ?> res = client.post().uri("/emails")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve().body(Map.class);
        return res == null ? null : (String) res.get("id");
    }
}
