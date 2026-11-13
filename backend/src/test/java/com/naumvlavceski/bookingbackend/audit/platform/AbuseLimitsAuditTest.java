package com.naumvlavceski.bookingbackend.audit.platform;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Platform audit: what one misbehaving client can send. Oversized and deeply nested bodies, huge page sizes,
 * extreme date ranges.
 */
class AbuseLimitsAuditTest extends AuditTestBase {

    @Test
    void deeplyNestedJsonIsRefusedCheaply() throws Exception {
        String nested = "{\"email\":" + "[".repeat(5000) + "]".repeat(5000) + ",\"password\":\"x\"}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(nested))
                .andExpect(status().isBadRequest());
    }

    @Test
    void absurdlyLongNumbersAreRefused() throws Exception {
        String body = "{\"email\":\"a@example.test\",\"password\":\"x\",\"extra\":" + "9".repeat(100_000) + "}";
        // 100 KB: since SEC-05 the size limit refuses it (413) before Jackson ever sees the number
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(anyOf(is(400), is(413))));
        // A long number that fits the size limit is still refused by the parser
        String fits = "{\"email\":\"a@example.test\",\"password\":\"x\",\"extra\":" + "9".repeat(5_000) + "}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(fits))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pageSizesAreClampedTo100() throws Exception {
        TestOwner owner = newOwner();
        String unit = newRoom(owner.token());
        send(get("/api/reservations/cancelled?size=1000000&page=0"), owner.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size", lessThanOrEqualTo(100)));
        send(get("/api/invoices/units/" + unit + "/reservations?size=1000000&page=0"), owner.token(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservations.size", lessThanOrEqualTo(100)));
        String json = body(send(get("/api/invoices/units/" + unit + "/reservations?size=0&page=-5"),
                owner.token(), null));
        int size = JsonPath.read(json, "$.reservations.size");
        assertTrue(size >= 1 && size <= 100, "invoice page size must be clamped, got " + size);
    }

    @Test
    void extremeInvoiceDateRangesAnswerNormally() throws Exception {
        TestOwner owner = newOwner();
        String property = createProperty(owner.token(), "Range", 1);
        send(get("/api/invoices/properties/" + property + "/units?from=0001-01-01&to=9999-12-31"), owner.token(), null)
                .andExpect(status().isOk());
        send(get("/api/invoices/properties/" + property + "/export?from=0001-01-01&to=9999-12-31"), owner.token(), null)
                .andExpect(status().isOk());
    }

    // Finding SEC-14: a date the database cannot store (year > 5874897 or before 4713 BC) passes the API and the
    // database error is mapped to 409 CONFLICT "This request conflicts with existing data." instead of 400.
    @Test
    @Tag("open-finding")
    void datesOutsideTheDatabaseRangeAreA400() throws Exception {
        TestOwner owner = newOwner();
        String property = createProperty(owner.token(), "Range", 1);
        send(get("/api/invoices/properties/" + property + "/units").param("from", "+999999999-12-31"), owner.token(), null)
                .andExpect(status().isBadRequest());
    }

    // Finding SEC-05: there is no request body size limit anywhere (Spring, Tomcat for JSON, or Caddy). A 2 MB
    // sign-in body is read and parsed in full (the audit sent 25 MB and 100 MB bodies to the running jar: both
    // were parsed, then answered 401). The largest legitimate body is a 5,000-character support message.
    // SEC-05 fixed (config/RequestSizeLimitFilter): regression test.
    @Test
    void oversizedBodiesAreRefusedBeforeParsing() throws Exception {
        String body = "{\"email\":\"big@example.test\",\"password\":\"" + "a".repeat(2 * 1024 * 1024) + "\"}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(anyOf(is(413), is(400))));
    }

    @Test
    void signInBodiesAreLimitedTightlyAndOtherBodiesGenerouslyButFinitely() throws Exception {
        // /api/auth/*: 16 KB; elsewhere 256 KB. Answered 413 in the standard error shape.
        String auth = "{\"email\":\"big@example.test\",\"password\":\"" + "a".repeat(20_000) + "\"}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(auth))
                .andExpect(status().is(413)).andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"))
                .andExpect(jsonPath("$.status").value(413));
        TestOwner o = newOwner();
        String big = "{\"message\":\"" + "m".repeat(300_000) + "\"}";
        send(post("/api/me/support"), o.token(), big).andExpect(status().is(413));
        // A normal-size body still reaches validation as before (5,001 characters: 400 from the field rule, not 413)
        send(post("/api/me/support"), o.token(), "{\"message\":\"" + "m".repeat(5_001) + "\"}")
                .andExpect(status().isBadRequest());
    }
}
