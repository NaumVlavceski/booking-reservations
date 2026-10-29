package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.mail.EmailMessage;
import com.naumvlavceski.bookingbackend.mail.EmailService;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimiter;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Forgot password end-to-end through the real filter chain and Postgres schema. Mail is the only mock:
 * it stands in for the inbox the code is read from.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasswordResetIntegrationTest {
    private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");
    private static final String PASSWORD = "Pw-" + UUID.randomUUID();
    private static final String NEW_PASSWORD = "New-" + UUID.randomUUID();

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository appUsers;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean EmailService emailService;
    @MockitoSpyBean RateLimiter rateLimiter;

    // ---------- helpers ----------

    /** Each call comes from its own address unless one is given, so the per-IP limit only bites where tested. */
    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body, String ip) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        req.header("X-Forwarded-For", ip != null ? ip : UUID.randomUUID().toString());
        return mvc.perform(req);
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String body) throws Exception {
        return send(req, null, body, null);
    }

    private static String uniqueEmail() {
        return "pr_" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
    }

    /** A registered, verified account. */
    private String verifiedUser() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), "{\"contactPhone\":\"1\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Tester\"}").andExpect(status().isAccepted());
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
        return email;
    }

    private String forgot(String email) throws Exception {
        return send(post("/api/auth/forgot-password"), "{\"email\":\"" + email + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    /** The code from the newest reset email sent to this address. */
    private String emailedCode(String email) {
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeastOnce()).send(any(), eq("PASSWORD_RESET"), msg.capture());
        EmailMessage last = msg.getAllValues().stream().filter(m -> m.to().equals(email)).reduce((a, b) -> b).orElseThrow();
        Matcher m = CODE.matcher(last.text());
        assertTrue(m.find());
        return m.group(1);
    }

    private long resetEmailsTo(String email) {
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService, atLeast(0)).send(any(), eq("PASSWORD_RESET"), msg.capture());
        return msg.getAllValues().stream().filter(m -> m.to().equals(email)).count();
    }

    private ResultActions verifyCode(String email, String code) throws Exception {
        return send(post("/api/auth/verify-reset-code"), "{\"email\":\"" + email + "\",\"code\":\"" + code + "\"}");
    }

    private ResultActions reset(String token, String password) throws Exception {
        return send(post("/api/auth/reset-password"), "{\"resetToken\":\"" + token + "\",\"newPassword\":\"" + password + "\"}");
    }

    private ResultActions login(String email, String password) throws Exception {
        return send(post("/api/auth/login"), "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    private static String wrong(String code) {
        return code.equals("000000") ? "111111" : "000000";
    }

    // ---------- tests ----------

    @Test
    void unknownAndKnownAddressesGetTheSameAnswerAndOnlyRealAccountsGetMail() throws Exception {
        String known = verifiedUser();
        String unknown = "ghost-" + known;

        String a = forgot(known);
        String b = forgot(unknown);
        assertEquals(a, b);
        assertTrue(a.contains("If an account with this email exists, we sent a code."));
        assertEquals(1, resetEmailsTo(known));
        assertEquals(0, resetEmailsTo(unknown));

        // Wrong code for a real account and any code for an unknown one: the same single error
        String x = verifyCode(known, wrong(emailedCode(known))).andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();
        String y = verifyCode(unknown, "123456").andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();
        assertEquals((String) JsonPath.read(x, "$.message"), JsonPath.read(y, "$.message"));
        assertEquals((String) JsonPath.read(x, "$.code"), JsonPath.read(y, "$.code"));
        assertEquals("Invalid or expired code", JsonPath.read(x, "$.message"));
    }

    @Test
    void fullFlowChangesThePasswordEndsSessionsAndSpendsCodeAndToken() throws Exception {
        String email = verifiedUser();
        String oldSession = JsonPath.read(login(email, PASSWORD).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");

        forgot(email.toUpperCase()); // normalised like login
        String code = emailedCode(email);
        String body = verifyCode(email, code).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.resetToken");
        assertTrue(token.length() >= 43, "32+ random bytes");

        reset(token, NEW_PASSWORD).andExpect(status().isOk());

        login(email, PASSWORD).andExpect(status().isUnauthorized());
        login(email, NEW_PASSWORD).andExpect(status().isOk());
        send(get("/api/me"), oldSession, null, null).andExpect(status().isUnauthorized());
        verify(emailService).send(any(), eq("PASSWORD_CHANGED"), argThat(m -> m.to().equals(email)));

        // Neither the code nor the token works a second time
        verifyCode(email, code).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
        reset(token, "Another-" + NEW_PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESET_TOKEN_INVALID"));
        login(email, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test
    void fiveWrongGuessesKillTheCode() throws Exception {
        String email = verifiedUser();
        forgot(email);
        String code = emailedCode(email);
        for (int i = 0; i < 5; i++) {
            verifyCode(email, wrong(code)).andExpect(status().isBadRequest());
        }
        // 6th attempt, even with the right code
        verifyCode(email, code).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid or expired code"));
    }

    @Test
    void anExpiredCodeIsRefused() throws Exception {
        String email = verifiedUser();
        forgot(email);
        String code = emailedCode(email);
        UUID userId = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow().getId();
        jdbc.update("update password_reset set code_expires_at = now() - interval '1 second' where user_id = ?", userId);
        verifyCode(email, code).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid or expired code"));
    }

    @Test
    void anExpiredResetTokenIsRefused() throws Exception {
        String email = verifiedUser();
        forgot(email);
        String token = JsonPath.read(verifyCode(email, emailedCode(email)).andReturn().getResponse().getContentAsString(), "$.resetToken");
        UUID userId = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow().getId();
        jdbc.update("update password_reset set reset_token_expires_at = now() - interval '1 second' where user_id = ?", userId);
        reset(token, NEW_PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("RESET_TOKEN_INVALID"));
    }

    @Test
    void aWeakPasswordIsRefusedLikeRegistrationAndKeepsTheToken() throws Exception {
        String email = verifiedUser();
        forgot(email);
        String token = JsonPath.read(verifyCode(email, emailedCode(email)).andReturn().getResponse().getContentAsString(), "$.resetToken");

        reset(token, "short").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("New password size must be between 8 and 72"));
        reset(token, NEW_PASSWORD).andExpect(status().isOk());
    }

    @Test
    void registrationPasswordRuleIsUnchanged() throws Exception {
        send(post("/api/auth/register"), "{\"contactPhone\":\"1\",\"email\":\"" + uniqueEmail()
                + "\",\"password\":\"short\",\"fullName\":\"Tester\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Password size must be between 8 and 72"));
    }

    @Test
    void aSecondRequestWithinTheCooldownGetsTheSameAnswerButNoMail() throws Exception {
        String email = verifiedUser();
        String a = forgot(email);
        String b = forgot(email.toUpperCase()); // normalised, so the same address is still cooling down
        assertEquals(a, b);
        assertEquals(1, resetEmailsTo(email));
    }

    @Test
    void aNewCodeReplacesTheOlderOne() throws Exception {
        String email = verifiedUser();
        forgot(email);
        String first = emailedCode(email);

        // Step past the 60 s cooldown: the in-memory window for this address, and the stored request's age
        doReturn(true).when(rateLimiter).tryAcquire(eq("reset-cooldown:" + email), anyInt(), any());
        UUID userId = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow().getId();
        jdbc.update("update password_reset set created_at = created_at - interval '2 minutes' where user_id = ?", userId);
        forgot(email);
        assertEquals(2, resetEmailsTo(email));
        String second = emailedCode(email);

        if (!first.equals(second)) {
            verifyCode(email, first).andExpect(status().isBadRequest());
        }
        verifyCode(email, second).andExpect(status().isOk());
    }

    @Test
    void unverifiedAccountsGetNoCode() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), "{\"contactPhone\":\"1\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Tester\"}").andExpect(status().isAccepted());
        forgot(email);
        assertEquals(0, resetEmailsTo(email));
    }

    // ---------- change password (signed in) ----------

    private ResultActions changePassword(String token, String current, String next) throws Exception {
        return send(post("/api/me/password"), token,
                "{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}", null);
    }

    private String sessionFor(String email, String password) throws Exception {
        return JsonPath.read(login(email, password).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.token");
    }

    @Test
    void changePasswordKeepsThisDeviceAndSignsOutTheOthers() throws Exception {
        String email = verifiedUser();
        String here = sessionFor(email, PASSWORD);
        String elsewhere = sessionFor(email, PASSWORD);

        String body = changePassword(here, PASSWORD, NEW_PASSWORD).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String fresh = JsonPath.read(body, "$.token");

        send(get("/api/me"), fresh, null, null).andExpect(status().isOk());
        send(get("/api/me"), here, null, null).andExpect(status().isUnauthorized());
        send(get("/api/me"), elsewhere, null, null).andExpect(status().isUnauthorized());
        login(email, PASSWORD).andExpect(status().isUnauthorized());
        login(email, NEW_PASSWORD).andExpect(status().isOk());
        verify(emailService).send(any(), eq("PASSWORD_CHANGED"), argThat(m -> m.to().equals(email)));
    }

    @Test
    void changePasswordRefusesAWrongCurrentPasswordWith400AndKeepsTheSession() throws Exception {
        String email = verifiedUser();
        String token = sessionFor(email, PASSWORD);

        changePassword(token, "not-my-password", NEW_PASSWORD).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        changePassword(token, PASSWORD, "short").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("New password size must be between 8 and 72"));
        changePassword(token, PASSWORD, PASSWORD).andExpect(status().isBadRequest());
        send(get("/api/me"), token, null, null).andExpect(status().isOk());
        login(email, PASSWORD).andExpect(status().isOk());
    }

    @Test
    void changePasswordNeedsASignedInUserAndLimitsTries() throws Exception {
        changePassword(null, PASSWORD, NEW_PASSWORD).andExpect(status().isUnauthorized());

        String email = verifiedUser();
        String token = sessionFor(email, PASSWORD);
        for (int i = 0; i < 5; i++) {
            changePassword(token, "wrong-" + i, NEW_PASSWORD).andExpect(status().isBadRequest());
        }
        changePassword(token, PASSWORD, NEW_PASSWORD).andExpect(status().isTooManyRequests());
    }

    @Test
    void thePerIpLimitAnswers429WhateverTheAddress() throws Exception {
        String ip = UUID.randomUUID().toString();
        for (int i = 0; i < 5; i++) {
            send(post("/api/auth/forgot-password"), null, "{\"email\":\"" + uniqueEmail() + "\"}", ip)
                    .andExpect(status().isOk());
        }
        send(post("/api/auth/forgot-password"), null, "{\"email\":\"" + uniqueEmail() + "\"}", ip)
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void loginCountsAgainstThePerIpLimit() throws Exception {
        String ip = UUID.randomUUID().toString();
        send(post("/api/auth/login"), null, "{\"email\":\"" + uniqueEmail() + "\",\"password\":\"x\"}", ip)
                .andExpect(status().isUnauthorized());
        verify(rateLimiter).tryAcquire(eq("login:" + ip), anyInt(), any());
    }
}
