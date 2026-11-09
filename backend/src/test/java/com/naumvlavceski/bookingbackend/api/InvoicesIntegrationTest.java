package com.naumvlavceski.bookingbackend.api;

import com.jayway.jsonpath.JsonPath;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.CellType;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Invoices API against the real schema: status filter, null amounts, empty units, owner isolation, validation. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InvoicesIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository appUsers;
    @Autowired UnitRepository units;
    @Autowired ReservationRepository reservations;

    private static final String PASSWORD = "Pw-" + UUID.randomUUID();
    // Registration needs the Terms and Privacy Policy accepted (versions as shown by the frontend)
    static final String ACCEPT_TERMS = "\"acceptedTerms\":true,\"termsVersion\":\"2026-10-30\",\"privacyVersion\":\"2026-10-30\"";

    private String send(MockHttpServletRequestBuilder req, String token, String body, int expected) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    private String token() throws Exception {
        String email = "inv_" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        send(post("/api/auth/register"), null, "{\"contactPhone\":\"1\",\"email\":\"" + email
                + "\",\"password\":\"" + PASSWORD + "\",\"fullName\":\"Tester\"," + ACCEPT_TERMS + "}", 202);
        AppUser user = appUsers.findFirstByEmailIgnoreCase(email).orElseThrow();
        user.setEmailVerifiedAt(OffsetDateTime.now());
        appUsers.save(user);
        String body = send(post("/api/auth/login"), null,
                "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}", 200);
        return JsonPath.read(body, "$.token");
    }

    private String property(String token, String name, int unitCount) throws Exception {
        String body = send(post("/api/properties"), token,
                "{\"name\":\"" + name + "\",\"address\":\"1 St\",\"unitCount\":" + unitCount + "}", 200);
        return JsonPath.read(body, "$.id");
    }

    private List<String> unitIds(String token, String propertyId) throws Exception {
        return JsonPath.read(send(get("/api/properties/" + propertyId + "/units"), token, null, 200), "$[*].id");
    }

    private void reserve(String token, String unit, String in, String out, String guest, String extra) throws Exception {
        send(post("/api/reservations"), token, "{\"unitId\":\"" + unit + "\",\"checkIn\":\"" + in + "\",\"checkOut\":\""
                + out + "\",\"guestName\":\"" + guest + "\"" + (extra == null ? "" : "," + extra) + "}", 200);
    }

    private static List<Row> sheet(byte[] xlsx) throws Exception {
        try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(xlsx))) {
            return wb.getFirstSheet().read();
        }
    }

    /** A sheet row as "a|b|c": dates (columns C, D) as yyyy-MM-dd, numbers plain, formulas as "=SUM(..)". */
    private static String line(Row row) {
        StringBuilder out = new StringBuilder();
        for (int c = 0; c < 8; c++) {
            if (c > 0) out.append('|');
            Cell cell = c < row.getCellCount() ? row.getCell(c) : null;
            if (cell == null) continue;
            if (cell.getFormula() != null) out.append('=').append(cell.getFormula());
            else if (cell.getType() == CellType.NUMBER && (c == 2 || c == 3))
                out.append(row.getCellAsDate(c).orElseThrow().toLocalDate());
            else if (cell.getType() == CellType.NUMBER)
                out.append(row.getCellAsNumber(c).orElseThrow().stripTrailingZeros().toPlainString());
            else out.append(cell.getText());
        }
        return out.toString();
    }

    @Test
    void invoices() throws Exception {
        String a = token();
        String p1 = property(a, "Beach House", 2);
        String p2 = property(a, "Alpine Lodge", 1);
        String room1 = unitIds(a, p1).get(0);
        String room2 = unitIds(a, p1).get(1);

        reserve(a, room1, "2032-03-01", "2032-03-04", "Anna", "\"totalAmount\":300,\"status\":\"CONFIRMED\""); // 3 nights
        reserve(a, room1, "2032-04-10", "2032-04-12", "Boris", "\"totalAmount\":250.5,\"status\":\"PAID\"");    // 2 nights
        reserve(a, room1, "2032-05-01", "2032-05-02", "Cleo", null);                                           // 1 night, no amount
        reserve(a, room1, "2032-06-01", "2032-06-05", "Dan", "\"totalAmount\":999,\"status\":\"CANCELLED\""); // excluded
        reserve(a, room1, "2032-07-01", "2032-07-05", "Eve", "\"totalAmount\":999,\"status\":\"BLOCK\"");     // excluded
        Reservation imported = new Reservation();                                                              // counts: CONFIRMED
        imported.setUnit(units.findById(UUID.fromString(room1)).orElseThrow());
        imported.setOwnerId(imported.getUnit().getOwnerId());
        imported.setStayRange(Range.closedOpen(LocalDate.of(2032, 8, 1), LocalDate.of(2032, 8, 3)));
        imported.setSource(ReservationSource.BOOKING);
        imported.setGuestName("CLOSED - Not available");
        reservations.save(imported);                                                                           // 2 nights, no amount

        System.out.println("INVOICE_PROPERTIES " + send(get("/api/invoices/properties"), a, null, 200));
        String unitsJson = send(get("/api/invoices/properties/" + p1 + "/units"), a, null, 200);
        System.out.println("INVOICE_UNITS " + unitsJson);
        String resJson = send(get("/api/invoices/units/" + room1 + "/reservations"), a, null, 200);
        System.out.println("INVOICE_RESERVATIONS " + resJson);

        mvc.perform(get("/api/invoices/properties").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].propertyName").value("Alpine Lodge"))
                .andExpect(jsonPath("$[0].unitCount").value(1))
                .andExpect(jsonPath("$[1].unitCount").value(2));

        mvc.perform(get("/api/invoices/properties/" + p1 + "/units").header("Authorization", "Bearer " + a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.units.length()").value(2))
                .andExpect(jsonPath("$.units[0].unitName").value("Room 1"))
                .andExpect(jsonPath("$.units[0].totalDays").value(8))
                .andExpect(jsonPath("$.units[0].earnings").value(550.5))
                .andExpect(jsonPath("$.units[0].reservationCount").value(4))
                .andExpect(jsonPath("$.units[0].reservationsWithoutAmount").value(2))
                .andExpect(jsonPath("$.units[1].totalDays").value(0))
                .andExpect(jsonPath("$.units[1].earnings").value(0.0))
                .andExpect(jsonPath("$.grandTotal.totalDays").value(8))
                .andExpect(jsonPath("$.grandTotal.earnings").value(550.5))
                .andExpect(jsonPath("$.currency").doesNotExist());

        mvc.perform(get("/api/invoices/units/" + room1 + "/reservations").header("Authorization", "Bearer " + a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyName").value("Beach House"))
                .andExpect(jsonPath("$.reservations.items.length()").value(4))
                .andExpect(jsonPath("$.reservations.items[0].checkIn").value("2032-08-01"))
                .andExpect(jsonPath("$.reservations.items[0].source").value("BOOKING"))
                .andExpect(jsonPath("$.reservations.items[3].guestName").value("Anna"))
                .andExpect(jsonPath("$.reservations.items[3].nights").value(3))
                .andExpect(jsonPath("$.earnings").value(550.5));

        // the list is paged, the totals are not
        mvc.perform(get("/api/invoices/units/" + room1 + "/reservations?size=3&page=1").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.reservations.items.length()").value(1))
                .andExpect(jsonPath("$.reservations.items[0].guestName").value("Anna"))
                .andExpect(jsonPath("$.reservations.totalElements").value(4))
                .andExpect(jsonPath("$.reservations.totalPages").value(2))
                .andExpect(jsonPath("$.earnings").value(550.5));
        mvc.perform(get("/api/invoices/units/" + room1 + "/reservations").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.reservations.size").value(20));

        // date filter on check-in (inclusive)
        mvc.perform(get("/api/invoices/properties/" + p1 + "/units?from=2032-03-01&to=2032-04-10")
                        .header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.grandTotal.reservationCount").value(2))
                .andExpect(jsonPath("$.grandTotal.earnings").value(550.5));

        // status / source filters narrow the totals; other statuses are rejected
        mvc.perform(get("/api/invoices/properties/" + p1 + "/units?status=PAID").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.grandTotal.reservationCount").value(1))
                .andExpect(jsonPath("$.grandTotal.earnings").value(250.5));
        mvc.perform(get("/api/invoices/properties/" + p1 + "/units?source=BOOKING").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.grandTotal.reservationCount").value(1))
                .andExpect(jsonPath("$.grandTotal.totalDays").value(2));
        mvc.perform(get("/api/invoices/units/" + room1 + "/reservations?status=CONFIRMED&source=DIRECT")
                        .header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.reservations.items.length()").value(2))
                .andExpect(jsonPath("$.earnings").value(300.0));
        send(get("/api/invoices/properties/" + p1 + "/units?status=CANCELLED"), a, null, 400);
        send(get("/api/invoices/units/" + room1 + "/reservations?source=NOPE"), a, null, 400);

        // bookings without an amount: the ones behind reservationsWithoutAmount
        mvc.perform(get("/api/invoices/properties/" + p1 + "/missing-amounts").header("Authorization", "Bearer " + a))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservations.items.length()").value(2))
                .andExpect(jsonPath("$.reservations.items[0].checkIn").value("2032-08-01"))
                .andExpect(jsonPath("$.reservations.items[0].unitName").value("Room 1"))
                .andExpect(jsonPath("$.reservations.items[1].guestName").value("Cleo"));
        mvc.perform(get("/api/invoices/properties/" + p1 + "/missing-amounts?source=DIRECT&unitId=" + room1)
                        .header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.unitName").value("Room 1"))
                .andExpect(jsonPath("$.reservations.items.length()").value(1));
        mvc.perform(get("/api/invoices/properties/" + p1 + "/missing-amounts?unitId=" + room2)
                        .header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.reservations.items.length()").value(0));
        String p2Unit = unitIds(a, p2).get(0);
        send(get("/api/invoices/properties/" + p1 + "/missing-amounts?unitId=" + p2Unit), a, null, 404); // room of another property
        mvc.perform(get("/api/invoices/units/" + room1 + "/reservations").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.propertyId").value(p1));

        // Excel export: every matching booking, not paged, earliest check-in first, same filters
        var xlsx = mvc.perform(get("/api/invoices/properties/" + p1 + "/export?from=2032-03-01&to=2032-12-31")
                        .header("Authorization", "Bearer " + a))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andExpect(header().string("Content-Disposition",
                        "attachment; filename=\"invoices_2032-03-01_2032-12-31.xlsx\""))
                .andReturn().getResponse();
        List<Row> rows = sheet(xlsx.getContentAsByteArray());
        org.junit.jupiter.api.Assertions.assertEquals(List.of(
                "Beach House|||||||",
                "Room|Guest|Check-in|Check-out|Nights|Status|Source|Amount",
                "Room 1|Anna|2032-03-01|2032-03-04|3|Confirmed|Direct|300",
                "Room 1|Boris|2032-04-10|2032-04-12|2|Paid|Direct|250.5",
                "Room 1|Cleo|2032-05-01|2032-05-02|1|Confirmed|Direct|",
                "Room 1|CLOSED - Not available|2032-08-01|2032-08-03|2|Confirmed|Booking.com|",
                "Total||||=SUM(E3:E6)|||=SUM(H3:H6)"), rows.stream().map(InvoicesIntegrationTest::line).toList());
        rows = sheet(mvc.perform(get("/api/invoices/properties/" + p1 + "/export?status=PAID&unitId=" + room1)
                        .header("Authorization", "Bearer " + a))
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"invoices_all-time.xlsx\""))
                .andReturn().getResponse().getContentAsByteArray());
        org.junit.jupiter.api.Assertions.assertEquals(4, rows.size()); // title, header, Boris, total
        org.junit.jupiter.api.Assertions.assertEquals("Boris", rows.get(2).getCellText(1));
        rows = sheet(mvc.perform(get("/api/invoices/properties/" + p1 + "/export?unitId=" + room2)
                        .header("Authorization", "Bearer " + a))
                .andReturn().getResponse().getContentAsByteArray());
        org.junit.jupiter.api.Assertions.assertEquals(2, rows.size()); // title and header only
        send(get("/api/invoices/properties/" + p1 + "/export?unitId=" + unitIds(a, p2).get(0)), a, null, 404);
        send(get("/api/invoices/properties/" + p1 + "/export?from=2032-05-01&to=2032-01-01"), a, null, 400);
        send(get("/api/invoices/properties/" + p1 + "/export?status=BLOCK"), a, null, 400);

        // empty unit
        mvc.perform(get("/api/invoices/units/" + room2 + "/reservations").header("Authorization", "Bearer " + a))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reservations.items.length()").value(0))
                .andExpect(jsonPath("$.totalDays").value(0));

        // another owner: own data only, and 404 on this owner's ids
        String b = token();
        String bProp = property(b, "Other", 1);
        send(get("/api/invoices/properties/" + p1 + "/units"), b, null, 404);
        send(get("/api/invoices/units/" + room1 + "/reservations"), b, null, 404);
        send(get("/api/invoices/properties/" + p1 + "/missing-amounts"), b, null, 404);
        send(get("/api/invoices/properties/" + p1 + "/export"), b, null, 404);
        send(get("/api/invoices/properties/" + bProp + "/units"), a, null, 404);
        org.junit.jupiter.api.Assertions.assertEquals(1, (Integer) JsonPath.read(
                send(get("/api/invoices/properties"), b, null, 200), "$.length()"));

        // validation / auth
        send(get("/api/invoices/properties/" + p1 + "/units?from=2032-05-01&to=2032-01-01"), a, null, 400);
        send(get("/api/invoices/units/" + room1 + "/reservations?from=2032-05-01&to=2032-01-01"), a, null, 400);
        send(get("/api/invoices/properties/" + p1 + "/units?from=bad"), a, null, 400);
        send(get("/api/invoices/properties"), null, null, 401);
        send(get("/api/invoices/properties/" + p1 + "/export"), null, null, 401);
    }
}
