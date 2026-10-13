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
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
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
        return "{\"businessName\":\"Biz\",\"contactPhone\":\"1\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Tester\"}";
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
        send(post("/api/auth/register"), null, registerJson(email.toUpperCase())).andExpect(status().isBadRequest());
        markVerified(email);
        send(post("/api/auth/login"), null, "{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk());
    }

    @Test
    void registerRejectsInvalidInputWithReadableMessage() throws Exception {
        send(post("/api/auth/register"), null,
                "{\"businessName\":\"\",\"email\":\"nope\",\"password\":\"1\",\"fullName\":\"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("Email must be a well-formed email address")))
                .andExpect(jsonPath("$.message").value(containsString("Business name must not be blank")))
                .andExpect(jsonPath("$.message").value(containsString("Password size must be between 8 and 72")));
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

    // ---------- external calendars ----------

    @Test
    void calendarUrlsMustBePublicHttps() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String path = "/api/units/" + unit + "/calendars";
        for (String bad : new String[]{"http://example.com/a.ics", "https://localhost/a.ics", "https://127.0.0.1/a.ics",
                "https://10.0.0.1/a.ics", "https://169.254.169.254/latest", "https://[::1]/a.ics", ""}) {
            send(post(path), token, "{\"platform\":\"AIRBNB\",\"icsUrl\":\"" + bad + "\"}").andExpect(status().isBadRequest());
        }
        send(post(path), token, "{\"platform\":\"DIRECT\",\"icsUrl\":\"https://example.com/a.ics\"}").andExpect(status().isBadRequest());
    }

    @Test
    void oneCalendarPerPlatformAndManualSyncHasACooldown() throws Exception {
        String token = registerAndGetToken();
        String unit = unitWithToken(token);
        String path = "/api/units/" + unit + "/calendars";
        String calBody = send(post(path), token, "{\"platform\":\"BOOKING\",\"icsUrl\":\"https://example.com/qa-feed.ics\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String calId = JsonPath.read(calBody, "$.id");

        send(post(path), token, "{\"platform\":\"BOOKING\",\"icsUrl\":\"https://example.com/other.ics\"}").andExpect(status().isConflict());

        // First sync runs (and fails gracefully: that host has no such feed). A second one right away is throttled.
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
