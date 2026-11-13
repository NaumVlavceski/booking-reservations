package com.naumvlavceski.bookingbackend.audit.ical;

import com.naumvlavceski.bookingbackend.config.security.IcalUrlGuard;
import com.naumvlavceski.bookingbackend.ical.IcalFetchException;
import com.naumvlavceski.bookingbackend.ical.IcalFetcher;
import com.naumvlavceski.bookingbackend.ical.IcalParser;
import com.naumvlavceski.bookingbackend.ical.PlatformDetector;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SSRF guard ({@link IcalUrlGuard}), the Booking.com allow-list ({@link PlatformDetector}) and the downloader
 * ({@link IcalFetcher}) as units. Only IP literals and "localhost" are given to the guard, so no DNS query leaves the
 * machine; the fetcher only talks to a {@link StubFeedServer} on 127.0.0.1.
 */
class IcalFetchAndGuardAuditTest {

    private StubFeedServer stub;

    @BeforeEach
    void start() throws IOException {
        stub = new StubFeedServer();
    }

    @AfterEach
    void stop() {
        stub.close();
    }

    /** The package-private overload with a short timeout and a custom cap (same code path as production). */
    private static String fetch(String url, Duration timeout, int cap) {
        try {
            Method m = IcalFetcher.class.getDeclaredMethod("fetch", String.class, Duration.class, int.class);
            m.setAccessible(true);
            return (String) m.invoke(null, url, timeout, cap);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof RuntimeException re) throw re;
            throw new IllegalStateException(e.getCause());
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- IcalUrlGuard: what it blocks ---------------------------------------------------------------------

    @ParameterizedTest
    @ValueSource(strings = {
            "https://localhost/a.ics", "https://LOCALHOST/a.ics", "https://127.0.0.1/a.ics", "https://127.0.0.2:8443/a.ics",
            "https://127.1/a.ics", "https://0x7f000001/a.ics", "https://2130706433/a.ics", "https://017700000001/a.ics",
            "https://[::1]/a.ics", "https://[::ffff:127.0.0.1]/a.ics", "https://[0:0:0:0:0:ffff:7f00:1]/a.ics",
            "https://0.0.0.0/a.ics", "https://[::]/a.ics",
            "https://10.0.0.1/a.ics", "https://10.255.255.255/a.ics", "https://172.16.0.1/a.ics", "https://172.31.255.254/a.ics",
            "https://192.168.0.1/a.ics", "https://169.254.169.254/latest/meta-data/", "https://[fe80::1]/a.ics",
            "https://[fd00::1]/a.ics", "https://[fc00::1]/a.ics", "https://[fec0::1]/a.ics",
            "https://224.0.0.1/a.ics", "https://[ff02::1]/a.ics",
            "file:///etc/passwd", "gopher://127.0.0.1:6379/_INFO", "ftp://ical.booking.com/a.ics", "http://ical.booking.com/a.ics",
            "webcal://ical.booking.com/a.ics", "jar:https://ical.booking.com/a.jar!/x", "data:text/calendar,BEGIN:VCALENDAR",
            "//ical.booking.com/a.ics", "https:///a.ics", "https://ical.booking.com\\@127.0.0.1/", "not a url", ""})
    void theGuardRefuses(String url) {
        assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate(url), url);
    }

    @Test
    void webcalIsOnlyAcceptedAfterNormalisation() {
        // The controller normalises first; the guard alone refuses webcal (proved above)
        assertEquals("https://ical.booking.com/a.ics", PlatformDetector.normalize("  WEBCAL://ical.booking.com/a.ics "));
    }

    @Test
    void theGuardHasNoInjectableResolver() {
        // Hosts are resolved with InetAddress.getAllByName inside a static method: a test cannot make
        // "x.booking.com" resolve to 10.0.0.1, and nothing re-resolves at fetch time (DNS rebinding window). See ICAL-03.
        List<Method> methods = Arrays.stream(IcalUrlGuard.class.getDeclaredMethods())
                .filter(m -> Modifier.isPublic(m.getModifiers())).toList();
        assertEquals(1, methods.size());
        assertArrayEquals(new Class<?>[]{String.class}, methods.getFirst().getParameterTypes());
    }

    // Finding ICAL-08: special-purpose ranges that reach internal or unintended networks are not blocked.
    @Tag("open-finding")
    @ParameterizedTest
    @ValueSource(strings = {
            "https://100.64.0.1/a.ics",          // CGNAT / some cloud internal networks (100.64.0.0/10)
            "https://100.100.100.200/a.ics",     // Alibaba Cloud metadata service lives in 100.64/10
            "https://198.18.0.1/a.ics",          // benchmarking 198.18.0.0/15
            "https://240.0.0.1/a.ics",           // reserved 240.0.0.0/4
            "https://255.255.255.255/a.ics",     // limited broadcast
            "https://0.1.2.3/a.ics",             // "this network" 0.0.0.0/8 (only 0.0.0.0 itself is refused)
            "https://[64:ff9b::7f00:1]/a.ics",   // NAT64 form of 127.0.0.1
            "https://[64:ff9b::a9fe:a9fe]/a.ics", // NAT64 form of 169.254.169.254
            "https://[2002:7f00:1::]/a.ics",     // 6to4 form of 127.0.0.1
            "https://[::127.0.0.1]/a.ics"})      // IPv4-compatible IPv6 of 127.0.0.1
    void theGuardShouldRefuseSpecialPurposeRanges(String url) {
        assertThrows(IcalFetchException.class, () -> IcalUrlGuard.validate(url), url);
    }

