package com.naumvlavceski.bookingbackend.admin;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.service.OneTimeCodes;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** B1/B6: the emailed admin code and the admin session. */
@ExtendWith(OutputCaptureExtension.class)
class AdminStepUpAndSessionTest extends AdminTestBase {

    @Autowired AdminStepUpService stepUp;
    @Value("${app.auth.code-secret}") String codeSecret;

    private void requestCode(TestOwner admin) throws Exception {
        admin(post("/api/admin/auth/request-code"), admin, null, null).andExpect(status().isAccepted());
    }

    private org.springframework.test.web.servlet.ResultActions verify(TestOwner admin, String code) throws Exception {
        return admin(post("/api/admin/auth/verify-code"), admin, null, "{\"code\":\"" + code + "\"}");
    }

    private void endCooldown(TestOwner admin) {
        jdbc.update("UPDATE admin_stepup_code SET created_at = created_at - interval '61 seconds' WHERE user_id = ?",
                userId(admin));
    }

    // ---------- the code ----------

    @Test
    void theCodeOpensASessionOnceAndIsNeverShown(CapturedOutput output) throws Exception {
        TestOwner admin = newAdmin();
        String requested = body(admin(post("/api/admin/auth/request-code"), admin, null, null)
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.sentTo").value(org.hamcrest.Matchers.containsString("•••••"))));
        String verified = body(verify(admin, CODE).andExpect(status().isOk()));
        verify(admin, CODE).andExpect(status().isBadRequest()); // single use

        assertFalse(requested.contains(CODE));
        assertFalse(verified.contains(CODE));
        Thread.sleep(300); // the email goes out after commit, on the mail thread
        assertFalse(output.getAll().contains(CODE), "the code is never logged");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT * FROM email_log WHERE lower(to_address) = lower(?) AND type = 'ADMIN_STEP_UP'", admin.email());
        assertEquals(1, rows.size(), "the code email is logged");
        assertFalse(rows.getFirst().toString().contains(CODE), "no email_log column holds the code");
        assertEquals(null, rows.getFirst().get("body"));
        assertFalse(jdbc.queryForList("SELECT code_hash FROM admin_stepup_code WHERE user_id = ?", userId(admin))
                .toString().contains(CODE), "stored hashed");
    }

    @Test
    void purposeBindingBothWays() throws Exception {
        TestOwner admin = newAdmin();
        UUID id = userId(admin);
        // A registration-style code (email_verification) never opens the admin panel
        jdbc.update("INSERT INTO email_verification (user_id, code_hash, expires_at, attempts, created_at) "
                        + "VALUES (?, ?, now() + interval '10 minutes', 0, now())",
                id, new OneTimeCodes(codeSecret).hash(id, CODE));
        verify(admin, CODE).andExpect(status().isBadRequest());

        // An admin code never verifies an email address: the registration check doesn't read admin codes
        jdbc.update("DELETE FROM email_verification WHERE user_id = ?", id);
        endCooldownAll(id);
        requestCode(admin);
        jdbc.update("UPDATE app_user SET email_verified_at = NULL WHERE id = ?", id);
        send(post("/api/auth/verify-email"), null, "{\"email\":\"" + admin.email() + "\",\"code\":\"" + CODE + "\"}")
                .andExpect(status().isBadRequest());

        // The hashes themselves differ by purpose and from the registration hash
        assertNotEquals(stepUp.hash(id, "ADMIN_STEP_UP", CODE), stepUp.hash(id, "OTHER", CODE));
        assertNotEquals(stepUp.hash(id, "ADMIN_STEP_UP", CODE), new OneTimeCodes(codeSecret).hash(id, CODE));
    }

    private void endCooldownAll(UUID id) {
        jdbc.update("UPDATE admin_stepup_code SET created_at = created_at - interval '61 seconds' WHERE user_id = ?", id);
    }

    @Test
    void anExpiredCodeFails() throws Exception {
        TestOwner admin = newAdmin();
        requestCode(admin);
        jdbc.update("UPDATE admin_stepup_code SET expires_at = now() - interval '1 second' WHERE user_id = ?", userId(admin));
        verify(admin, CODE).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
    }

    @Test
    void fiveWrongTriesUseTheCodeUp() throws Exception {
        TestOwner admin = newAdmin();
        requestCode(admin);
        for (int i = 0; i < 5; i++) verify(admin, "000000").andExpect(status().isBadRequest());
        verify(admin, CODE).andExpect(status().isBadRequest()); // the right code no longer works
    }

    @Test
    void resendCooldownAndHourlyLimit() throws Exception {
        TestOwner admin = newAdmin();
        requestCode(admin);
        admin(post("/api/admin/auth/request-code"), admin, null, null).andExpect(status().isTooManyRequests());
        for (int i = 0; i < 4; i++) {
            endCooldown(admin);
            requestCode(admin);
        }
        endCooldown(admin);
        admin(post("/api/admin/auth/request-code"), admin, null, null).andExpect(status().isTooManyRequests());
        assertEquals(5, jdbc.queryForObject("SELECT count(*) FROM admin_stepup_code WHERE user_id = ?", Integer.class,
                userId(admin)));
    }

    @Test
    void tenWrongTriesLockTheStepUpFor15Minutes() throws Exception {
        TestOwner admin = newAdmin();
        UUID id = userId(admin);
        for (int round = 0; round < 2; round++) {
            endCooldown(admin);
            requestCode(admin);
            for (int i = 0; i < 5; i++) {
                int expected = round == 1 && i == 4 ? 429 : 400;
                assertEquals(expected, verify(admin, "000000").andReturn().getResponse().getStatus());
            }
        }
        Instant until = jdbc.queryForObject("SELECT admin_stepup_locked_until FROM app_user WHERE id = ?",
                java.sql.Timestamp.class, id).toInstant();
        assertTrue(until.isAfter(Instant.now().plusSeconds(14 * 60)));
        endCooldown(admin);
        admin(post("/api/admin/auth/request-code"), admin, null, null).andExpect(status().isTooManyRequests());
        verify(admin, CODE).andExpect(status().isTooManyRequests());
        List<String> actions = jdbc.queryForList("SELECT action FROM admin_audit_log WHERE admin_user_id = ?",
                String.class, id);
        assertEquals(10, actions.stream().filter(AdminAuditService.STEPUP_FAILED::equals).count());
        assertTrue(actions.contains(AdminAuditService.STEPUP_LOCKED));
        assertTrue(actions.contains(AdminAuditService.STEPUP_REQUESTED));
    }

    // ---------- the session ----------

    @Test
    void windowExtendAndAbsoluteCap() throws Exception {
        TestOwner admin = newAdmin();
        String opened = body(admin(post("/api/admin/auth/request-code"), admin, null, null)
                .andExpect(status().isAccepted()));
        assertTrue(opened.contains("sentTo"));
        String json = body(verify(admin, CODE).andExpect(status().isOk()));
        String session = JsonPath.read(json, "$.sessionToken");
        Instant expires = Instant.parse(JsonPath.read(json, "$.expiresAt"));
        Instant max = Instant.parse(JsonPath.read(json, "$.maxExpiresAt"));
        long window = expires.getEpochSecond() - Instant.now().getEpochSecond();
        assertTrue(window > 29 * 60 && window <= 30 * 60, "30-minute window");
        assertTrue(max.isAfter(Instant.now().plusSeconds(8 * 3600 - 60)), "8-hour cap");

        // Ordinary use does not move the expiry
        admin(get("/api/admin/overview"), admin, session, null).andExpect(status().isOk());
        assertEquals(expires, sessionExpiry(admin, session));

        // Continue gives a new window from now
        jdbc.update("UPDATE admin_session SET expires_at = now() + interval '1 minute' WHERE token_hash = ?",
                AdminSessionService.hash(session));
        String extended = body(admin(post("/api/admin/auth/extend"), admin, session, null).andExpect(status().isOk()));
        assertTrue(Instant.parse(JsonPath.read(extended, "$.expiresAt")).isAfter(Instant.now().plusSeconds(29 * 60)));

        // At the cap it is refused
        jdbc.update("UPDATE admin_session SET max_expires_at = now() + interval '5 minutes', "
                + "expires_at = now() + interval '5 minutes' WHERE token_hash = ?", AdminSessionService.hash(session));
        admin(post("/api/admin/auth/extend"), admin, session, null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_SESSION_CAP"));

        // And it ends on its own at expiry
        jdbc.update("UPDATE admin_session SET expires_at = now() - interval '1 second' WHERE token_hash = ?",
                AdminSessionService.hash(session));
        admin(get("/api/admin/overview"), admin, session, null).andExpect(status().isForbidden());
    }

    private Instant sessionExpiry(TestOwner admin, String session) throws Exception {
        return Instant.parse(JsonPath.read(body(admin(get("/api/admin/auth/session"), admin, session, null)
                .andExpect(status().isOk())), "$.expiresAt"));
    }

    @Test
    void logOutOfAdminKeepsTheOwnerSignedIn() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        admin(post("/api/admin/auth/logout"), admin, session, null).andExpect(status().isNoContent());
        admin(get("/api/admin/overview"), admin, session, null).andExpect(status().isForbidden());
        send(get("/api/me"), admin.token(), null).andExpect(status().isOk());
        assertTrue(jdbc.queryForList("SELECT action FROM admin_audit_log WHERE admin_user_id = ?", String.class,
                userId(admin)).contains(AdminAuditService.SESSION_ENDED));
    }

    @Test
    void ownerLogoutEndsTheAdminSession() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        send(post("/api/auth/logout"), admin.token(), null).andExpect(status().isNoContent());
        TestOwner again = new TestOwner(admin.email(), admin.password(), login(admin.email(), admin.password()));
        admin(get("/api/admin/overview"), again, session, null).andExpect(status().isForbidden());
    }

    @Test
    void aPasswordChangeEndsTheAdminSession() throws Exception {
        TestOwner admin = newAdmin();
        String session = openSession(admin);
        String json = body(send(post("/api/me/password"), admin.token(),
                "{\"currentPassword\":\"" + admin.password() + "\",\"newPassword\":\"New-pass-" + UUID.randomUUID() + "\"}")
                .andExpect(status().isOk()));
        TestOwner renewed = new TestOwner(admin.email(), null, JsonPath.read(json, "$.token"));
        admin(get("/api/admin/overview"), renewed, session, null).andExpect(status().isForbidden());
    }
}
