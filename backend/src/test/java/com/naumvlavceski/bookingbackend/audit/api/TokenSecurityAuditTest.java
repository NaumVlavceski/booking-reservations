package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 4 token handling (JwtService / JwtAuthFilter): which tokens are accepted, which are refused, when a renewed
 * token is handed out, and what "signing out" does. Tokens are built with jjwt and the test profile's secret.
 * Test timeouts: idle 30 min, absolute 24 h, renew when less than 50% of the idle time is left.
 */
class TokenSecurityAuditTest extends ApiAuditBase {

    private static final long MIN = 60_000L;
    private static final long IDLE = 30 * MIN;
    private static final long ABSOLUTE = 24 * 60 * MIN;

    private static Claims claimsOf(String token) {
        return Jwts.parser().verifyWith(Keys.hmacShaKeyFor(TEST_JWT_SECRET.getBytes())).build()
                .parseSignedClaims(token).getPayload();
    }

    @Test
    void issuedTokenCarriesOnlyTheDocumentedClaimsAndNoSecrets() throws Exception {
        TestOwner o = newOwner();
        Claims c = claimsOf(o.token());
        assertEquals(java.util.Set.of("sub", "userId", "ownerId", "role", "sid_iat", "tv", "iat", "exp"), c.keySet());
        assertEquals(o.email(), c.getSubject());
        long life = c.getExpiration().getTime() - c.getIssuedAt().getTime();
        assertTrue(life <= IDLE && life > IDLE - MIN, "token lifetime = idle timeout, was " + life);
        // HMAC with a key from the secret: the header names an HS algorithm, never 'none'
        String header = new String(java.util.Base64.getUrlDecoder().decode(o.token().split("\\.")[0]));
        assertTrue(header.matches(".*\"alg\":\"HS(256|384|512)\".*"), header);
    }

    @Test
    void absoluteTimeoutEndsTheSessionEvenWithAFreshExpiry() throws Exception {
        TestOwner o = newOwner();
        long now = System.currentTimeMillis();
        String old = tokenFor(o.email(), now - ABSOLUTE - MIN, now + 10 * MIN, 0);
        send(get("/api/me"), old, null).andExpect(status().isUnauthorized());
        String young = tokenFor(o.email(), now - ABSOLUTE + 10 * MIN, now + 5 * MIN, 0);
        send(get("/api/me"), young, null).andExpect(status().isOk());
    }

    @Test
    void renewedTokenIsHandedOutNearExpiryButNotToBackgroundCallsAndNeverPastTheAbsoluteLimit() throws Exception {
        TestOwner o = newOwner();
        long now = System.currentTimeMillis();
        // fresh token: no renewal
        send(get("/api/me"), o.token(), null).andExpect(status().isOk()).andExpect(header().doesNotExist("X-Refreshed-Token"));

        String nearExpiry = tokenFor(o.email(), now - 60 * MIN, now + 5 * MIN, 0);
        String renewed = send(get("/api/me"), nearExpiry, null).andExpect(status().isOk())
                .andExpect(header().exists("X-Refreshed-Token")).andReturn().getResponse().getHeader("X-Refreshed-Token");
        Claims rc = claimsOf(renewed);
        assertEquals((now - 60 * MIN) / 1000, ((Number) rc.get("sid_iat")).longValue(), "session start is kept");
        assertTrue(rc.getExpiration().getTime() > now + 25 * MIN);
        send(get("/api/me"), renewed, null).andExpect(status().isOk());

        // polling calls marked X-Background never extend the session
        send(get("/api/me").header("X-Background", "true"), nearExpiry, null).andExpect(status().isOk())
                .andExpect(header().doesNotExist("X-Refreshed-Token"));

        // two minutes before the absolute limit: the renewed token ends at the limit, not 30 min later
        long start = now - ABSOLUTE + 2 * MIN;
        String almostOver = tokenFor(o.email(), start, now + MIN, 0);
        String last = send(get("/api/me"), almostOver, null).andExpect(status().isOk())
                .andReturn().getResponse().getHeader("X-Refreshed-Token");
        if (last != null) assertTrue(claimsOf(last).getExpiration().getTime() <= start + ABSOLUTE + 1000);

        // a refused request never carries a renewed token
        send(get("/api/me"), tokenFor(o.email(), now - 60 * MIN, now + 5 * MIN, 7), null)
                .andExpect(status().isUnauthorized()).andExpect(header().doesNotExist("X-Refreshed-Token"));
    }

