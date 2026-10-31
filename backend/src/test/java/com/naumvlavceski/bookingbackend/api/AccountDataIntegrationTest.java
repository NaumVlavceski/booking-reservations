package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.ConflictKind;
import com.naumvlavceski.bookingbackend.model.ConflictStatus;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.SyncConflict;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Delete my account, Download my data and guest erasure, end to end against the real schema. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountDataIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository appUsers;
    @Autowired SyncConflictRepository syncConflicts;
    @Autowired JdbcTemplate jdbc;

    private static final String PASSWORD = "Pw-" + UUID.randomUUID();
    private static final String ACCEPT_TERMS = "\"acceptedTerms\":true,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"";

    record Owner(String email, String token, UUID ownerId) {}

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private Owner owner(String email) throws Exception {
        send(post("/api/auth/register"), null, "{\"contactPhone\":\"+389 70 111 222\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Owner Person\"," + ACCEPT_TERMS + "}")
                .andExpect(status().isAccepted());
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
        String token = JsonPath.read(send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.token");
        return new Owner(email, token, user.getOwner().getId());
    }

    private static String email() {
        return "acct_" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
    }

    private String id(ResultActions created) throws Exception {
        return JsonPath.read(created.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    /** A property with one room, a booking with guest details, a connected calendar and a conflict. Returns {property, unit, reservation}. */
    private String[] fill(Owner o) throws Exception {
        String property = id(send(post("/api/properties"), o.token(), "{\"name\":\"Sea House\",\"address\":\"1 Beach Rd\",\"unitCount\":1}"));
        String unit = JsonPath.read(send(get("/api/properties/" + property + "/units"), o.token(), null)
                .andReturn().getResponse().getContentAsString(), "$[0].id");
        String reservation = id(send(post("/api/reservations"), o.token(), "{\"unitId\":\"" + unit
                + "\",\"checkIn\":\"2041-05-01\",\"checkOut\":\"2041-05-04\",\"guestName\":\"Guest Secret\","
                + "\"guestEmail\":\"guest.secret@example.test\",\"guestPhone\":\"+389 70 999 888\","
                + "\"notes\":\"arrives late\",\"totalAmount\":300}"));
        String calendar = id(send(post("/api/units/" + unit + "/calendars"), o.token(),
                "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=account-test\"}"));
        SyncConflict c = new SyncConflict();
        c.setOwnerId(o.ownerId());
        c.setUnitId(UUID.fromString(unit));
        c.setExternalCalendarId(UUID.fromString(calendar));
        c.setExternalUid("account-test-uid");
        c.setPlatform(ReservationSource.BOOKING);
        c.setIncomingStart(LocalDate.of(2041, 5, 2));
        c.setIncomingEnd(LocalDate.of(2041, 5, 3));
        c.setKind(ConflictKind.NEW_OVERLAP);
        c.setStatus(ConflictStatus.OPEN);
        syncConflicts.save(c);
        return new String[]{property, unit, reservation};
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    /** Email log rows are written asynchronously after sending; wait until the sign-up ones are there. */
    private void awaitEmailLog(String email) throws InterruptedException {
        for (int i = 0; i < 50 && count("select count(*) from email_log where lower(to_address) = ?", email) == 0; i++) {
            Thread.sleep(100);
        }
        assertTrue(count("select count(*) from email_log where lower(to_address) = ?", email) > 0);
    }

    // ---------- delete my account ----------

    @Test
    void deletingTheAccountNeedsThePasswordAndTheTypedWord() throws Exception {
        Owner a = owner(email());
        send(post("/api/me/delete"), null, "{\"password\":\"" + PASSWORD + "\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isUnauthorized());
        send(post("/api/me/delete"), a.token(), "{\"password\":\"wrong-password\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        send(post("/api/me/delete"), a.token(), "{\"password\":\"" + PASSWORD + "\",\"confirmation\":\"delete it\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Type DELETE to confirm."));
        send(get("/api/me"), a.token(), null).andExpect(status().isOk());
    }

    @Test
    void deletingTheAccountRemovesEverythingAndEndsEverySession() throws Exception {
        Owner a = owner(email());
        Owner b = owner(email());
        String[] aData = fill(a);
        String[] bData = fill(b);
        String feedToken = JsonPath.read(send(get("/api/units/" + aData[1]), a.token(), null)
                .andReturn().getResponse().getContentAsString(), "$.token");
        awaitEmailLog(a.email());

        send(post("/api/me/delete"), a.token(), "{\"password\":\"" + PASSWORD + "\",\"confirmation\":\"DELETE\"}")
                .andExpect(status().isNoContent());

        UUID owner = a.ownerId();
        assertEquals(0, count("select count(*) from owner where id = ?", owner));
        assertEquals(0, count("select count(*) from app_user where owner_id = ? or lower(email) = ?", owner, a.email()));
        assertEquals(0, count("select count(*) from property where owner_id = ?", owner));
        assertEquals(0, count("select count(*) from unit where owner_id = ?", owner));
        assertEquals(0, count("select count(*) from reservation where owner_id = ?", owner));
        assertEquals(0, count("select count(*) from external_calendar where unit_id = ?", UUID.fromString(aData[1])));
        assertEquals(0, count("select count(*) from sync_conflict where owner_id = ?", owner));
        assertEquals(0, count("select count(*) from email_log where owner_id = ? or lower(to_address) = ?", owner, a.email()));

        // Every session ends, the feed link stops working, and B is untouched
        send(get("/api/me"), a.token(), null).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/ical/" + feedToken + ".ics")).andExpect(status().isNotFound());
        send(get("/api/reservations/" + bData[2]), b.token(), null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.guestName").value("Guest Secret"));
        assertEquals(1, count("select count(*) from sync_conflict where owner_id = ?", b.ownerId()));

        // A new account with the same address does not bring the deleted account's tokens back to life
        owner(a.email());
        send(get("/api/me"), a.token(), null).andExpect(status().isUnauthorized());
    }

    // ---------- download my data ----------

    @Test
    void theExportHoldsOnlyThisOwnersDataAndNoSecrets() throws Exception {
        Owner a = owner(email());
        Owner b = owner(email());
        fill(a);
        String[] bData = fill(b);
        String bGuestRename = "{\"unitId\":\"" + bData[1] + "\",\"checkIn\":\"2041-05-01\",\"checkOut\":\"2041-05-04\","
                + "\"guestName\":\"Other Owners Guest\"}";
        send(put("/api/reservations/" + bData[2]), b.token(), bGuestRename).andExpect(status().isOk());

        String json = send(get("/api/me/export"), a.token(), null)
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", containsString("attachment")))
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.account.email").value(a.email()))
                .andExpect(jsonPath("$.account.contactPhone").value("+389 70 111 222"))
                .andExpect(jsonPath("$.properties[0].rooms[0].connectedCalendars[0].platform").value("BOOKING"))
                .andExpect(jsonPath("$.reservations[0].guestEmail").value("guest.secret@example.test"))
                .andExpect(jsonPath("$.bookingConflicts.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        assertFalse(json.contains("Other Owners Guest"), "another owner's data");
        assertFalse(json.contains(b.email()));
        assertFalse(json.contains("passwordHash") || json.contains("\"$2"), "no password hash");
        assertFalse(json.contains("account-test"), "no Booking.com link");
        assertFalse(json.contains("icalToken") || json.contains("\"token\""), "no feed token");
    }

    @Test
    void theExportIsRateLimited() throws Exception {
        Owner a = owner(email());
        for (int i = 0; i < 5; i++) send(get("/api/me/export"), a.token(), null).andExpect(status().isOk());
        send(get("/api/me/export"), a.token(), null).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    // ---------- guest erasure ----------

    @Test
    void erasingAGuestKeepsDatesAndAmountsAndOnlyTheOwnerCanDoIt() throws Exception {
        Owner a = owner(email());
        Owner b = owner(email());
        String[] aData = fill(a);

        send(post("/api/reservations/" + aData[2] + "/erase-guest"), b.token(), null).andExpect(status().isNotFound());

        send(post("/api/reservations/" + aData[2] + "/erase-guest"), a.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guestName").doesNotExist())
                .andExpect(jsonPath("$.guestEmail").doesNotExist())
                .andExpect(jsonPath("$.guestPhone").doesNotExist())
                .andExpect(jsonPath("$.notes").doesNotExist())
                .andExpect(jsonPath("$.guestErasedAt").exists())
                .andExpect(jsonPath("$.checkIn").value("2041-05-01"))
                .andExpect(jsonPath("$.totalAmount").value(300))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        String feedToken = JsonPath.read(send(get("/api/units/" + aData[1]), a.token(), null)
                .andReturn().getResponse().getContentAsString(), "$.token");
        mvc.perform(get("/api/ical/" + feedToken + ".ics"))
                .andExpect(content().string(containsString("SUMMARY:Reserved")))
                .andExpect(content().string(not(containsString("Guest Secret"))));
        assertEquals(0, count("select count(*) from reservation where guest_name = 'Guest Secret' and owner_id = ?", a.ownerId()));
    }
}
