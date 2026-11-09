package com.naumvlavceski.bookingbackend.ical;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

public class IcalFetcher {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final int MAX_RETRIES = 2;
    private static final Pattern FEED_START = Pattern.compile("BEGIN:VCALENDAR", Pattern.CASE_INSENSITIVE);
    private static final Pattern FEED_END = Pattern.compile("END:VCALENDAR", Pattern.CASE_INSENSITIVE);

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    public static String fetch(String url) throws IcalFetchException {
        return fetch(url, TIMEOUT, MAX_BYTES);
    }

    /** {@code timeout} covers one whole download, body included: a feed that stalls half-way can't hang the caller. */
    static String fetch(String url, Duration timeout, int maxBytes) throws IcalFetchException {
        Exception lastError = null;
        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return checked(download(url, timeout, maxBytes));
            } catch (IcalFetchException e) {
                throw e;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IcalFetchException("Interrupted while downloading the feed");
            } catch (Exception e) {
                lastError = e;
            }
        }
        throw new IcalFetchException("Failed after " + (MAX_RETRIES + 1) + " attempts: " + lastError.getMessage());
    }

    private static HttpResponse<byte[]> download(String url, Duration timeout, int maxBytes) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(timeout)
                .GET()
                .build();
        // The body of an error page is not read at all
        CompletableFuture<HttpResponse<byte[]>> pending = CLIENT.sendAsync(request, info -> info.statusCode() == 200
                ? new CappedBody(maxBytes)
                : HttpResponse.BodySubscribers.replacing(new byte[0]));
        try {
            return pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            pending.cancel(true);
            throw new IOException("Timed out after " + timeout.toSeconds() + " seconds");
        } catch (ExecutionException e) {
            throw rootOf(e);
        }
    }

    /** The client may wrap what the body subscriber failed with. */
    private static Exception rootOf(ExecutionException e) {
        for (Throwable t = e.getCause(); t != null; t = t.getCause()) {
            if (t instanceof IcalFetchException capExceeded) return capExceeded;
        }
        return e.getCause() instanceof Exception cause ? cause : e;
    }

    private static String checked(HttpResponse<byte[]> response) {
        if (response.statusCode() != 200) {
            throw new IcalFetchException("Feed returned HTTP " + response.statusCode());
        }
        String body = new String(response.body(), StandardCharsets.UTF_8);
        if (!FEED_START.matcher(body).find()) {
            throw new IcalFetchException("Response is not an iCal feed");
        }
        // Without its last line the file was cut off, and bookings missing from it mean nothing
        if (!FEED_END.matcher(body).find()) {
            throw new IcalFetchException("Feed was cut off before its end");
        }
        return body;
    }

    /** Collects the body and gives up as soon as it passes the cap, so an oversized feed never ends up in memory. */
    private static final class CappedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final int maxBytes;
        private Flow.Subscription subscription;

        private CappedBody(int maxBytes) {
            this.maxBytes = maxBytes;
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return result;
        }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            if (result.isDone()) return;
            for (ByteBuffer buffer : buffers) {
                if (bytes.size() + buffer.remaining() > maxBytes) {
                    subscription.cancel();
                    result.completeExceptionally(new IcalFetchException("Feed exceeded size cap (" + maxBytes + " bytes)"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }

        @Override
        public void onError(Throwable throwable) {
            result.completeExceptionally(throwable);
        }

        @Override
        public void onComplete() {
            result.complete(bytes.toByteArray());
        }
    }
}
