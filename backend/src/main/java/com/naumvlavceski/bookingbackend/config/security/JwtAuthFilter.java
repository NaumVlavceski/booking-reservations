package com.naumvlavceski.bookingbackend.config.security;

import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String REFRESHED_TOKEN_HEADER = "X-Refreshed-Token";
    public static final String BACKGROUND_HEADER = "X-Background";

    private final JwtService jwtService;
    private final AppUserRepository appUserRepository;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header == null || !header.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        Optional<Claims> claimsOpt = jwtService.parse(header.substring(7));
        if (claimsOpt.isEmpty()) {
            filterChain.doFilter(request, response);
            return;
        }

        Claims claims = claimsOpt.get();
        String email = claims.getSubject();

        if (email != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            Optional<AppUser> userOpt = appUserRepository.findByEmail(email);

            if (userOpt.isPresent() && userOpt.get().isActive() && userOpt.get().getEmailVerifiedAt() != null
                    && jwtService.isSessionValid(claims, userOpt.get())) {
                AppUser user = userOpt.get();

                CurrentUser currentUser = new CurrentUser(
                        user.getId(),
                        user.getOwner().getId(),
                        user.getEmail(),
                        user.getRole().name()
                );

                var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
                var authToken = new UsernamePasswordAuthenticationToken(currentUser, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(authToken);

                if (!"true".equalsIgnoreCase(request.getHeader(BACKGROUND_HEADER))) {
                    jwtService.renewIfDue(claims, user)
                            .ifPresent(renewed -> response.setHeader(REFRESHED_TOKEN_HEADER, renewed));
                }
            }
        }

        filterChain.doFilter(request, response);
    }
}
