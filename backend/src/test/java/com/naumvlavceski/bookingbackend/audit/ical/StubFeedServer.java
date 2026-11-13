package com.naumvlavceski.bookingbackend.audit.ical;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A local stand-in for a channel's calendar export: a JDK HTTP server bound to the loopback address only. Each path
 * gets its own handler, which a test can swap between syncs, and every request is counted. Never reaches the network.
 */
public final class StubFeedServer implements AutoCloseable {
    private final HttpServer server;
    private final ExecutorService threads = Executors.newCachedThreadPool();
    private final Map<String, HttpHandler> handlers = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> hits = new ConcurrentHashMap<>();
    /** Released when the test ends, so handlers that hang on purpose let go. */
    public final CountDownLatch closed = new CountDownLatch(1);

    public StubFeedServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(threads);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            hits.computeIfAbsent(path, p -> new AtomicInteger()).incrementAndGet();
            HttpHandler handler = handlers.get(path);
            if (handler == null) {
                respond(exchange, 404, "no such feed");
            } else {
                handler.handle(exchange);
            }
        });
        server.start();
    }

    public int port() {
        return server.getAddress().getPort();
    }

    public String url(String path) {
        return "http://127.0.0.1:" + port() + path;
    }

    public void handle(String path, HttpHandler handler) {
        handlers.put(path, handler);
    }

    /** Serves {@code body} with 200 from now on. */
    public void serve(String path, String body) {
        handle(path, e -> respond(e, 200, body));
    }

    public int hits(String path) {
        AtomicInteger n = hits.get(path);
        return n == null ? 0 : n.get();
    }

    public static void respond(HttpExchange exchange, int status, String body) throws IOException {
        respond(exchange, status, body.getBytes(StandardCharsets.UTF_8));
    }

    public static void respond(HttpExchange exchange, int status, byte[] bytes) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", "text/calendar; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            } catch (IOException clientHungUp) {
                // the fetcher may stop reading on purpose (size cap)
            }
        }
        exchange.close();
    }

    @Override
    public void close() {
        closed.countDown();
        server.stop(0);
        threads.shutdownNow();
    }
}
