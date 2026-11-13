package com.naumvlavceski.bookingbackend.audit.api;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** OPS-05 (fixed in application.yml server.compression): large JSON answers are gzip-compressed on a real server. */
class CompressionAuditTest extends ApiAuditBase {

    @Test
    void theCalendarsJsonIsCompressedWhenTheBrowserAcceptsGzip() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        LocalDate day = LocalDate.of(2031, 1, 1);
        for (int i = 0; i < 30; i++) {
            createReservation(o.token(), room, day.plusDays(2L * i).toString(), day.plusDays(2L * i + 1).toString(),
                    "\"notes\":\"" + "Late arrival, keys under the mat. ".repeat(5) + "\"");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/reservations"))
                .timeout(Duration.ofSeconds(30))
                .header("Authorization", "Bearer " + o.token())
                .header("Accept-Encoding", "gzip")
                .GET().build();
        HttpResponse<byte[]> gz = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, gz.statusCode());
        assertEquals("gzip", gz.headers().firstValue("Content-Encoding").orElse(""), "the calendar JSON is not compressed");

        HttpResponse<String> plain = live("GET", "/api/reservations", o.token(), null, null);
        assertTrue(plain.body().length() > 4 * gz.body().length,
                "plain " + plain.body().length() + " bytes vs gzip " + gz.body().length);
    }
}
