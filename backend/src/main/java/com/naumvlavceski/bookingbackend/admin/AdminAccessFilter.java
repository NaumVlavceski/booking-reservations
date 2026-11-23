package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.config.security.CurrentUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The single gate for /api/admin/** (runs in the security chain right after JwtAuthFilter). In order:
 * <ol>
 *   <li>APP_ADMIN_ENABLED=false: 404 for everything.</li>
 *   <li>No valid owner session, or {@code is_admin} is not true in the database (checked on every request, so unsetting
 *       the flag works at once): 404, so the routes don't reveal they exist.</li>
 *   <li>The step-up endpoints (request-code, verify-code, logout) need nothing more.</li>
 *   <li>Everything else needs a live admin session ({@code X-Admin-Session}) of this user, opened with the user's current
 *       token_version: otherwise 403 {@code ADMIN_SESSION_REQUIRED}, which the panel answers with the code dialog.</li>
 * </ol>
 * Every admin answer carries {@code Cache-Control: no-store}; answers with a session carry its expiry
 * ({@code X-Admin-Session-Expires}, {@code X-Admin-Session-Max}) so the countdown re-syncs on each response.
 */
@Component
public class AdminAccessFilter extends OncePerRequestFilter {
    public static final String PREFIX = "/api/admin";
    public static final String EXPIRES_HEADER = "X-Admin-Session-Expires";
    public static final String MAX_HEADER = "X-Admin-Session-Max";
    static final Set<String> STEP_UP_PATHS = Set.of(
            PREFIX + "/auth/request-code", PREFIX + "/auth/verify-code", PREFIX + "/auth/logout");

    private final AdminProperties props;
    private final JdbcTemplate jdbc;
    private final AdminSessionService sessions;

    public AdminAccessFilter(AdminProperties props, JdbcTemplate jdbc, AdminSessionService sessions) {
        this.props = props;
        this.jdbc = jdbc;
        this.sessions = sessions;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return !(path.equals(PREFIX) || path.startsWith(PREFIX + "/"));
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        // Preflight: CORS is answered by the CorsFilter before this one; nothing else to check
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        if (!props.enabled()) {
            error(response, 404, "Not found", "NOT_FOUND");
            return;
        }
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof CurrentUser user)) {
            error(response, 404, "Not found", "NOT_FOUND");
            return;
        }
        List<Integer> version = jdbc.query("SELECT token_version FROM app_user WHERE id = ? AND is_admin = TRUE",
                (rs, i) -> rs.getInt(1), user.userId());
        if (version.isEmpty()) {
            error(response, 404, "Not found", "NOT_FOUND");
            return;
        }

        Optional<AdminSessionService.Session> session =
                sessions.find(request.getHeader(AdminSessionService.HEADER), user.userId(), version.getFirst());
        if (session.isEmpty() && !STEP_UP_PATHS.contains(request.getRequestURI())) {
            error(response, 403, "Please confirm the emailed admin code again.", "ADMIN_SESSION_REQUIRED");
            return;
        }
        session.ifPresent(s -> expiryHeaders(response, s.expiresAt(), s.maxExpiresAt()));
        request.setAttribute(AdminContext.ATTRIBUTE, new AdminContext(user.userId(), user.ownerId(), user.email(),
                session.orElse(null)));
        chain.doFilter(request, response);
    }

    public static void expiryHeaders(HttpServletResponse response, Instant expires, Instant max) {
        response.setHeader(EXPIRES_HEADER, expires.toString());
        response.setHeader(MAX_HEADER, max.toString());
    }

    private static void error(HttpServletResponse response, int status, String message, String code) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"timestamp\":\"" + Instant.now() + "\",\"status\":" + status + ",\"error\":\""
                + (status == 404 ? "Not Found" : "Forbidden") + "\",\"message\":\"" + message + "\",\"code\":\"" + code + "\"}");
    }

    /** What the admin controllers get from the gate. {@code session} is null only on the step-up endpoints. */
    public record AdminContext(UUID userId, UUID ownerId, String email, AdminSessionService.Session session) {
        public static final String ATTRIBUTE = AdminContext.class.getName();
    }
}
