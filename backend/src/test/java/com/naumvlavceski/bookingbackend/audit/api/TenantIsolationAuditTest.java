package com.naumvlavceski.bookingbackend.audit.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.mail.UnsubscribeLinks;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 2/4 "Wrong owner" column (BOLA/IDOR): owner B, signed in with a perfectly valid token, aims every
 * ID-taking endpoint at owner A's ids, in the path and in the body/query. Every answer must be byte-for-byte the
 * answer for a random unknown id (no existence leak), and A's data must be unchanged afterwards.
 */
class TenantIsolationAuditTest extends ApiAuditBase {

    @Autowired UnsubscribeLinks unsubscribeLinks;

    @Test
    void ownerBGetsTheUnknownIdAnswerOnEveryOneOfOwnerAsIds() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        String bProperty = createProperty(b.token(), "B-House", 2);
        List<String> bRooms = roomIds(b.token(), bProperty);
        String bRes = createReservation(b.token(), bRooms.get(0), "2042-01-01", "2042-01-03", null);

        int compared = assertCannotReachOwnerA(a, b.token(), bProperty, bRooms.get(0), bRes);
        assertEquals(31, compared);

        // B's own reservation was not moved/copied into A's rooms either
        send(get("/api/reservations/" + bRes), b.token(), null).andExpect(jsonPath("$.unitId").value(bRooms.get(0)));
    }

    @Test
    void listsSearchesFiltersAndExportsOfOwnerBNeverContainOwnerAsData() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        String bUnit = newRoom(b.token());
        String bCancelled = createReservation(b.token(), bUnit, "2042-02-01", "2042-02-02", null);
        send(delete("/api/reservations/" + bCancelled), b.token(), null).andExpect(status().isNoContent());
        seedCalendar(bUnit, "https://feed.audit.invalid/b.ics", true);

        List<String> aIds = List.of(a.propertyId(), a.unitId(), a.unit2Id(), a.reservationId(), a.cancelledId(),
                a.calendarId(), a.conflictId(), a.feedToken(), "A-Secret-House", "a-guest@example.test", "A private note",
                "cancelled guest", "a-private-feed", a.email());
        List<String> lists = List.of("/api/properties", "/api/units", "/api/reservations",
                "/api/reservations?status=CANCELLED", "/api/reservations?status=CONFIRMED",
                "/api/reservations?unitId=" + a.unitId() + "&status=CANCELLED",
                "/api/reservations/cancelled", "/api/reservations/cancelled?name=%25", "/api/reservations/cancelled?name=_",
                "/api/reservations/cancelled?name=%25_a", "/api/reservations/cancelled?name=%27",
                "/api/reservations/cancelled?checkInFrom=2000-01-01&size=100",
                "/api/reservations/cancelled?page=0&size=100000", "/api/reservations/cancelled?page=-5&size=-5",
                "/api/calendars/health", "/api/conflicts", "/api/invoices/properties",
                "/api/notifications/settings", "/api/me", "/api/me/export");
        for (String path : lists) {
            String json = body(send(get(java.net.URI.create(path)), b.token(), null).andExpect(status().isOk()));
            for (String secret : aIds) assertFalse(json.contains(secret), path + " leaks " + secret + ": " + json);
        }
        // B's own cancelled booking is found, so the searches above did run
        send(get("/api/reservations/cancelled"), b.token(), null).andExpect(jsonPath("$.totalElements").value(1));
        send(post("/api/calendars/sync-all"), b.token(), null).andExpect(jsonPath("$.total").value(1));
        assertOwnerAUnchanged(a);
    }

    @Test
    void ownerBsUnsubscribeLinkOnlyAffectsOwnerB() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        String link = unsubscribeLinks.url(ownerIdOf(b.email()));
        String token = URLDecoder.decode(link.substring(link.indexOf("token=") + 6), StandardCharsets.UTF_8);
        sendFrom(randomIp(), post("/api/notifications/unsubscribe").param("token", token), null, null).andExpect(status().isOk());
        send(get("/api/notifications/settings"), b.token(), null).andExpect(jsonPath("$.enabled").value(false));
        send(get("/api/notifications/settings"), a.token(), null).andExpect(jsonPath("$.enabled").value(true));
        // a link with A's owner id but B's signature is refused
        String aLink = unsubscribeLinks.url(ownerIdOf(a.email()));
        String aToken = URLDecoder.decode(aLink.substring(aLink.indexOf("token=") + 6), StandardCharsets.UTF_8);
        String forged = aToken.substring(0, aToken.lastIndexOf('.') + 1) + token.substring(token.lastIndexOf('.') + 1);
        if (!forged.equals(aToken)) {
            sendFrom(randomIp(), post("/api/notifications/unsubscribe").param("token", forged), null, null)
                    .andExpect(status().isBadRequest());
        }
        send(get("/api/notifications/settings"), a.token(), null).andExpect(jsonPath("$.enabled").value(true));
    }

    @Test
    void ownerAsFeedLinkIsTheOnlyWayToAsFeedAndBsTokenDoesNotOpenIt() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        // the feed is public by design (the token is the key); a signed-in B with a guessed token gets the same 404
        String miss = body(sendFrom(randomIp(), get("/api/ical/" + "0".repeat(64) + ".ics"), b.token(), null)
                .andExpect(status().isNotFound()));
        assertErrorShape(miss, 404);
        String feed = body(sendFrom(randomIp(), get("/api/ical/" + a.feedToken() + ".ics"), null, null).andExpect(status().isOk()));
        assertFalse(feed.contains("a-guest@example.test"), "feed carries the guest's email");
        assertFalse(feed.contains("A private note"), "feed carries the private note");
        assertFalse(feed.contains("cancelled guest"), "feed carries a cancelled booking");
    }

    @Test
    void anOwnerCannotPlantDataInAnotherOwnersAccountThroughBodyFields() throws Exception {
        TenantFixture a = ownerWithData();
        TestOwner b = newOwner();
        UUID aOwner = ownerIdOf(a.email());
        String plantedId = UUID.randomUUID().toString();
        String prop = body(send(post("/api/properties"), b.token(), "{\"id\":\"" + plantedId + "\",\"ownerId\":\"" + aOwner
                + "\",\"owner\":{\"id\":\"" + aOwner + "\"},\"name\":\"Planted\",\"unitCount\":1}").andExpect(status().isOk()));
        String propId = JsonPath.read(prop, "$.id");
        assertNotEquals(plantedId, propId);
        assertEquals(ownerIdOf(b.email()), jdbc.queryForObject("SELECT owner_id FROM property WHERE id = ?", UUID.class, UUID.fromString(propId)));
        send(get("/api/properties"), a.token(), null).andExpect(jsonPath("$.length()").value(1));

        String unit = body(send(post("/api/properties/" + propId + "/units"), b.token(), "{\"name\":\"R\",\"capacity\":1,"
                + "\"propertyId\":\"" + a.propertyId() + "\",\"ownerId\":\"" + aOwner + "\",\"token\":\"" + a.feedToken() + "\"}")
                .andExpect(status().isOk()));
        assertEquals(propId, JsonPath.read(unit, "$.propertyId"));
        assertNotEquals(a.feedToken(), JsonPath.read(unit, "$.token"));
        assertEquals(ownerIdOf(b.email()), jdbc.queryForObject("SELECT owner_id FROM unit WHERE id = ?", UUID.class,
                UUID.fromString(JsonPath.read(unit, "$.id"))));

        String res = body(send(post("/api/reservations"), b.token(), reservationJson(JsonPath.read(unit, "$.id"), "2042-05-01",
                "2042-05-02", "\"id\":\"" + a.reservationId() + "\",\"ownerId\":\"" + aOwner + "\"")).andExpect(status().isOk()));
        assertNotEquals(a.reservationId(), JsonPath.read(res, "$.id"));
        assertEquals(ownerIdOf(b.email()), jdbc.queryForObject("SELECT owner_id FROM reservation WHERE id = ?", UUID.class,
                UUID.fromString(JsonPath.read(res, "$.id"))));
        assertOwnerAUnchanged(a);
    }
}
