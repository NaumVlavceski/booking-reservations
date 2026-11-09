package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.demo.DemoAccounts;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PasswordResetRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.service.AccountService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** "Try the demo" (app.demo.enabled=true): a private sample account per visitor, what it may not do, and the cleanup. */
@SpringBootTest(properties = {
        "app.demo.enabled=true",
        "app.demo.max-active=5",
        "app.rate-limit.demo-per-ip.max=3",
        "app.rate-limit.demo-per-ip.window=1h"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DemoAccountIntegrationTest {
    private static final int SAMPLE_RESERVATIONS = 22;

    @Autowired MockMvc mvc;
    @Autowired DemoAccounts demos;
    @Autowired AccountService accountService;
    @Autowired AppUserRepository users;
    @Autowired OwnerRepository owners;
    @Autowired ReservationRepository reservations;
    @Autowired PasswordResetRepository passwordResets;
    @Autowired EntityManager entityManager;
    @Autowired PlatformTransactionManager transactionManager;

    /** Each test starts without demos, so max-active counts only its own. */
    @BeforeEach
    void noDemos() {
        owners.findAllByDemoTrue().forEach(o -> accountService.deleteOwnerData(o.getId()));
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body, String ip) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req.with(r -> { r.setRemoteAddr(ip); return r; }));
    }

    private String startDemo(String ip) throws Exception {
        String body = send(post("/api/auth/demo"), null, null, ip)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private AppUser userOf(String token, String ip) throws Exception {
        String me = send(get("/api/me"), token, null, ip).andReturn().getResponse().getContentAsString();
        return users.findFirstByEmailIgnoreCase(JsonPath.read(me, "$.email")).orElseThrow();
    }

    private String bookingBody(String token, String ip, int daysFromNow) throws Exception {
        String units = send(get("/api/units"), token, null, ip).andReturn().getResponse().getContentAsString();
        String unitId = JsonPath.read(units, "$[0].id");
        LocalDate in = LocalDate.now().plusDays(daysFromNow);
        return "{\"unitId\":\"" + unitId + "\",\"checkIn\":\"" + in + "\",\"checkOut\":\"" + in.plusDays(3) + "\"}";
    }

    @Test
    void tryingTheDemoSignsInToAPrivateAccountWithSampleData() throws Exception {
        String ip = "198.51.100.1";
        String token = startDemo(ip);
        send(get("/api/me"), token, null, ip).andExpect(jsonPath("$.demo").value(true));
        send(get("/api/properties"), token, null, ip).andExpect(jsonPath("$.length()").value(2));
        send(get("/api/units"), token, null, ip).andExpect(jsonPath("$.length()").value(5));

        AppUser user = userOf(token, ip);
        assertEquals(SAMPLE_RESERVATIONS, reservations.countByOwnerId(user.getOwner().getId()));
        assertTrue(user.getOwner().isDemo());
        assertFalse(user.getOwner().isNotificationsEnabled(), "booking emails stay off");
        assertTrue(user.getEmail().endsWith(".invalid"), "an address that can never receive mail");
    }

    @Test
    void everyVisitorGetsTheirOwnCopy() throws Exception {
        String first = startDemo("198.51.100.2");
        String second = startDemo("198.51.100.3");
        send(post("/api/reservations"), first, bookingBody(first, "198.51.100.2", 40), "198.51.100.2")
                .andExpect(status().isOk());

        UUID firstOwner = userOf(first, "198.51.100.2").getOwner().getId();
        UUID secondOwner = userOf(second, "198.51.100.3").getOwner().getId();
        assertFalse(firstOwner.equals(secondOwner));
        assertEquals(SAMPLE_RESERVATIONS + 1, reservations.countByOwnerId(firstOwner));
        assertEquals(SAMPLE_RESERVATIONS, reservations.countByOwnerId(secondOwner), "the other demo is untouched");
    }

    @Test
    void visitorsSeeTheOverlapRule() throws Exception {
        String ip = "198.51.100.4";
        String token = startDemo(ip);
        String booking = bookingBody(token, ip, 40);
        send(post("/api/reservations"), token, booking, ip).andExpect(status().isOk());
        send(post("/api/reservations"), token, booking, ip)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DATES_TAKEN"));
    }

    /** The sample prices are typed by hand, so check they agree the way the booking form works them out. */
    @Test
    void samplePricesAgreeWithEachOther() throws Exception {
        String ip = "198.51.100.5";
        String token = startDemo(ip);
        String all = send(get("/api/reservations"), token, null, ip).andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> samples = JsonPath.read(all, "$[*]");
        assertFalse(samples.isEmpty());
        for (Map<String, Object> s : samples) {
            String who = s.get("checkIn") + " " + s.get("guestName");
            if (s.get("totalAmount") == null) {
                assertEquals(null, s.get("nightlyRate"), who);
                assertEquals(null, s.get("pricePerGuest"), who);
                continue;
            }
            long nights = ChronoUnit.DAYS.between(LocalDate.parse((String) s.get("checkIn")), LocalDate.parse((String) s.get("checkOut")));
            BigDecimal nightly = new BigDecimal(s.get("totalAmount").toString()).divide(BigDecimal.valueOf(nights), 2, RoundingMode.HALF_UP);
            BigDecimal perGuest = nightly.divide(BigDecimal.valueOf((Integer) s.get("guestsCount")), 2, RoundingMode.HALF_UP);
            assertEquals(0, nightly.compareTo(new BigDecimal(s.get("nightlyRate").toString())), who + " per night");
            assertEquals(0, perGuest.compareTo(new BigDecimal(s.get("pricePerGuest").toString())), who + " per guest");
        }
    }

    private static String booking(String unitId, LocalDate in, int nights, String status, int total, int guests) {
        return "{\"unitId\":\"" + unitId + "\",\"checkIn\":\"" + in + "\",\"checkOut\":\"" + in.plusDays(nights)
                + "\",\"status\":\"" + status + "\",\"totalAmount\":" + total + ",\"guestName\":\"Test Guest\",\"guestsCount\":" + guests + "}";
    }

    /** Every task of the demo's checklist (frontend DemoTasks.tsx), in its order: all of them must work in a demo. */
    @Test
    void everyTaskOfTheChecklistWorksInADemo() throws Exception {
        String ip = "198.51.100.10";
        String token = startDemo(ip);
        String unitsJson = send(get("/api/units"), token, null, ip).andReturn().getResponse().getContentAsString();
        String roomA = JsonPath.read(unitsJson, "$[0].id");
        String roomB = JsonPath.read(unitsJson, "$[1].id");
        String roomC = JsonPath.read(unitsJson, "$[2].id");
        LocalDate in = LocalDate.now().plusDays(60);

        // 1 create, 2 price, 3 dates, 4 guests
        String created = send(post("/api/reservations"), token, booking(roomA, in, 3, "CONFIRMED", 100, 2), ip)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id");
        send(put("/api/reservations/" + id), token, booking(roomA, in, 3, "CONFIRMED", 200, 2), ip).andExpect(status().isOk());
        send(put("/api/reservations/" + id), token, booking(roomA, in.plusDays(1), 3, "CONFIRMED", 200, 2), ip).andExpect(status().isOk());
        send(put("/api/reservations/" + id), token, booking(roomA, in.plusDays(1), 3, "CONFIRMED", 200, 3), ip).andExpect(status().isOk());

        // 5 copy to another room, 6 move to a third one, 7 cancel
        send(post("/api/reservations/" + id + "/copy"), token, "{\"unitIds\":[\"" + roomB + "\"]}", ip).andExpect(status().isOk());
        send(post("/api/reservations/" + id + "/move"), token, "{\"unitId\":\"" + roomC + "\"}", ip).andExpect(status().isOk());
        send(delete("/api/reservations/" + id), token, null, ip).andExpect(status().is2xxSuccessful());

        // 8 the past stay that was never marked as paid, with its price
        String all = send(get("/api/reservations"), token, null, ip).andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> unpaid = JsonPath.read(all, "$[?(@.guestName == 'Stefan Popov')]");
        assertEquals(1, unpaid.size());
        assertEquals("CONFIRMED", unpaid.get(0).get("status"));
        assertTrue(LocalDate.parse((String) unpaid.get(0).get("checkOut")).isBefore(LocalDate.now()), "a stay in the past");
        assertEquals(120.0, ((Number) unpaid.get(0).get("totalAmount")).doubleValue());
        send(put("/api/reservations/" + unpaid.get(0).get("id")), token,
                "{\"unitId\":\"" + unpaid.get(0).get("unitId") + "\",\"checkIn\":\"" + unpaid.get(0).get("checkIn") + "\",\"checkOut\":\""
                        + unpaid.get(0).get("checkOut") + "\",\"status\":\"PAID\",\"totalAmount\":120,\"guestName\":\"Stefan Popov\",\"guestsCount\":1}", ip)
                .andExpect(status().isOk());

        // 9 add a room
        String properties = send(get("/api/properties"), token, null, ip).andReturn().getResponse().getContentAsString();
        String propertyId = JsonPath.read(properties, "$[0].id");
        send(post("/api/properties/" + propertyId + "/units"), token, "{\"name\":\"New room\",\"capacity\":2}", ip)
                .andExpect(status().is2xxSuccessful());

        // 10 restore the cancelled booking
        LocalDate stay = in.plusDays(1);
        send(put("/api/reservations/" + id), token, booking(roomC, stay, 3, "CONFIRMED", 200, 3), ip).andExpect(status().isOk());

        // 11 cancel it again, book the same nights, and try to restore it: refused
        send(delete("/api/reservations/" + id), token, null, ip).andExpect(status().is2xxSuccessful());
        send(post("/api/reservations"), token, booking(roomC, stay, 2, "CONFIRMED", 100, 2), ip).andExpect(status().isOk());
        send(put("/api/reservations/" + id), token, booking(roomC, stay, 3, "CONFIRMED", 200, 3), ip)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DATES_TAKEN"));

        // 12 export to Excel
        send(get("/api/invoices/properties/" + propertyId + "/export"), token, null, ip).andExpect(status().isOk());
    }

    @Test
    void accountActionsAreTurnedOff() throws Exception {
        String ip = "198.51.100.5";
        String token = startDemo(ip);
        send(post("/api/me/password"), token,
                "{\"currentPassword\":\"Anything-1\",\"newPassword\":\"Another-password-2\"}", ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));
        send(post("/api/me/delete"), token, "{\"password\":\"Anything-1\",\"confirmation\":\"DELETE\"}", ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));
        send(put("/api/notifications/settings"), token, "{\"enabled\":true}", ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));
        send(put("/api/notifications/settings"), token, "{\"enabled\":false}", ip).andExpect(status().isOk());
        send(post("/api/notifications/test"), token, null, ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));

        String units = send(get("/api/units"), token, null, ip).andReturn().getResponse().getContentAsString();
        String unitId = JsonPath.read(units, "$[0].id");
        send(post("/api/units/" + unitId + "/calendars"), token,
                "{\"icsUrl\":\"https://ical.booking.com/v1/export?t=demo\"}", ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));

        send(get("/api/me/export"), token, null, ip).andExpect(status().isOk()); // a copy of sample data is fine
    }

    @Test
    void forgotPasswordNeverSendsADemoACode() throws Exception {
        String ip = "198.51.100.6";
        AppUser user = userOf(startDemo(ip), ip);
        send(post("/api/auth/forgot-password"), null, "{\"email\":\"" + user.getEmail() + "\"}", ip)
                .andExpect(status().isOk());
        assertTrue(passwordResets.findFirstByUserIdOrderByCreatedAtDesc(user.getId()).isEmpty());
    }

    @Test
    void aDemoHasSizeCaps() throws Exception {
        String ip = "198.51.100.7";
        String token = startDemo(ip);
        // 2 sample properties with 5 rooms; the cap is 10 properties and 50 rooms
        send(post("/api/properties"), token, "{\"name\":\"Big\",\"unitCount\":45}", ip).andExpect(status().isOk());
        send(post("/api/properties"), token, "{\"name\":\"One too many\",\"unitCount\":1}", ip)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"));
    }

    @Test
    void expiredDemosAreDeletedButRealAccountsNever() throws Exception {
        String ip = "198.51.100.8";
        String expired = startDemo(ip);
        String fresh = startDemo(ip);
        UUID expiredOwner = userOf(expired, ip).getOwner().getId();
        UUID freshOwner = userOf(fresh, ip).getOwner().getId();
        Owner real = owners.save(new Owner()); // not a demo, however old

        LocalDateTime longAgo = LocalDateTime.now().minusHours(2); // the lifetime is 1 hour
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> entityManager
                .createQuery("update Owner o set o.createdAt = :t where o.id in :ids")
                .setParameter("t", longAgo).setParameter("ids", java.util.List.of(expiredOwner, real.getId()))
                .executeUpdate());
        try {
            assertEquals(1, demos.deleteExpired());
            assertFalse(owners.existsById(expiredOwner));
            assertEquals(0, reservations.countByOwnerId(expiredOwner));
            send(get("/api/properties"), expired, null, ip).andExpect(status().isUnauthorized());

            assertTrue(owners.existsById(freshOwner), "a demo inside its lifetime stays");
            send(get("/api/properties"), fresh, null, ip).andExpect(status().isOk());
            assertTrue(owners.existsById(real.getId()), "never a real account");
        } finally {
            owners.deleteById(real.getId());
        }
    }

    @Test
    void oneNetworkCanStartOnlyAFewDemosAnHour() throws Exception {
        String ip = "198.51.100.9";
        for (int i = 0; i < 3; i++) startDemo(ip);
        send(post("/api/auth/demo"), null, null, ip)
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("RATE_LIMITED"));
    }

    @Test
    void thereIsAnUpperLimitOfDemosAtOnce() throws Exception {
        for (int i = 0; i < 5; i++) startDemo("198.51.100." + (20 + i));
        send(post("/api/auth/demo"), null, null, "198.51.100.30")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("DEMO_RESTRICTED"))
                .andExpect(jsonPath("$.message").value(DemoAccounts.BUSY));
    }
}
