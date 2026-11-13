package com.naumvlavceski.bookingbackend.config;

import com.naumvlavceski.bookingbackend.config.security.JwtAuthFilter;
import com.naumvlavceski.bookingbackend.config.security.UnauthorizedEntryPoint;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final UnauthorizedEntryPoint unauthorizedEntryPoint;

    @Value("${springdoc.api-docs.enabled:false}")
    private boolean apiDocsEnabled;

    // Audit SEC-03: the allowed origins come from APP_CORS_ALLOWED_ORIGINS (app.cors.allowed-origins), exact matches
    // only. The old Netlify site and its deploy previews are gone; the Vite dev server is added for "local" only.
    @Value("${app.cors.allowed-origins}")
    private List<String> configuredOrigins;

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.core.env.Environment environment;

    List<String> allowedOrigins() {
        List<String> origins = new java.util.ArrayList<>();
        for (String origin : configuredOrigins) {
            String o = origin.trim();
            if (o.isEmpty()) continue;
            if (o.contains("*")) throw new IllegalStateException("APP_CORS_ALLOWED_ORIGINS must list exact origins, no '*'");
            origins.add(o.endsWith("/") ? o.substring(0, o.length() - 1) : o);
        }
        if (environment.acceptsProfiles(org.springframework.core.env.Profiles.of("local"))) {
            origins.add("http://localhost:5173");
        }
        return List.copyOf(origins);
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors->cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                // Audit SEC-07. Spring already sends nosniff, X-Frame-Options and Cache-Control: no-store. The API only
                // answers JSON, files and two small HTML pages (unsubscribe), so nothing may load or frame it; the
                // Swagger UI (off unless APP_DOCS_ENABLED) needs its own scripts, so it is left out of the CSP.
                .headers(headers -> headers
                        .referrerPolicy(r -> r.policy(org.springframework.security.web.header.writers
                                .ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                request -> !request.getRequestURI().startsWith("/swagger-ui")
                                        && !request.getRequestURI().startsWith("/v3/api-docs"),
                                new org.springframework.security.web.header.writers.StaticHeadersWriter(
                                        "Content-Security-Policy",
                                        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"))))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(unauthorizedEntryPoint))
                .authorizeHttpRequests(auth -> {
                    // API-03: signing out needs the session it ends (first match wins, before /api/auth/** below)
                    auth.requestMatchers(org.springframework.http.HttpMethod.POST, "/api/auth/logout").authenticated();
                    auth.requestMatchers(
                            "/api/auth/**",
                            "/api/contact",
                            "/actuator/health",
                            "/api/health",
                            "/api/ical/**",
                            "/api/notifications/unsubscribe"
                    ).permitAll();
                    // app.docs.enabled (APP_DOCS_ENABLED) drives springdoc.api-docs.enabled, see application.yml
                    if (apiDocsEnabled) auth.requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll();
                    auth.anyRequest().authenticated();
                })
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setExposedHeaders(List.of(JwtAuthFilter.REFRESHED_TOKEN_HEADER, HttpHeaders.CONTENT_DISPOSITION));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

}