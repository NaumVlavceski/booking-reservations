package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.ConflictKind;
import com.naumvlavceski.bookingbackend.model.ConflictStatus;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.SyncConflict;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * End-to-end through the real filter chain and the real Postgres schema (no mocks).
 * Every test registers its own random users, so nothing depends on or clears existing data.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiIntegrationTest {

    @Autowired MockMvc mvc;

    private static final String PASSWORD = "Pw-" + UUID.randomUUID();
    // Registration needs the Terms and Privacy Policy accepted (versions as shown by the frontend)
    static final String ACCEPT_TERMS = "\"acceptedTerms\":true,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"";

    // ---------- helpers ----------

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private static String uniqueEmail() {
        return "it_" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
    }

    private static String registerJson(String email) {
        return "{\"contactPhone\":\"1\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Tester\"," + ACCEPT_TERMS + "}";
    }

    @Autowired AppUserRepository appUsers;

    /** Stands in for typing the emailed code (the code itself is never exposed). */
    private void markVerified(String email) {
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
    }

    private String registerAndGetToken() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        markVerified(email);
        String body = send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private String createProperty(String token, int units) throws Exception {
        String body = send(post("/api/properties"), token,
                "{\"name\":\"House\",\"address\":\"1 St\",\"unitCount\":" + units + "}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private String firstUnitId(String token, String propertyId) throws Exception {
        String body = send(get("/api/properties/" + propertyId + "/units"), token, null)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$[0].id");
    }

    private String unitWithToken(String token) throws Exception {
        return firstUnitId(token, createProperty(token, 1));
    }

    private static String reservationJson(String unitId, String in, String out, String extra) {
        return "{\"unitId\":\"" + unitId + "\",\"checkIn\":\"" + in + "\",\"checkOut\":\"" + out + "\",\"guestName\":\"Guest\""
                + (extra == null ? "" : "," + extra) + "}";
    }

    // ---------- auth ----------

    @Test
    void registerThenLoginThenMe() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(email)).andExpect(jsonPath("$.verificationRequired").value(true))
                .andExpect(jsonPath("$.token").doesNotExist());

        // Correct password but email not verified yet: refused with a stable code the frontend can act on
        send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
        markVerified(email);

        String body = send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(body, "$.token");

        send(get("/api/me"), token, null).andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void emailIsCaseInsensitive() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        // The same address in capitals is no second account (and the answer doesn't reveal that it exists)
        send(post("/api/auth/register"), null, registerJson(email.toUpperCase())).andExpect(status().isAccepted());
        markVerified(email);
        send(post("/api/auth/login"), null, "{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk());
    }

    @Test
    void registerRejectsInvalidInputWithReadableMessage() throws Exception {
        send(post("/api/auth/register"), null,
                "{\"email\":\"nope\",\"password\":\"1\",\"fullName\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Email must be a well-formed email address")))
                .andExpect(jsonPath("$.message").value(containsString("Full name must not be blank")))
                .andExpect(jsonPath("$.message").value(containsString("Password size must be between 8 and 72")));
    }

    @Test
    void registeringRequiresAcceptingTheTermsAndStoresWhatWasAccepted() throws Exception {
        String email = uniqueEmail();
        String withoutConsent = registerJson(email).replace("\"acceptedTerms\":true", "\"acceptedTerms\":false");
        send(post("/api/auth/register"), null, withoutConsent).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.acceptedTerms").exists());
        String noVersion = registerJson(email).replace(",\"termsVersion\":\"2026-10-30\"", "");
        send(post("/api/auth/register"), null, noVersion).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.termsVersion").exists());

        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        AppUser stored = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        assertNotNull(stored.getTermsAcceptedAt());
        assertEquals("2026-10-30", stored.getTermsVersion());
        assertEquals("2026-10-30", stored.getPrivacyVersion());

        markVerified(email);
        String token = JsonPath.read(send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}").andReturn().getResponse().getContentAsString(), "$.token");
        send(get("/api/me"), token, null)
                .andExpect(jsonPath("$.termsVersion").value("2026-10-30"))
                .andExpect(jsonPath("$.privacyVersion").value("2026-10-30"))
                .andExpect(jsonPath("$.termsAcceptedAt").exists());
    }

    @Test
    void wrongPasswordAndUnknownUserAreUnauthorized() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}")
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid email or password"));
        send(post("/api/auth/login"), null, "{\"email\":\"ghost@example.test\",\"password\":\"x\"}")
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginIsLimitedPerAddressEvenForTheRightPassword() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        markVerified(email);
        // Successful logins don't use up tries
        for (int i = 0; i < 6; i++) {
            send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                    .andExpect(status().isOk());
        }
        for (int i = 0; i < 5; i++) {
            send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"wrong-" + i + "\"}")
                    .andExpect(status().isUnauthorized());
        }
        // Different case is the same address; the right password no longer helps once the tries are used up
        send(post("/api/auth/login"), null, "{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void failedLoginsAreLimitedPerIpAcrossAddresses() throws Exception {
        String ip = "203.0.113." + (int) (Math.random() * 250);
        // Real default: 20 failed tries per 15 minutes from one address, whatever addresses are tried
        for (int i = 0; i < 100; i++) {
            int status = mvc.perform(post("/api/auth/login").with(r -> { r.setRemoteAddr(ip); return r; })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + uniqueEmail() + "\",\"password\":\"x\"}"))
                    .andReturn().getResponse().getStatus();
            if (status == 429) return;
            assertEquals(401, status);
        }
        fail("never limited");
    }

    @Test
    void unknownAddressAndWrongPasswordLookTheSame() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        markVerified(email);
        String known = send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"wrong-pass\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String unknown = send(post("/api/auth/login"), null, "{\"email\":\"ghost-" + email + "\",\"password\":\"wrong-pass\"}")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertEquals(known.replaceAll("\"timestamp\":\"[^\"]*\"", ""), unknown.replaceAll("\"timestamp\":\"[^\"]*\"", ""));
    }

    @Test
    void registeringAnExistingAddressAnswersLikeANewOne() throws Exception {
        String email = uniqueEmail();
        String first = send(post("/api/auth/register"), null, registerJson(email))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        markVerified(email);
        String again = send(post("/api/auth/register"), null, registerJson(email))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        assertEquals(first, again);
        // Nothing about the existing account changed: the original password still works
        send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk());
    }

    @Test
    void wrongPasswordIsCheckedBeforeVerificationStatusIsRevealed() throws Exception {
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        // Unverified account + wrong password must look like any other wrong password, not "not verified"
        send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}")
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").doesNotExist());
    }

    @Test
    void verificationEndpointsArePublicAndDoNotRevealWhichEmailsExist() throws Exception {
        String known = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(known)).andExpect(status().isAccepted());

        // resend-code: identical answer for a registered and an unknown address
        String a = send(post("/api/auth/resend-code"), null, "{\"email\":\"" + known + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String b = send(post("/api/auth/resend-code"), null, "{\"email\":\"ghost-" + known + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(a, b);

        // verify-email: unknown address and a wrong code for a real one both say INVALID_CODE (400, never 401/403)
        send(post("/api/auth/verify-email"), null, "{\"email\":\"ghost-" + known + "\",\"code\":\"123456\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CODE"));
        send(post("/api/auth/verify-email"), null, "{\"email\":\"" + known + "\",\"code\":\"000000\"}")
                .andExpect(status().isBadRequest());

        // Still no way in: an unverified account cannot use any protected endpoint
        send(post("/api/auth/login"), null, "{\"email\":\"" + known + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isForbidden());
    }

    @Test
    void protectedEndpointsRejectMissingAndForgedTokens() throws Exception {
        send(get("/api/me"), null, null).andExpect(status().isUnauthorized());
        send(get("/api/me"), "garbage.token.value", null).andExpect(status().isUnauthorized());
        String token = registerAndGetToken();
        send(get("/api/me"), token.substring(0, token.length() - 3) + "abc", null).andExpect(status().isUnauthorized());
    }

    // ---------- error handling ----------

    @Test
    void malformedRequestsAreClientErrorsNotServerErrors() throws Exception {
        String token = registerAndGetToken();
        send(post("/api/auth/login"), null, "{bad json").andExpect(status().isBadRequest());
        send(get("/api/properties/not-a-uuid"), token, null).andExpect(status().isBadRequest());
        send(get("/api/does-not-exist"), token, null).andExpect(status().isNotFound());
        String unit = unitWithToken(token);
        send(post("/api/reservations"), token, reservationJson(unit, "2031-13-45", "2031-01-02", null))
                .andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-01-01", "2031-01-02", "\"status\":\"PENDING\""))
                .andExpect(status().isBadRequest());
    }

    // ---------- properties & units ----------

    @Test
    void propertyAndUnitValidation() throws Exception {
        String token = registerAndGetToken();
        send(post("/api/properties"), token, "{\"name\":\"\",\"unitCount\":1}").andExpect(status().isBadRequest());
        send(post("/api/properties"), token, "{\"name\":\"X\",\"unitCount\":-5}").andExpect(status().isBadRequest());
        send(post("/api/properties"), token, "{\"name\":\"X\",\"unitCount\":100000}").andExpect(status().isBadRequest());

        String property = createProperty(token, 2);
        send(get("/api/properties/" + property + "/units"), token, null).andExpect(jsonPath("$.length()").value(2));
        send(post("/api/properties/" + property + "/units"), token, "{\"name\":\"\",\"capacity\":2}").andExpect(status().isBadRequest());
        send(post("/api/properties/" + property + "/units"), token, "{\"name\":\"R\",\"capacity\":0}").andExpect(status().isBadRequest());
        send(post("/api/properties/" + property + "/units"), token, "{\"name\":\"R\",\"capacity\":3}").andExpect(status().isOk());
    }

    @Test
    void deletingAPropertyRemovesItsUnits() throws Exception {
        String token = registerAndGetToken();
        String property = createProperty(token, 1);
        String unit = firstUnitId(token, property);
        send(delete("/api/properties/" + property), token, null).andExpect(status().isNoContent());
        send(get("/api/units/" + unit), token, null).andExpect(status().isNotFound());
    }

    // ---------- tenant isolation ----------

    @Test
    void anotherOwnerCannotSeeOrTouchMyData() throws Exception {
        String owner = registerAndGetToken();
        String intruder = registerAndGetToken();
        String property = createProperty(owner, 1);
        String unit = firstUnitId(owner, property);
        String reservation = JsonPath.read(send(post("/api/reservations"), owner,
                reservationJson(unit, "2032-01-01", "2032-01-03", null))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");

        send(get("/api/properties/" + property), intruder, null).andExpect(status().isNotFound());
        send(delete("/api/properties/" + property), intruder, null).andExpect(status().isNotFound());
        send(get("/api/units/" + unit), intruder, null).andExpect(status().isNotFound());
        send(put("/api/units/" + unit), intruder, "{\"name\":\"hax\",\"capacity\":1}").andExpect(status().isNotFound());
        send(post("/api/properties/" + property + "/units"), intruder, "{\"name\":\"hax\",\"capacity\":1}").andExpect(status().isNotFound());
        send(get("/api/reservations/" + reservation), intruder, null).andExpect(status().isNotFound());
        send(delete("/api/reservations/" + reservation), intruder, null).andExpect(status().isNotFound());
        send(post("/api/reservations"), intruder, reservationJson(unit, "2033-01-01", "2033-01-02", null)).andExpect(status().isNotFound());
        send(get("/api/units/" + unit + "/calendars"), intruder, null).andExpect(status().isNotFound());
        send(get("/api/properties"), intruder, null).andExpect(jsonPath("$.length()").value(0));
        send(get("/api/reservations"), intruder, null).andExpect(jsonPath("$.length()").value(0));
    }

    @Autowired SyncConflictRepository syncConflicts;

    private static UUID ownerOf(String token) {
        String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
        return UUID.fromString(JsonPath.read(payload, "$.ownerId"));
    }

    private static String idOf(ResultActions created) throws Exception {
        return JsonPath.read(created.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    /** Owner B uses owner A's ids on every endpoint: always 404 or an empty answer, and A's data stays as it was. */
    @Test
    void everyEndpointKeepsOwnersApart() throws Exception {
        String a = registerAndGetToken();
        String b = registerAndGetToken();

        String aProperty = createProperty(a, 2);
        String aUnits = send(get("/api/properties/" + aProperty + "/units"), a, null).andReturn().getResponse().getContentAsString();
        String aUnit = JsonPath.read(aUnits, "$[0].id");
        String aUnit2 = JsonPath.read(aUnits, "$[1].id");
        String aRes = idOf(send(post("/api/reservations"), a, reservationJson(aUnit, "2040-01-01", "2040-01-04", null)));
        String aCal = idOf(send(post("/api/units/" + aUnit + "/calendars"), a,
                "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=tenant-test\"}"));
        SyncConflict conflict = new SyncConflict();
        conflict.setOwnerId(ownerOf(a));
        conflict.setUnitId(UUID.fromString(aUnit));
        conflict.setExternalCalendarId(UUID.fromString(aCal));
        conflict.setExternalUid("tenant-test-uid");
        conflict.setPlatform(ReservationSource.BOOKING);
        conflict.setIncomingStart(LocalDate.of(2040, 1, 2));
        conflict.setIncomingEnd(LocalDate.of(2040, 1, 3));
        conflict.setKind(ConflictKind.NEW_OVERLAP);
        conflict.setStatus(ConflictStatus.OPEN);
        String aConflict = syncConflicts.save(conflict).getId().toString();

        String bProperty = createProperty(b, 1);
        String bUnit = firstUnitId(b, bProperty);
        String bRes = idOf(send(post("/api/reservations"), b, reservationJson(bUnit, "2040-02-01", "2040-02-03", null)));

        // properties and units
        send(get("/api/properties/" + aProperty), b, null).andExpect(status().isNotFound());
        send(put("/api/properties/" + aProperty), b, "{\"name\":\"hax\",\"address\":\"x\"}").andExpect(status().isNotFound());
        send(delete("/api/properties/" + aProperty), b, null).andExpect(status().isNotFound());
        send(get("/api/properties/" + aProperty + "/units"), b, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        send(post("/api/properties/" + aProperty + "/units"), b, "{\"name\":\"hax\",\"capacity\":1}").andExpect(status().isNotFound());
        send(get("/api/units/" + aUnit), b, null).andExpect(status().isNotFound());
        send(put("/api/units/" + aUnit), b, "{\"name\":\"hax\",\"capacity\":1}").andExpect(status().isNotFound());
        send(delete("/api/units/" + aUnit), b, null).andExpect(status().isNotFound());
        send(get("/api/units"), b, null).andExpect(jsonPath("$[*].id", not(hasItem(aUnit))));

        // reservations, including move/copy targets in either direction
        send(get("/api/reservations/" + aRes), b, null).andExpect(status().isNotFound());
        send(put("/api/reservations/" + aRes), b, reservationJson(bUnit, "2040-03-01", "2040-03-02", null)).andExpect(status().isNotFound());
        send(put("/api/reservations/" + bRes), b, reservationJson(aUnit, "2040-03-01", "2040-03-02", null)).andExpect(status().isNotFound());
        send(delete("/api/reservations/" + aRes), b, null).andExpect(status().isNotFound());
        send(get("/api/reservations/" + aRes + "/available-options"), b, null).andExpect(status().isNotFound());
        send(post("/api/reservations/" + aRes + "/move"), b, "{\"unitId\":\"" + bUnit + "\"}").andExpect(status().isNotFound());
        send(post("/api/reservations/" + bRes + "/move"), b, "{\"unitId\":\"" + aUnit2 + "\"}").andExpect(status().isNotFound());
        send(post("/api/reservations/" + aRes + "/copy"), b, "{\"unitIds\":[\"" + bUnit + "\"]}").andExpect(status().isNotFound());
        send(post("/api/reservations/" + bRes + "/copy"), b, "{\"unitIds\":[\"" + aUnit2 + "\"]}").andExpect(status().isNotFound());
        send(get("/api/reservations/" + aUnit + "/unit"), b, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        send(get("/api/reservations?unitId=" + aUnit), b, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        send(get("/api/reservations/cancelled"), b, null).andExpect(jsonPath("$.items[*].id", not(hasItem(aRes))));

        // external calendars
        send(get("/api/units/" + aUnit + "/calendars"), b, null).andExpect(status().isNotFound());
        send(post("/api/units/" + aUnit + "/calendars"), b, "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=hax\"}").andExpect(status().isNotFound());
        send(post("/api/calendars/" + aCal + "/sync"), b, null).andExpect(status().isNotFound());
        send(delete("/api/calendars/" + aCal), b, null).andExpect(status().isNotFound());
        send(get("/api/calendars/health"), b, null).andExpect(jsonPath("$[*].id", not(hasItem(aCal))));
        send(post("/api/calendars/sync-all"), b, null).andExpect(jsonPath("$.total").value(0));

        // invoices (earnings), including B's own property combined with A's room
        send(get("/api/invoices/properties"), b, null).andExpect(jsonPath("$[*].propertyId", not(hasItem(aProperty))));
        send(get("/api/invoices/properties/" + aProperty + "/units"), b, null).andExpect(status().isNotFound());
        send(get("/api/invoices/units/" + aUnit + "/reservations"), b, null).andExpect(status().isNotFound());
        send(get("/api/invoices/properties/" + aProperty + "/missing-amounts"), b, null).andExpect(status().isNotFound());
        send(get("/api/invoices/properties/" + bProperty + "/missing-amounts?unitId=" + aUnit), b, null).andExpect(status().isNotFound());
        send(get("/api/invoices/properties/" + aProperty + "/export"), b, null).andExpect(status().isNotFound());
        send(get("/api/invoices/properties/" + bProperty + "/export?unitId=" + aUnit), b, null).andExpect(status().isNotFound());

        // booking conflicts and notification settings
        send(get("/api/conflicts"), b, null).andExpect(jsonPath("$[*].id", not(hasItem(aConflict))));
        send(post("/api/conflicts/" + aConflict + "/dismiss"), b, null).andExpect(status().isNotFound());
        send(put("/api/notifications/settings"), b, "{\"enabled\":false}").andExpect(status().isOk());

        // A's data is untouched
        send(get("/api/properties/" + aProperty), a, null).andExpect(jsonPath("$.name").value("House"));
        send(get("/api/properties/" + aProperty + "/units"), a, null).andExpect(jsonPath("$.length()").value(2));
        send(get("/api/reservations/" + aRes), a, null)
                .andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.unitId").value(aUnit));
        send(get("/api/units/" + aUnit + "/calendars"), a, null).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/conflicts"), a, null).andExpect(jsonPath("$[*].id", hasItem(aConflict)));
        send(get("/api/notifications/settings"), a, null).andExpect(jsonPath("$.enabled").value(true));
    }

    @Test
    void swaggerIsNotPublicWhenDisabled() throws Exception {
        send(get("/v3/api-docs"), null, null).andExpect(status().isUnauthorized());
        send(get("/swagger-ui/index.html"), null, null).andExpect(status().isUnauthorized());
    }

    @Test
    void unexpectedLibraryMessagesAreNotEchoed() throws Exception {
        // BCrypt refuses passwords over 72 bytes with its own IllegalArgumentException: never echo library wording
        String email = uniqueEmail();
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isAccepted());
        markVerified(email);
        send(post("/api/auth/login"), null, "{\"email\":\"" + email + "\",\"password\":\"" + "x".repeat(80) + "\"}")
                .andExpect(jsonPath("$.message", not(containsString("72"))));
    }

    // ---------- reservations ----------

    @Test
    void overlapsAreRejectedButBackToBackStaysAreAllowed() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-10", "2030-06-15", null)).andExpect(status().isOk());

        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-12", "2030-06-18", null)).andExpect(status().isConflict());
        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-11", "2030-06-12", null)).andExpect(status().isConflict());
        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-01", "2030-06-30", null)).andExpect(status().isConflict());
        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-15", "2030-06-17", null)).andExpect(status().isOk());
        send(post("/api/reservations"), token, reservationJson(unit, "2030-06-08", "2030-06-10", null)).andExpect(status().isOk());
    }

    @Test
    void reservationValidation() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        send(post("/api/reservations"), token, reservationJson(unit, "2031-01-01", "2031-01-01", null)).andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-01-05", "2031-01-01", null)).andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, "{\"unitId\":\"" + unit + "\",\"guestName\":\"x\"}").andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, "{\"checkIn\":\"2031-01-01\",\"checkOut\":\"2031-01-02\"}").andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-02-01", "2031-02-02", "\"totalAmount\":-5")).andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-02-01", "2031-02-02", "\"guestsCount\":0")).andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-02-01", "2031-02-02", "\"guestEmail\":\"nope\"")).andExpect(status().isBadRequest());
        send(post("/api/reservations"), token, reservationJson(unit, "2031-02-01", "2031-02-02", "\"notes\":\"" + "x".repeat(300) + "\"")).andExpect(status().isBadRequest());
    }

    @Test
    void cancelledReservationsDisappearFromDefaultListAndFreeTheDates() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String id = JsonPath.read(send(post("/api/reservations"), token, reservationJson(unit, "2034-01-01", "2034-01-03", null))
                .andReturn().getResponse().getContentAsString(), "$.id");

        send(delete("/api/reservations/" + id), token, null).andExpect(status().isNoContent());

        String active = send(get("/api/reservations"), token, null).andReturn().getResponse().getContentAsString();
        assertFalse(active.contains(id));
        String cancelled = send(get("/api/reservations?status=CANCELLED"), token, null).andReturn().getResponse().getContentAsString();
        assertTrue(cancelled.contains(id));
        send(post("/api/reservations"), token, reservationJson(unit, "2034-01-01", "2034-01-03", null)).andExpect(status().isOk());
    }

    @Test
    void updatingWithoutStatusKeepsTheExistingStatus() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String id = JsonPath.read(send(post("/api/reservations"), token, reservationJson(unit, "2035-01-01", "2035-01-03", "\"status\":\"PAID\""))
                .andReturn().getResponse().getContentAsString(), "$.id");

        send(put("/api/reservations/" + id), token, reservationJson(unit, "2035-01-01", "2035-01-04", null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
    }

    @Test
    void simultaneousBookingsOfTheSameNightsLetExactlyOneWin() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        int threads = 8;
        var pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        var start = new java.util.concurrent.CountDownLatch(1);
        var results = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
        for (int i = 0; i < threads; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return send(post("/api/reservations"), token, reservationJson(unit, "2040-01-01", "2040-01-05", null))
                        .andReturn().getResponse().getStatus();
            }));
        }
        start.countDown();
        int ok = 0, conflict = 0;
        for (var f : results) {
            int s = f.get();
            if (s == 200) ok++;
            else if (s == 409) conflict++;
        }
        pool.shutdown();
        assertEquals(1, ok);
        assertEquals(threads - 1, conflict);
    }

    // ---------- iCal export ----------

    @Test
    void publicFeedShowsBusyNightsAndGuestNameButNoContactDetails() throws Exception {
        String token = registerAndGetToken();
        String property = createProperty(token, 1);
        String body = send(get("/api/properties/" + property + "/units"), token, null).andReturn().getResponse().getContentAsString();
        String unit = JsonPath.read(body, "$[0].id");
        String feedToken = JsonPath.read(body, "$[0].token");
        send(post("/api/reservations"), token,
                reservationJson(unit, "2036-03-01", "2036-03-04", "\"guestEmail\":\"private@example.test\",\"guestPhone\":\"+389 70 123 456\""))
                .andExpect(status().isOk());

        String ics = mvc.perform(get("/api/ical/" + feedToken + ".ics"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20360301"));
        assertTrue(ics.contains("SUMMARY:Guest"));
        assertFalse(ics.contains("private@example.test"));
        assertFalse(ics.contains("+389"));

        mvc.perform(get("/api/ical/unknown-token.ics")).andExpect(status().isNotFound());
    }

    @Test
    void feedIsLimitedPerFeedAndGuessingIsLimitedPerIp() throws Exception {
        String token = registerAndGetToken();
        String body = send(get("/api/properties/" + createProperty(token, 1) + "/units"), token, null)
                .andReturn().getResponse().getContentAsString();
        String feed = "/api/ical/" + JsonPath.read(body, "$[0].token") + ".ics";
        for (int i = 0; i < 120; i++) mvc.perform(get(feed)).andExpect(status().isOk());
        mvc.perform(get(feed)).andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));

        String guesser = "198.51.100." + (int) (Math.random() * 250);
        for (int i = 0; i < 30; i++) {
            mvc.perform(get("/api/ical/" + UUID.randomUUID() + ".ics").with(r -> { r.setRemoteAddr(guesser); return r; }))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(get("/api/ical/" + UUID.randomUUID() + ".ics").with(r -> { r.setRemoteAddr(guesser); return r; }))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
    }

    @Test
    void unsubscribeIsLimitedPerIp() throws Exception {
        String ip = "192.0.2." + (int) (Math.random() * 250);
        for (int i = 0; i < 30; i++) {
            mvc.perform(get("/api/notifications/unsubscribe?token=bogus").with(r -> { r.setRemoteAddr(ip); return r; }))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/notifications/unsubscribe?token=bogus").with(r -> { r.setRemoteAddr(ip); return r; }))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(content().string(containsString("Please try again later")));
    }

    @Test
    void registerAndResendAreLimitedPerTypedAddress() throws Exception {
        String email = uniqueEmail();
        for (int i = 0; i < 5; i++) {
            send(post("/api/auth/register"), null, registerJson(i % 2 == 0 ? email : email.toUpperCase()))
                    .andExpect(status().isAccepted());
        }
        send(post("/api/auth/register"), null, registerJson(email)).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After")).andExpect(jsonPath("$.retryAfterSeconds").isNumber());

        String ghost = "ghost-" + uniqueEmail();
        for (int i = 0; i < 5; i++) {
            send(post("/api/auth/resend-code"), null, "{\"email\":\"" + ghost + "\"}").andExpect(status().isOk());
        }
        send(post("/api/auth/resend-code"), null, "{\"email\":\"" + ghost + "\"}").andExpect(status().isTooManyRequests());
    }

    // ---------- external calendars ----------

    @Test
    void calendarUrlsMustBePublicHttps() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String path = "/api/units/" + unit + "/calendars";
        // Not https, or not a Booking.com host (private addresses are covered in IcalUrlGuardTest)
        for (String bad : new String[]{"http://ical.booking.com/v1/export?t=a", "https://example.com/a.ics",
                "https://localhost/a.ics", "https://127.0.0.1/a.ics", "https://169.254.169.254/latest",
                "https://booking.com.evil.com/a.ics", "https://example.com/airbnb.com/a.ics", ""}) {
            send(post(path), token, "{\"icsUrl\":\"" + bad + "\"}").andExpect(status().isBadRequest());
        }
        send(post(path), token, "{\"icsUrl\":\"https://example.com/a.ics\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only Booking.com calendar links are supported."));
    }

    @Test
    void theChannelIsWorkedOutFromTheLinkNotFromWhatTheClientSends() throws Exception {
        String token = registerAndGetToken();
        String path = "/api/units/" + unitWithToken(token) + "/calendars";

        // an Airbnb link is refused, even when an old or wrong client labels it as Booking
        send(post(path), token, "{\"platform\":\"BOOKING\",\"icsUrl\":\"https://www.airbnb.com/calendar/ical/123.ics?s=qa\"}")
                .andExpect(status().isBadRequest());

        // webcal:// is accepted and stored as https://
        send(post(path), token, "{\"icsUrl\":\"webcal://ical.booking.com/v1/export?t=qa\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.platform").value("BOOKING"));

        // one calendar per channel, with a message that names it
        send(post(path), token, "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=other\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This room already has a Booking.com calendar."));
    }

    @Test
    void oneCalendarPerPlatformAndManualSyncHasACooldown() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String path = "/api/units/" + unit + "/calendars";
        String calBody = send(post(path), token, "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=qa-feed\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String calId = JsonPath.read(calBody, "$.id");

        send(post(path), token, "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=other\"}").andExpect(status().isConflict());

        // First sync runs (and fails gracefully: that token is not a real feed). A second one right away is throttled.
        send(post("/api/calendars/" + calId + "/sync"), token, null).andExpect(status().isOk());
        send(post("/api/calendars/" + calId + "/sync"), token, null)
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));

        String other = registerAndGetToken();
        send(post("/api/calendars/" + calId + "/sync"), other, null).andExpect(status().isNotFound());
        send(delete("/api/calendars/" + calId), other, null).andExpect(status().isNotFound());
        send(delete("/api/calendars/" + calId), token, null).andExpect(status().isNoContent());
    }

    @Test
    void conflictsEndpointsWork() throws Exception {
        String token = registerAndGetToken();
        send(get("/api/conflicts"), token, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        send(post("/api/conflicts/" + UUID.randomUUID() + "/dismiss"), token, null).andExpect(status().isNotFound());
    }
}
