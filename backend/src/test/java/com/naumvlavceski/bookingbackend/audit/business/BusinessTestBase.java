package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailSender;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared base of the Phase 3 "business" audit tests (Docs/testing/report/business.md).
 *
 * <p>All business test classes share ONE Spring context: the same properties and the same capturing mail sender. The
 * public URLs are set to non-localhost values so the email tests can prove which base URL the links use. Emails are
 * never sent anywhere: {@link CapturingEmailSender} replaces the sender and only records the messages.
 */
@SpringBootTest(properties = {
        "app.public-api-url=https://api.audit.example.test",
        "app.frontend-url=https://app.audit.example.test"
})
@Import(BusinessTestBase.MailCapture.class)
public abstract class BusinessTestBase extends AuditTestBase {

    public static final String API_URL = "https://api.audit.example.test";
    public static final String FRONTEND_URL = "https://app.audit.example.test";

    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected CapturingEmailSender mailbox;

    /** Records every email instead of sending it. Thread-safe; tests filter by recipient address. */
    public static class CapturingEmailSender implements EmailSender {
        private final List<EmailMessage> sent = new CopyOnWriteArrayList<>();

        @Override
        public String send(EmailMessage m) {
            sent.add(m);
            return "captured-" + UUID.randomUUID();
        }

        public List<EmailMessage> to(String address) {
            return sent.stream().filter(m -> address.equalsIgnoreCase(m.to())).toList();
        }

        /** Waits (up to {@code timeout}) for an email to {@code address} that matches; null if none came. */
        public EmailMessage await(String address, Predicate<EmailMessage> match, Duration timeout) throws InterruptedException {
            Instant end = Instant.now().plus(timeout);
            while (Instant.now().isBefore(end)) {
                for (EmailMessage m : to(address)) if (match.test(m)) return m;
                Thread.sleep(50);
            }
            return null;
        }
    }

    @TestConfiguration
    static class MailCapture {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
    }

    // ---------- helpers ----------

    protected ResultActions putJson(String path, String token, String json) throws Exception {
        return send(put(path), token, json);
    }

    protected String getJson(String path, String token) throws Exception {
        return body(send(get(path), token, null).andExpect(status().isOk()));
    }

    protected String ownerIdOfUnit(String unitId) {
        return jdbc.queryForObject("SELECT owner_id::text FROM unit WHERE id = ?::uuid", String.class, unitId);
    }

    /** Inserts a reservation with plain SQL, bypassing the API and its checks. Returns the new id. */
    protected String insertRaw(String unitId, String checkIn, String checkOut, String status, String source,
                               String guestName, BigDecimal total) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guest_name, guests_count,
                                         total_amount, created_at, updated_at)
                VALUES (?::uuid, ?::uuid, (SELECT owner_id FROM unit WHERE id = ?::uuid), daterange(?::date, ?::date, '[)'),
                        ?, ?, ?, 2, ?, now(), now())
                """, id, unitId, unitId, checkIn, checkOut, status, source, guestName, total);
        return id;
    }

    protected int liveCount(String unitId) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM reservation WHERE unit_id = ?::uuid AND status <> 'CANCELLED'", Integer.class, unitId);
        return n == null ? 0 : n;
    }

    protected static BigDecimal dec(Object jsonNumber) {
        return jsonNumber == null ? null : new BigDecimal(String.valueOf(jsonNumber));
    }

    protected static BigDecimal decAt(String json, String path) {
        return dec(JsonPath.read(json, path));
    }

    /** JSON string literal with escaping, for names with quotes, backslashes or control characters. */
    protected static String js(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.append('"').toString();
    }

    protected String createPropertyNamed(String token, String name, int rooms) throws Exception {
        String json = body(send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/properties"),
                token, "{\"name\":" + js(name) + ",\"address\":\"1 Lake St\",\"unitCount\":" + rooms + "}")
                .andExpect(status().isOk()));
        return JsonPath.read(json, "$.id");
    }

    protected void renameRoom(String token, String unitId, String name) throws Exception {
        putJson("/api/units/" + unitId, token, "{\"name\":" + js(name) + ",\"capacity\":2}").andExpect(status().isOk());
    }
}
