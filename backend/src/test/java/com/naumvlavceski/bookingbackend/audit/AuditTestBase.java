package com.naumvlavceski.bookingbackend.audit;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared helpers for the pre-production audit tests (Docs/testing). Real filter chain, real Postgres schema
 * (Testcontainers), no mocks. Every test creates its own random owners, so tests never depend on each other.
 *
 * <p>Convention: a test that proves an audit finding which is not fixed yet asserts the CORRECT behaviour and carries
 * {@code @Tag("open-finding")} plus the finding ID in a comment; the default build skips that tag (see pom.xml).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AuditTestBase {

    public static final String ACCEPT_TERMS =
            "\"acceptedTerms\":true,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"";

    @Autowired protected MockMvc mvc;
    @Autowired protected AppUserRepository appUsers;

    /** A signed-in owner created for one test. */
    public record TestOwner(String email, String password, String token) {}

    protected ResultActions send(MockHttpServletRequestBuilder req, String token, String jsonBody) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (jsonBody != null) req.contentType(MediaType.APPLICATION_JSON).content(jsonBody);
        return mvc.perform(req);
    }

    protected static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    protected static String uniqueEmail() {
        return "audit_" + UUID.randomUUID().toString().substring(0, 12) + "@example.test";
    }

    /** Stands in for typing the emailed code (the code itself is never exposed). */
    protected void markVerified(String email) {
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
    }

    protected String login(String email, String password) throws Exception {
        String json = body(send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").andExpect(status().isOk()));
        return JsonPath.read(json, "$.token");
    }

    /** Registers, verifies and signs in a fresh owner. */
    protected TestOwner newOwner() throws Exception {
        String email = uniqueEmail();
        String password = "Pw-" + UUID.randomUUID();
        send(post("/api/auth/register"), null, "{\"contactPhone\":\"1\",\"email\":\"" + email + "\",\"password\":\""
                + password + "\",\"fullName\":\"Audit Owner\"," + ACCEPT_TERMS + "}").andExpect(status().isAccepted());
        markVerified(email);
        return new TestOwner(email, password, login(email, password));
    }

    /** Creates a property with {@code rooms} rooms and returns its id. */
    protected String createProperty(String token, String name, int rooms) throws Exception {
        String json = body(send(post("/api/properties"), token,
                "{\"name\":\"" + name + "\",\"address\":\"1 Lake St\",\"unitCount\":" + rooms + "}")
                .andExpect(status().isOk()));
        return JsonPath.read(json, "$.id");
    }

    protected List<String> roomIds(String token, String propertyId) throws Exception {
        String json = body(send(get("/api/properties/" + propertyId + "/units"), token, null).andExpect(status().isOk()));
        return new ArrayList<>(JsonPath.read(json, "$[*].id"));
    }

    /** One property with one room; returns the room id. */
    protected String newRoom(String token) throws Exception {
        return roomIds(token, createProperty(token, "House", 1)).getFirst();
    }

    public static String reservationJson(String unitId, String checkIn, String checkOut, String extraFields) {
        return "{\"unitId\":\"" + unitId + "\",\"checkIn\":\"" + checkIn + "\",\"checkOut\":\"" + checkOut
                + "\",\"guestName\":\"Guest\"" + (extraFields == null || extraFields.isBlank() ? "" : "," + extraFields) + "}";
    }

    /** Creates a reservation (expects 200) and returns its id. */
    protected String createReservation(String token, String unitId, String checkIn, String checkOut, String extraFields)
            throws Exception {
        String json = body(send(post("/api/reservations"), token, reservationJson(unitId, checkIn, checkOut, extraFields))
                .andExpect(status().isOk()));
        return JsonPath.read(json, "$.id");
    }
}
