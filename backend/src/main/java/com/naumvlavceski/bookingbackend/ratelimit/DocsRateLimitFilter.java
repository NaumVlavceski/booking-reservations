package com.naumvlavceski.bookingbackend.ratelimit;

import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;

/**
 * Per-IP limit (app.rate-limit.docs-per-ip) on the API documentation: the spec and Swagger UI's files are served by
 * springdoc, not by our controllers, so the limit is applied here. Every other path passes straight through.
 * Refusals look like every other 429 of the API (code RATE_LIMITED, Retry-After).
 */
@Component
@RequiredArgsConstructor
public class DocsRateLimitFilter extends OncePerRequestFilter {
    private final RateLimits rateLimits;

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !(path.equals("/v3/api-docs") || path.startsWith("/v3/api-docs/")
                || path.equals("/swagger-ui.html") || path.startsWith("/swagger-ui/"));
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        long wait = rateLimits.acquire("docs:" + RateLimits.clientIp(request), rateLimits.limits().docsPerIp());
        if (wait == 0) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(wait));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String message = new TooManyRequestsException(wait).getMessage(); // plain ASCII, nothing to escape
        response.getWriter().write("{\"timestamp\":\"" + Instant.now() + "\",\"status\":429,"
                + "\"error\":\"Too Many Requests\",\"message\":\"" + message + "\","
                + "\"code\":\"RATE_LIMITED\",\"retryAfterSeconds\":" + wait + "}");
    }
}