    @Test
    void oldTokenVersionDeletedUnverifiedAndDisabledUsersAreRefused() throws Exception {
        long now = System.currentTimeMillis();
        TestOwner o = newOwner();
        send(get("/api/me"), tokenFor(o.email(), now, now + 10 * MIN, 1), null).andExpect(status().isUnauthorized());
        send(get("/api/me"), tokenFor(o.email(), now, now + 10 * MIN, -1), null).andExpect(status().isUnauthorized());

        // unverified: a correctly signed token for a user who never verified the address
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, "{\"email\":\"" + email + "\",\"password\":\"Pw-unverified-1\","
                + "\"fullName\":\"U\"," + ACCEPT_TERMS + "}").andExpect(status().isAccepted());
        send(get("/api/me"), tokenFor(email, now, now + 10 * MIN, 0), null).andExpect(status().isUnauthorized());

        // disabled: the existing token stops working at once
        TestOwner d = newOwner();
        jdbc.update("UPDATE app_user SET active = false WHERE lower(email) = lower(?)", d.email());
        send(get("/api/properties"), d.token(), null).andExpect(status().isUnauthorized());

        // deleted, then the same address registered again: the old token (other userId) does not open the new account
        TestOwner gone = newOwner();
        send(post("/api/me/delete"), gone.token(), "{\"password\":\"" + gone.password() + "\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isNoContent());
        send(get("/api/me"), gone.token(), null).andExpect(status().isUnauthorized());
        send(post("/api/auth/register"), null, "{\"email\":\"" + gone.email() + "\",\"password\":\"Pw-second-life-1\","
                + "\"fullName\":\"New\"," + ACCEPT_TERMS + "}").andExpect(status().isAccepted());
        markVerified(gone.email());
        send(get("/api/me"), gone.token(), null).andExpect(status().isUnauthorized());
    }

    @Test
    void ownerIdAndRoleClaimsAreIgnoredAndUserIdMustMatchTheSubject() throws Exception {
        TestOwner a = newOwner();
        TestOwner b = newOwner();
        createProperty(b.token(), "B only", 1);
        long now = System.currentTimeMillis();
        var userA = appUsers.findFirstByEmailIgnoreCase(a.email()).orElseThrow();
        var userB = appUsers.findFirstByEmailIgnoreCase(b.email()).orElseThrow();

        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", userA.getId().toString());
        claims.put("ownerId", ownerIdOf(b.email()).toString()); // B's tenant in A's token
        claims.put("role", "ADMIN");
        claims.put("sid_iat", now / 1000);
        claims.put("tv", 0);
        String bent = jwt(TEST_JWT_SECRET, claims, a.email(), new Date(now), new Date(now + 10 * MIN));
        send(get("/api/properties"), bent, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

        claims.put("userId", userB.getId().toString()); // subject A, user id B
        claims.put("ownerId", ownerIdOf(a.email()).toString());
        send(get("/api/me"), jwt(TEST_JWT_SECRET, claims, a.email(), new Date(now), new Date(now + 10 * MIN)), null)
                .andExpect(status().isUnauthorized());
    }

    @Test
    void oddTokenFormsAreRefusedAndNeverCauseServerErrors() throws Exception {
        TestOwner o = newOwner();
        long now = System.currentTimeMillis();
        String uid = appUsers.findFirstByEmailIgnoreCase(o.email()).orElseThrow().getId().toString();
        // only accepted from the Authorization header, case-sensitive "Bearer "
        send(get("/api/me").param("access_token", o.token()), null, null).andExpect(status().isUnauthorized());
        send(get("/api/me").param("token", o.token()), null, null).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "bearer " + o.token())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer  " + o.token())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").cookie(new jakarta.servlet.http.Cookie("token", o.token()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + "A".repeat(20_000))).andExpect(status().isUnauthorized());

