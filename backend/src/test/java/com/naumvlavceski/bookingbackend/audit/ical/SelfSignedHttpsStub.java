package com.naumvlavceski.bookingbackend.audit.ical;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import org.junit.jupiter.api.Assumptions;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * An HTTPS server on 127.0.0.1 with a freshly generated self-signed certificate (made with the JDK's keytool, a
 * throwaway keystore in a temp folder). Skips the test when keytool is not available.
 */
final class SelfSignedHttpsStub implements AutoCloseable {
    private static final char[] STORE_PASSWORD = "throwaway-test-store".toCharArray();

    private final HttpsServer server;
    private final ExecutorService threads = Executors.newCachedThreadPool();
    private final AtomicInteger served = new AtomicInteger();
    private final Path dir;

    private SelfSignedHttpsStub(SSLContext ssl, Path dir) throws Exception {
        this.dir = dir;
        server = HttpsServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(ssl));
        server.setExecutor(threads);
        server.createContext("/", e -> {
            served.incrementAndGet();
            StubFeedServer.respond(e, 200, Feeds.calendar());
        });
        server.start();
    }

    static SelfSignedHttpsStub startOrSkip() throws Exception {
        Path keytool = Path.of(System.getProperty("java.home"), "bin", "keytool");
        Assumptions.assumeTrue(Files.isExecutable(keytool), "keytool not available: " + keytool);
        Path dir = Files.createTempDirectory("ical-tls-stub");
        Path store = dir.resolve("stub.p12");
        Process p = new ProcessBuilder(keytool.toString(), "-genkeypair", "-alias", "stub", "-keyalg", "RSA",
                "-keysize", "2048", "-validity", "2", "-dname", "CN=127.0.0.1", "-ext", "SAN=ip:127.0.0.1",
                "-storetype", "PKCS12", "-keystore", store.toString(),
                "-storepass", new String(STORE_PASSWORD), "-keypass", new String(STORE_PASSWORD))
                .redirectErrorStream(true).start();
        boolean done = p.waitFor(60, TimeUnit.SECONDS);
        Assumptions.assumeTrue(done && p.exitValue() == 0, "keytool could not create a keystore");

        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(store)) {
            ks.load(in, STORE_PASSWORD);
        }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, STORE_PASSWORD);
        SSLContext ssl = SSLContext.getInstance("TLS");
        ssl.init(kmf.getKeyManagers(), null, null);
        return new SelfSignedHttpsStub(ssl, dir);
    }

    String url(String path) {
        return "https://127.0.0.1:" + server.getAddress().getPort() + path;
    }

    int servedBodies() {
        return served.get();
    }

    @Override
    public void close() throws Exception {
        server.stop(0);
        threads.shutdownNow();
        try (var files = Files.list(dir)) {
            for (Path f : files.toList()) Files.deleteIfExists(f);
        }
        Files.deleteIfExists(dir);
    }
}
