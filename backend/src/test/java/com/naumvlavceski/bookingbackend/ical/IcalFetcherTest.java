package com.naumvlavceski.bookingbackend.ical;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/** Against a real HTTP server on this machine, because the failures that matter happen on the wire. */
class IcalFetcherTest {
    private static final Duration TIMEOUT = Duration.ofMillis(500);
    private static final int CAP = 1000;
    private static final String FEED = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

    private HttpServer server;
    private ExecutorService threads;
    private final CountDownLatch testOver = new CountDownLatch(1);

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        threads = Executors.newCachedThreadPool();
        server.setExecutor(threads);
        server.start();
    }

    @AfterEach
    void stopServer() {
        testOver.countDown();
        server.stop(0);
        threads.shutdownNow();
    }

    private String serve(HttpHandler handler) {
        server.createContext("/feed", handler);
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/feed";
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        }
        exchange.close();
    }

    private static String fetch(String url) {
        return IcalFetcher.fetch(url, TIMEOUT, CAP);
    }

    @Test
    void returnsACompleteFeed() {
        assertEquals(FEED, fetch(serve(e -> respond(e, 200, FEED))));
    }

    @Test
    void acceptsNonLatinTextAsUtf8() {
        String feed = "BEGIN:VCALENDAR\r\nX-NAME:Марија\r\nEND:VCALENDAR\r\n";
        assertEquals(feed, fetch(serve(e -> respond(e, 200, feed))));
    }

    @Test
    void refusesAFeedThatWasCutOff() {
        String url = serve(e -> respond(e, 200, "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nEND:VEVENT\r\n"));
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        assertTrue(e.getMessage().contains("cut off"), e.getMessage());
    }

    @Test
    void refusesWhatIsNotAFeed() {
        String url = serve(e -> respond(e, 200, "<html>Please log in</html>"));
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        assertTrue(e.getMessage().contains("not an iCal feed"), e.getMessage());
    }

    @Test
    void reportsAnHttpError() {
        String url = serve(e -> respond(e, 503, "try later"));
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        assertEquals("Feed returned HTTP 503", e.getMessage());
    }

    @Test
    void doesNotFollowRedirects() {
        AtomicInteger hits = new AtomicInteger();
        String url = serve(e -> {
            hits.incrementAndGet();
            e.getResponseHeaders().add("Location", "http://127.0.0.1:1/elsewhere");
            respond(e, 302, "");
        });
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        assertEquals("Feed returned HTTP 302", e.getMessage());
        assertEquals(1, hits.get());
    }

    @Test
    void givesUpOnAnOversizedFeedWithoutReadingAllOfIt() {
        String url = serve(e -> {
            e.sendResponseHeaders(200, 0);
            try (OutputStream out = e.getResponseBody()) {
                byte[] chunk = new byte[CAP];
                // Far more than the cap: only a reader that stops early finishes before the timeout
                for (int i = 0; i < 100_000; i++) {
                    out.write(chunk);
                    out.flush();
                }
            } catch (IOException clientWentAway) {
                // Expected: the fetcher hung up
            }
        });
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        assertTrue(e.getMessage().contains("size cap"), e.getMessage());
    }

    @Test
    void aFeedThatStallsMidBodyTimesOut() {
        String url = serve(e -> {
            e.sendResponseHeaders(200, 0);
            OutputStream out = e.getResponseBody();
            out.write("BEGIN:VCALENDAR\r\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            try {
                testOver.await(); // headers sent, then silence: the body never finishes
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });

        long started = System.nanoTime();
        IcalFetchException e = assertThrows(IcalFetchException.class, () -> fetch(url));
        Duration took = Duration.ofNanos(System.nanoTime() - started);

        assertTrue(e.getMessage().contains("Timed out"), e.getMessage());
        assertTrue(took.compareTo(Duration.ofSeconds(10)) < 0, "took " + took);
    }

    @Test
    void anUnreachableAddressIsAFailureNotAHang() {
        assertThrows(IcalFetchException.class, () -> fetch("http://127.0.0.1:1/feed"));
    }
}
