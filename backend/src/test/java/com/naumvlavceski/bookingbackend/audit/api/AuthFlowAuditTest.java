package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 4 auth flows: password storage and rules, lockout, user enumeration (answers and rough timing), reset codes
 * and tokens, email verification codes, and the pre-account hijack (S1).
 */
class AuthFlowAuditTest extends ApiAuditBase {

    private static String registerJson(String email, String password, String name) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"fullName\":\"" + name + "\"," + ACCEPT_TERMS + "}";
    }

    private ResultActions loginFrom(String ip, String email, String password) throws Exception {
        return sendFrom(ip, post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    @Test
    void passwordsAreStoredAsBcryptStrength10AndNeverInPlainText() throws Exception {
        TestOwner o = newOwner();
        String hash = jdbc.queryForObject("SELECT password_hash FROM app_user WHERE lower(email)=lower(?)", String.class, o.email());
        assertTrue(hash.matches("^\\$2[aby]\\$10\\$[./A-Za-z0-9]{53}$"), "not a BCrypt-10 hash: " + hash.substring(0, 7));
        assertFalse(hash.contains(o.password()));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM email_verification WHERE code_hash ~ '^[0-9]{6}$'", Integer.class),
                "a verification code is stored in clear");
    }

    @Test
    void passwordLengthRulesAreEnforcedOnRegisterResetAndChange() throws Exception {
        for (String bad : new String[]{"short7!", "        ", "x".repeat(73)}) {
            String r = body(send(post("/api/auth/register"), null, registerJson(uniqueEmail(), bad, "N")).andExpect(status().isBadRequest()));
            assertEquals("VALIDATION_FAILED", JsonPath.read(r, "$.code"));
            assertNotNull(JsonPath.read(r, "$.fieldErrors.password"));
        }
        send(post("/api/auth/register"), null, registerJson(uniqueEmail(), "exactly8", "N")).andExpect(status().isAccepted());
        send(post("/api/auth/register"), null, registerJson(uniqueEmail(), "y".repeat(72), "N")).andExpect(status().isAccepted());
        // 36 Cyrillic letters = 72 bytes: accepted and usable
        String email = uniqueEmail();
        String cyr36 = "ж".repeat(36);
        send(post("/api/auth/register"), null, registerJson(email, cyr36, "Марија")).andExpect(status().isAccepted());
        markVerified(email);
        loginFrom(randomIp(), email, cyr36).andExpect(status().isOk());
        TestOwner o = newOwner();
        send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + o.password() + "\",\"newPassword\":\"short\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        send(post("/api/auth/reset-password"), null, "{\"resetToken\":\"x\",\"newPassword\":\"short\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void cyrillicPasswordsAreLimitedBy72BytesWithAMessageThatSaysSo() throws Exception {
        // API-02: 36 Cyrillic letters = 72 bytes (BCrypt's limit) is fine; 37 gets a field error, never truncated
        send(post("/api/auth/register"), null, registerJson(uniqueEmail(), "ж".repeat(36), "Марија"))
                .andExpect(status().isAccepted());
        String refused = body(send(post("/api/auth/register"), null, registerJson(uniqueEmail(), "ж".repeat(37), "Марија"))
                .andExpect(status().isBadRequest()));
        assertEquals("VALIDATION_FAILED", JsonPath.read(refused, "$.code"));
        assertTrue(JsonPath.<String>read(refused, "$.fieldErrors.password").contains("72 bytes"), refused);
    }

    @Test
    void a37CharacterCyrillicPasswordIsEitherAcceptedOrRefusedWithAClearFieldError() throws Exception {
        // Finding API-02 (S5), FIXED (@MaxUtf8Bytes in @ValidPassword): regression test. Before the fix: @ValidPassword counts characters (max 72) but BCrypt takes 72 bytes; 37 Cyrillic
        // letters (74 bytes) pass validation, then BCrypt throws and the user gets a generic 400 "Invalid request"
        // with no field error, on register, change password and reset password.
        String cyr37 = "ж".repeat(37);
        List<String> answers = new ArrayList<>();
        answers.add(body(send(post("/api/auth/register"), null, registerJson(uniqueEmail(), cyr37, "Марија"))));
        TestOwner o = newOwner();
        answers.add(body(send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + o.password() + "\",\"newPassword\":\"" + cyr37 + "\"}")));
        for (String a : answers) {
            boolean accepted = a.contains("verificationRequired") || a.contains("\"token\"");
            boolean clearError = a.contains("VALIDATION_FAILED") && a.contains("\"password\"") || a.contains("\"newPassword\"");
            assertTrue(accepted || clearError, "37 Cyrillic letters got: " + a);
        }
    }

    @Test
    void loginLockoutBlocksEvenTheRightPasswordAndAnyoneCanTriggerItForAnyAccount() throws Exception {
        // Documents S9 as it works today (passes): 5 wrong passwords for one address, from ANY addresses, lock that
        // account for 15 minutes, including for its owner with the right password.
        TestOwner victim = newOwner();
        for (int i = 0; i < 5; i++) loginFrom(randomIp(), victim.email(), "wrong-password-" + i).andExpect(status().isUnauthorized());
        String locked = body(loginFrom(randomIp(), victim.email(), victim.password()).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After")));
        assertErrorShape(locked, 429);
        assertEquals("RATE_LIMITED", JsonPath.read(locked, "$.code"));
        // case and spaces in the typed address do not get around it
        loginFrom(randomIp(), "  " + victim.email().toUpperCase() + " ", victim.password()).andExpect(status().isTooManyRequests());
        // an existing session is not affected, and other accounts are not locked
        send(get("/api/me"), victim.token(), null).andExpect(status().isOk());
        TestOwner other = newOwner();
        loginFrom(randomIp(), other.email(), other.password()).andExpect(status().isOk());
        // an unknown address locks the same way, so the lock does not reveal which addresses exist
        String ghost = uniqueEmail();
        for (int i = 0; i < 5; i++) loginFrom(randomIp(), ghost, "wrong-password-" + i).andExpect(status().isUnauthorized());
        loginFrom(randomIp(), ghost, "whatever-1").andExpect(status().isTooManyRequests());
    }

    @Test
    void answersDoNotRevealWhichAddressesHaveAccounts() throws Exception {
        TestOwner known = newOwner();
        String unknown = uniqueEmail();
        String ip = randomIp();

        String regKnown = body(send(post("/api/auth/register"), null, registerJson(known.email(), "Another-pass-1", "X")).andExpect(status().isAccepted()));
        String regNew = body(send(post("/api/auth/register"), null, registerJson(unknown, "Another-pass-1", "X")).andExpect(status().isAccepted()));
        assertEquals(regNew.replace(unknown, "E"), regKnown.replace(known.email(), "E"));

        String l1 = withoutTimestamp(body(loginFrom(randomIp(), known.email(), "wrong-pass-1").andExpect(status().isUnauthorized())));
        String l2 = withoutTimestamp(body(loginFrom(randomIp(), uniqueEmail(), "wrong-pass-1").andExpect(status().isUnauthorized())));
        assertEquals(l1, l2);

        String f1 = body(sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + known.email() + "\"}"));
        String f2 = body(sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + uniqueEmail() + "\"}"));
        assertEquals(f1, f2);
        String r1 = body(sendFrom(ip, post("/api/auth/resend-code"), null, "{\"email\":\"" + known.email() + "\"}"));
        String r2 = body(sendFrom(ip, post("/api/auth/resend-code"), null, "{\"email\":\"" + unknown + "\"}"));
        String r3 = body(sendFrom(ip, post("/api/auth/resend-code"), null, "{\"email\":\"" + uniqueEmail() + "\"}"));
        assertEquals(r1, r2);
        assertEquals(r2, r3);
        String v1 = withoutTimestamp(body(send(post("/api/auth/verify-email"), null, "{\"email\":\"" + unknown + "\",\"code\":\"000000\"}")));
        String v2 = withoutTimestamp(body(send(post("/api/auth/verify-email"), null, "{\"email\":\"" + uniqueEmail() + "\",\"code\":\"000000\"}")));
        String v3 = withoutTimestamp(body(send(post("/api/auth/verify-email"), null, "{\"email\":\"" + known.email() + "\",\"code\":\"000000\"}")));
        assertEquals(v1, v2);
        assertEquals(v2, v3);

        // Only a caller who already knows the password learns more: unverified -> 403 EMAIL_NOT_VERIFIED,
        // disabled -> 401 "Account is disabled" (documented, low risk)
        loginFrom(randomIp(), unknown, "Another-pass-1").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
        jdbc.update("UPDATE app_user SET active = false WHERE lower(email) = lower(?)", known.email());
        loginFrom(randomIp(), known.email(), known.password()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Account is disabled"));
    }

    @Test
    void timingOfKnownAndUnknownAddressesIsMeasuredForTheReport() throws Exception {
        // Documentation only (no assertion on time): medians printed as AUDIT-TIMING lines for the report.
        TestOwner known = newOwner();
        int n = 4; // at most 5 calls per address: the per-account login and register limits would end the measurement
        report("login wrong password, known address", n, () -> call(() -> loginFrom(randomIp(), known.email(), "Wrong-pass-" + UUID.randomUUID())));
        report("login, unknown address", n, () -> call(() -> loginFrom(randomIp(), uniqueEmail(), "Wrong-pass-1")));
        report("register, existing address", n, () -> call(() -> send(post("/api/auth/register"), null, registerJson(known.email(), "Another-pass-1", "X"))));
        report("register, new address", n, () -> call(() -> send(post("/api/auth/register"), null, registerJson(uniqueEmail(), "Another-pass-1", "X"))));
        report("forgot-password, known address", n, () -> call(() -> sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + known.email() + "\"}")));
        report("forgot-password, unknown address", n, () -> call(() -> sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + uniqueEmail() + "\"}")));
    }

    private interface Call { ResultActions run() throws Exception; }

    private static long call(Call c) {
        long t = System.nanoTime();
        try { c.run(); } catch (Exception e) { throw new RuntimeException(e); }
        return (System.nanoTime() - t) / 1_000;
    }

    private static void report(String what, int n, Supplier<Long> sample) {
        sample.get(); // warm-up
        long[] us = new long[n];
        for (int i = 0; i < n; i++) us[i] = sample.get();
        Arrays.sort(us);
        System.out.println("AUDIT-TIMING " + what + ": median " + us[n / 2] / 1000 + " ms (min " + us[0] / 1000 + ", max " + us[n - 1] / 1000 + ")");
    }

    @Test
    void resetCodesAndTokensAreSingleUseExpireAndOnlyChangeTheirOwnAccount() throws Exception {
        TestOwner a = newOwner();
        TestOwner b = newOwner();
        sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + a.email() + "\"}").andExpect(status().isOk());
        String code = emailedCode("PASSWORD_RESET", a.email());
        // A's code typed with B's address is refused (codes are bound to the user)
        send(post("/api/auth/verify-reset-code"), null, "{\"email\":\"" + b.email() + "\",\"code\":\"" + code + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
        String token = JsonPath.read(body(send(post("/api/auth/verify-reset-code"), null,
                "{\"email\":\"" + a.email() + "\",\"code\":\"" + code + "\"}").andExpect(status().isOk())), "$.resetToken");
        // the code is spent
        send(post("/api/auth/verify-reset-code"), null, "{\"email\":\"" + a.email() + "\",\"code\":\"" + code + "\"}")
                .andExpect(status().isBadRequest());
        assertTrue(token.length() >= 40, "reset token too short");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM password_reset WHERE reset_token_hash = ?", Integer.class, token),
                "reset token stored in clear");

        String newPw = "Reset-" + UUID.randomUUID();
        send(post("/api/auth/reset-password"), null, "{\"resetToken\":\"" + token + "\",\"newPassword\":\"" + newPw + "\"}").andExpect(status().isOk());
        send(post("/api/auth/reset-password"), null, "{\"resetToken\":\"" + token + "\",\"newPassword\":\"Again-" + UUID.randomUUID() + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RESET_TOKEN_INVALID"));
        loginFrom(randomIp(), a.email(), newPw).andExpect(status().isOk());
        loginFrom(randomIp(), b.email(), b.password()).andExpect(status().isOk());
        send(get("/api/me"), b.token(), null).andExpect(status().isOk());

        // an expired reset token is refused
        sendFrom(randomIp(), post("/api/auth/forgot-password"), null, "{\"email\":\"" + b.email() + "\"}").andExpect(status().isOk());
        String token2 = JsonPath.read(body(send(post("/api/auth/verify-reset-code"), null, "{\"email\":\"" + b.email()
                + "\",\"code\":\"" + emailedCode("PASSWORD_RESET", b.email()) + "\"}").andExpect(status().isOk())), "$.resetToken");
        jdbc.update("UPDATE password_reset SET reset_token_expires_at = now() - interval '1 second' WHERE user_id = ? AND used_at IS NULL "
                + "AND reset_token_hash IS NOT NULL", userIdOf(b.email()));
        send(post("/api/auth/reset-password"), null, "{\"resetToken\":\"" + token2 + "\",\"newPassword\":\"Late-" + UUID.randomUUID() + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RESET_TOKEN_INVALID"));
        loginFrom(randomIp(), b.email(), b.password()).andExpect(status().isOk());
    }

    @Test
    void verificationCodesAreBoundToTheirAccountAndSingleUse() throws Exception {
        String a = uniqueEmail();
        String b = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(a, "Pw-aaaaaaaa", "A")).andExpect(status().isAccepted());
        send(post("/api/auth/register"), null, registerJson(b, "Pw-bbbbbbbb", "B")).andExpect(status().isAccepted());
        String codeA = emailedCode("VERIFY_EMAIL", a);
        String codeB = emailedCode("VERIFY_EMAIL", b);
        if (!codeA.equals(codeB)) {
            send(post("/api/auth/verify-email"), null, "{\"email\":\"" + a + "\",\"code\":\"" + codeB + "\"}")
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
        }
        send(post("/api/auth/verify-email"), null, "{\"email\":\"" + a + "\",\"code\":\"" + codeA + "\"}").andExpect(status().isOk());
        send(post("/api/auth/verify-email"), null, "{\"email\":\"" + a + "\",\"code\":\"" + codeA + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
        // 5 wrong tries burn the code even for the right one afterwards
        for (int i = 0; i < 5; i++) {
            String wrong = String.format("%06d", (Integer.parseInt(codeB) + 1 + i) % 1_000_000);
            send(post("/api/auth/verify-email"), null, "{\"email\":\"" + b + "\",\"code\":\"" + wrong + "\"}").andExpect(status().isBadRequest());
        }
        send(post("/api/auth/verify-email"), null, "{\"email\":\"" + b + "\",\"code\":\"" + codeB + "\"}").andExpect(status().isBadRequest());
    }

    @Test
    void wrongCurrentPasswordOnChangeIs400NotA401ThatWouldSignTheUserOut() throws Exception {
        TestOwner o = newOwner();
        send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"not-it-123\",\"newPassword\":\"Brand-new-123\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        send(post("/api/me/password"), o.token(), "{\"currentPassword\":\"" + o.password() + "\",\"newPassword\":\"" + o.password() + "\"}")
                .andExpect(status().isBadRequest());
        send(post("/api/me/delete"), o.token(), "{\"password\":\"" + o.password() + "\",\"confirmation\":\"delete\"}")
                .andExpect(status().isBadRequest());
        send(post("/api/me/delete"), o.token(), "{\"password\":\"wrong-one\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        send(get("/api/me"), o.token(), null).andExpect(status().isOk());
    }

    @Test
    void someoneWhoSignedUpFirstWithMyAddressCannotSignInToMyAccountAfterIVerifyIt() throws Exception {
        // Finding API-01 (S1, pre-account hijack), FIXED in Phase 8 (AuthService.register): regression test. Before the fix: the attacker registers the victim's address with a password the
        // attacker chose. When the victim later signs up, the existing unverified account only gets a fresh code;
        // the victim's password is ignored. The victim types the code (it arrives in the victim's own inbox) and is
        // signed in, and the attacker's password now opens the verified account (and every booking put in it).
        String victim = uniqueEmail();
        String attackerPw = "Attacker-pw-1";
        String victimPw = "Victim-pw-2";
        send(post("/api/auth/register"), null, registerJson(victim, attackerPw, "Attacker")).andExpect(status().isAccepted());
        send(post("/api/auth/register"), null, registerJson(victim, victimPw, "Victim")).andExpect(status().isAccepted());
        String code = emailedCode("VERIFY_EMAIL", victim);
        String session = JsonPath.read(body(send(post("/api/auth/verify-email"), null,
                "{\"email\":\"" + victim + "\",\"code\":\"" + code + "\"}").andExpect(status().isOk())), "$.token");
        createProperty(session, "Victim's guest house", 1);

        int attacker = loginFrom(randomIp(), victim, attackerPw).andReturn().getResponse().getStatus();
        int owner = loginFrom(randomIp(), victim, victimPw).andReturn().getResponse().getStatus();
        String name = JsonPath.read(body(send(get("/api/me"), session, null)), "$.fullName");
        assertAll(
                () -> assertEquals(401, attacker, "the attacker's password opens the victim's verified account"),
                () -> assertEquals(200, owner, "the victim cannot sign in with the password they chose"),
                () -> assertEquals("Victim", name, "the account carries the attacker's name"));
    }

}
