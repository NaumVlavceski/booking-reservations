package com.naumvlavceski.bookingbackend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Audit finding SEC-05: no request body was limited, so anyone could make the API read and parse 100 MB on the
 * public sign-in endpoint. Bodies over the limit are refused with 413 before anything reads them; a body sent
 * without Content-Length is cut off at the limit while it is read (and ends as a 400). Sign-in and other
 * /api/auth calls carry a few small fields; the largest legitimate body elsewhere is a 5,000-character message.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

    private final long authLimit;
    private final long defaultLimit;

    public RequestSizeLimitFilter(@Value("${app.request-limit.auth-bytes:16384}") long authLimit,
                                  @Value("${app.request-limit.default-bytes:262144}") long defaultLimit) {
        this.authLimit = authLimit;
        this.defaultLimit = defaultLimit;
    }

    long limitFor(String path) {
        return path != null && path.startsWith("/api/auth/") ? authLimit : defaultLimit;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long limit = limitFor(request.getRequestURI());
        long declared = request.getContentLengthLong();
        if (declared > limit) {
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"timestamp\":\"" + Instant.now() + "\",\"status\":413,"
                    + "\"error\":\"Content Too Large\",\"message\":\"The request is too large.\",\"code\":\"PAYLOAD_TOO_LARGE\"}");
            return;
        }
        chain.doFilter(declared < 0 ? new Capped(request, limit) : request, response);
    }

    /** For bodies without Content-Length (chunked): reading past the limit fails. */
    private static final class Capped extends HttpServletRequestWrapper {
        private final long limit;

        Capped(HttpServletRequest request, long limit) {
            super(request);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream in = super.getInputStream();
            return new ServletInputStream() {
                private long read;

                private void count(long n) throws IOException {
                    if (n > 0 && (read += n) > limit) throw new IOException("Request body over " + limit + " bytes");
                }

                @Override public int read() throws IOException {
                    int b = in.read();
                    if (b >= 0) count(1);
                    return b;
                }

                @Override public int read(byte[] buf, int off, int len) throws IOException {
                    int n = in.read(buf, off, len);
                    count(n);
                    return n;
                }

                @Override public boolean isFinished() { return in.isFinished(); }
                @Override public boolean isReady() { return in.isReady(); }
                @Override public void setReadListener(ReadListener listener) { in.setReadListener(listener); }
            };
        }
    }
}