    // ---- PlatformDetector: the allow-list in front of the guard -------------------------------------------

    @ParameterizedTest
    @ValueSource(strings = {
            "https://booking.com@127.0.0.1/a.ics", "https://booking.com:443@127.0.0.1/a.ics",
            "https://ical.booking.com.evil.com/a.ics", "https://booking.com.evil.com/a.ics", "https://evilbooking.com/a.ics",
            "https://evil.com/ical.booking.com/a.ics", "https://evil.com/?h=.booking.com", "https://evil.com#.booking.com",
            "https://127.0.0.1#@ical.booking.com", "https://ical.booking.com\\.evil.com/a.ics", "https://ical.booking.com%2eevil.com/",
            "https://bооking.com/a.ics",      // Cyrillic o's
            "https://xn--bking-gxa.com/a.ics", "https://ical.booking.com./a.ics", "https://ical.booking.co/a.ics",
            "https://airbnb.com/calendar/ical/1.ics", "https://www.airbnb.com/calendar/ical/1.ics?s=x",
            "https://127.0.0.1/a.ics", "https://[::1]/booking.com", "", " ", "booking.com", "javascript:alert(1)"})
    void theAllowListRefuses(String url) {
        assertEquals(Optional.empty(), PlatformDetector.detect(PlatformDetector.normalize(url)), url);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://ical.booking.com/v1/export?t=abc", "https://BOOKING.COM/x", "https://admin.booking.com/x",
            "https://a.b.c.booking.com/x", "webcal://ical.booking.com/v1/export?t=abc", "https://ical.booking.com:22/x",
            "http://ical.booking.com/x", "ftp://ical.booking.com/x"})
    void theAllowListAcceptsAnyBookingComSubdomainPortAndScheme(String url) {
        // Scheme and port are left to the guard: the guard refuses http/ftp; it does NOT restrict ports (ICAL-08 note).
        assertEquals(Optional.of(ReservationSource.BOOKING), PlatformDetector.detect(PlatformDetector.normalize(url)), url);
    }

    // ---- IcalFetcher: redirects, size, encoding, TLS ------------------------------------------------------

    @Test
    void aRedirectToAPrivateAddressIsNotFollowed() {
        stub.serve("/internal", Feeds.calendar());
        stub.handle("/feed", e -> {
            e.getResponseHeaders().add("Location", stub.url("/internal"));
            StubFeedServer.respond(e, 302, "");
        });
        IcalFetchException ex = assertThrows(IcalFetchException.class,
                () -> fetch(stub.url("/feed"), Duration.ofSeconds(2), 1000));
        assertEquals("Feed returned HTTP 302", ex.getMessage());
        assertEquals(1, stub.hits("/feed"), "a 3xx is not an error worth retrying");
        assertEquals(0, stub.hits("/internal"), "the redirect target was never requested");
    }

    @ParameterizedTest
    @ValueSource(ints = {301, 303, 307, 308})
    void noRedirectStatusIsFollowed(int status) {
        stub.serve("/internal", Feeds.calendar());
        stub.handle("/feed", e -> {
            e.getResponseHeaders().add("Location", "http://169.254.169.254/latest/meta-data/");
            StubFeedServer.respond(e, status, "");
        });
        IcalFetchException ex = assertThrows(IcalFetchException.class,
                () -> fetch(stub.url("/feed"), Duration.ofSeconds(2), 1000));
        assertEquals("Feed returned HTTP " + status, ex.getMessage());
    }

    @Test
    void aRedirectLoopEndsAfterOneRequest() {
        stub.handle("/loop", e -> {
            e.getResponseHeaders().add("Location", stub.url("/loop"));
            StubFeedServer.respond(e, 302, "");
        });
        assertThrows(IcalFetchException.class, () -> fetch(stub.url("/loop"), Duration.ofSeconds(2), 1000));
        assertEquals(1, stub.hits("/loop"));
    }

    @Test
    void theRealFiveMegabyteCapIsEnforced() {
        byte[] justOver = padded(5 * 1024 * 1024 + 1);
        byte[] justUnder = padded(5 * 1024 * 1024 - 64);
        stub.handle("/over", e -> StubFeedServer.respond(e, 200, justOver));
        stub.handle("/under", e -> StubFeedServer.respond(e, 200, justUnder));

        IcalFetchException ex = assertThrows(IcalFetchException.class, () -> IcalFetcher.fetch(stub.url("/over")));
        assertTrue(ex.getMessage().contains("size cap (5242880 bytes)"), ex.getMessage());
        assertEquals(1, stub.hits("/over"), "an oversized feed is not downloaded again");

        assertEquals(justUnder.length, IcalFetcher.fetch(stub.url("/under")).getBytes(StandardCharsets.UTF_8).length);
    }

    private static byte[] padded(int size) {
        String head = "BEGIN:VCALENDAR\r\n";
        String tail = "END:VCALENDAR\r\n";
        StringBuilder sb = new StringBuilder(size).append(head);
        String line = "X-PAD:" + "p".repeat(66) + "\r\n";
        while (sb.length() + line.length() + tail.length() <= size) sb.append(line);
        while (sb.length() + tail.length() < size) sb.append('\n');
        return sb.append(tail).toString().getBytes(StandardCharsets.US_ASCII);
    }

    @Test
    void theRealTimeoutIsFifteenSecondsPerAttempt() throws Exception {
        // Read straight from the class: the per-attempt timeout and the number of attempts drive ICAL-07 (scale)
        var timeout = IcalFetcher.class.getDeclaredField("TIMEOUT");
        timeout.setAccessible(true);
        var retries = IcalFetcher.class.getDeclaredField("MAX_RETRIES");
        retries.setAccessible(true);
        assertEquals(Duration.ofSeconds(15), timeout.get(null));
        assertEquals(2, retries.get(null), "3 attempts in all");
    }

    @Test
    void aStalledFeedIsRetriedThreeTimes() {
        stub.handle("/stall", e -> {
            e.sendResponseHeaders(200, 0);
            OutputStream out = e.getResponseBody();
            out.write("BEGIN:VCALENDAR\r\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            try { stub.closed.await(); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        });
        long t0 = System.nanoTime();
        IcalFetchException ex = assertThrows(IcalFetchException.class,
                () -> fetch(stub.url("/stall"), Duration.ofMillis(700), 1000));
        long ms = (System.nanoTime() - t0) / 1_000_000;
        assertEquals("Failed after 3 attempts: Timed out after 0 seconds", ex.getMessage());
        assertEquals(3, stub.hits("/stall"));
        assertTrue(ms >= 2_000 && ms < 10_000, "three 700 ms attempts took " + ms + " ms");
    }

    @Test
    void anUnreachablePortGivesAReadableMessage() {
        IcalFetchException ex = assertThrows(IcalFetchException.class,
                () -> fetch("http://127.0.0.1:1/feed", Duration.ofSeconds(2), 1000));
        Feeds.recordTiming("connection refused message: " + ex.getMessage());
        assertTrue(ex.getMessage().startsWith("Failed after 3 attempts: "), ex.getMessage());
    }

    // Finding ICAL-09: a fold that splits a multi-byte UTF-8 character corrupts the guest name.
    @Tag("open-finding")
    @Test
    void aFoldInsideAMultiByteCharacterIsRestored() throws Exception {
        // RFC 5545 §3.1: implementations must unfold so that a multi-octet sequence split by a fold is restored.
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold@booking.com\r\nDTSTART;VALUE=DATE:20270101\r\n"
                + "DTEND;VALUE=DATE:20270103\r\nSUMMARY:Ма").getBytes(StandardCharsets.UTF_8));
        byte[] r = "р".getBytes(StandardCharsets.UTF_8); // two bytes: D1 80
        body.write(r[0]);
        body.write("\r\n ".getBytes(StandardCharsets.US_ASCII));
        body.write(r[1]);
        body.write("ија\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n".getBytes(StandardCharsets.UTF_8));
        byte[] bytes = body.toByteArray();
        stub.handle("/fold", e -> StubFeedServer.respond(e, 200, bytes));

        String summary = IcalParser.parse(IcalFetcher.fetch(stub.url("/fold"))).events().getFirst().summary();
        assertEquals("Марија", summary);
    }

    @Test
    void invalidTlsCertificateIsRefused() throws Exception {
        try (SelfSignedHttpsStub https = SelfSignedHttpsStub.startOrSkip()) {
            IcalFetchException ex = assertThrows(IcalFetchException.class,
                    () -> fetch(https.url("/feed"), Duration.ofSeconds(3), 1000));
            Feeds.recordTiming("self-signed TLS message: " + ex.getMessage());
            assertTrue(ex.getMessage().startsWith("Failed after 3 attempts: "), ex.getMessage());
            assertTrue(ex.getMessage().matches("(?is).*(PKIX|certificate|SSL|handshake).*"),
                    "the UI maps PKIX/certificate/SSL/handshake to 'secure connection' advice: " + ex.getMessage());
            assertEquals(0, https.servedBodies(), "no feed body was ever served over the untrusted connection");
        }
    }
}