        // signed with the real secret but without a subject: refused
        String noSubject = jwt(TEST_JWT_SECRET, Map.of("userId", uid, "tv", 0), null, new Date(now), new Date(now + 10 * MIN));
        send(get("/api/me"), noSubject, null).andExpect(status().isUnauthorized());
    }

    @Test
    void validlySignedTokensWithBrokenClaimsAreRefusedNotServerErrors() throws Exception {
        // Info (defence in depth, see report): a token signed with the real secret but without "exp" makes
        // JwtService.renewIfDue throw a NullPointerException inside JwtAuthFilter (MockMvc shows the exception), and
        // a non-numeric "tv" a RequiredTypeException. On a real server the exception goes to the container's error
        // dispatch, which ends as 401 for the then-anonymous caller. Only a holder of APP_JWT_SECRET can mint these.
        TestOwner o = newOwner();
        long now = System.currentTimeMillis();
        String uid = appUsers.findFirstByEmailIgnoreCase(o.email()).orElseThrow().getId().toString();
        String withoutExpiry = Jwts.builder().subject(o.email()).claims(Map.of("userId", uid, "sid_iat", now / 1000, "tv", 0))
                .signWith(Keys.hmacShaKeyFor(TEST_JWT_SECRET.getBytes())).compact();
        String badTv = jwt(TEST_JWT_SECRET, Map.of("userId", uid, "sid_iat", now / 1000, "tv", "zero"), o.email(),
                new Date(now), new Date(now + 10 * MIN));
        HttpResponse<String> r1 = live("GET", "/api/me", withoutExpiry, null, null);
        HttpResponse<String> r2 = live("GET", "/api/me", badTv, null, null);
        System.out.println("AUDIT-OBS token without exp -> " + r1.statusCode() + ", tv as string -> " + r2.statusCode());
        assertAll(() -> assertTrue(r1.statusCode() < 500, "no exp -> " + r1.statusCode()),
                () -> assertTrue(r2.statusCode() < 500, "tv string -> " + r2.statusCode()));
    }

    @Test
    void noCookiesOrServerSessionsAreCreatedSoSessionFixationDoesNotApply() throws Exception {
        TestOwner o = newOwner();
        var login = sendFrom(randomIp(), post("/api/auth/login"), null,
                "{\"email\":\"" + o.email() + "\",\"password\":\"" + o.password() + "\"}").andReturn();
        assertTrue(login.getResponse().getHeaders("Set-Cookie").isEmpty());
        assertNull(login.getRequest().getSession(false), "login created an HTTP session");
        var me = send(get("/api/me"), o.token(), null).andReturn();
        assertTrue(me.getResponse().getHeaders("Set-Cookie").isEmpty());
        assertNull(me.getRequest().getSession(false));
        HttpResponse<String> live = live("GET", "/api/me", o.token(), null, null);
        assertEquals(200, live.statusCode());
        assertTrue(live.headers().allValues("Set-Cookie").isEmpty(), "Set-Cookie on a real response");
    }

    @Test
    void signingOutEndsTheSessionOnTheServer() throws Exception {
        // Finding API-03 (S3), FIXED: POST /api/auth/logout bumps token_version (owner's decision: every device).
        // Before, "sign out" only forgot the token in the browser; a copied token kept working until it expired.
        TestOwner o = newOwner();
        String otherDevice = login(o.email(), o.password());
        int status = send(post("/api/auth/logout"), o.token(), null).andReturn().getResponse().getStatus();
        assertTrue(status == 204 || status == 200, "logout endpoint answered " + status);
        send(get("/api/me"), o.token(), null).andExpect(status().isUnauthorized());
        send(get("/api/me"), otherDevice, null).andExpect(status().isUnauthorized());
        // Signing in again works as usual
        send(get("/api/me"), login(o.email(), o.password()), null).andExpect(status().isOk());
    }

    @Test
    void signingOutNeedsAValidSession() throws Exception {
        // Replaces the documentation test of the old behaviour (no logout endpoint at all)
        send(post("/api/auth/logout"), null, null).andExpect(status().isUnauthorized());
        send(post("/api/auth/logout"), "not-a-token", null).andExpect(status().isUnauthorized());
        TestOwner o = newOwner();
        send(get("/api/me"), o.token(), null).andExpect(status().isOk());
        assertEquals(o.email(), JsonPath.read(body(send(get("/api/me"), o.token(), null)), "$.email"));
        assertNotNull(UUID.randomUUID());
    }
}
