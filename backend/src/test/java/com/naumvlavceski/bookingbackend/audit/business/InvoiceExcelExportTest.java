package com.naumvlavceski.bookingbackend.audit.business;

import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.CellType;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.ReadingOptions;
import org.dhatim.fastexcel.reader.Row;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Phase 3.9: the .xlsx export, downloaded through the endpoint and read back cell by cell. */
class InvoiceExcelExportTest extends BusinessTestBase {

    private MockHttpServletResponse download(String token, String propertyId, String query) throws Exception {
        return send(get("/api/invoices/properties/" + propertyId + "/export" + query), token, null)
                .andExpect(status().isOk()).andReturn().getResponse();
    }

    static List<Row> rows(byte[] xlsx) throws Exception {
        try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(xlsx), new ReadingOptions(true, false))) {
            return wb.getFirstSheet().read();
        }
    }

    /** The raw XML of one part of the workbook (the zip entry), to see exactly what a spreadsheet app will read. */
    static String part(byte[] xlsx, String name) throws Exception {
        // fastexcel writes entries with data descriptors, which ZipInputStream rejects; read through ZipFile instead
        java.nio.file.Path tmp = java.nio.file.Files.createTempFile("audit-export", ".xlsx");
        try {
            java.nio.file.Files.write(tmp, xlsx);
            try (java.util.zip.ZipFile zip = new java.util.zip.ZipFile(tmp.toFile())) {
                ZipEntry e = zip.getEntry(name);
                if (e == null) throw new AssertionError("no part " + name);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                zip.getInputStream(e).transferTo(out);
                return out.toString(java.nio.charset.StandardCharsets.UTF_8);
            }
        } finally {
            java.nio.file.Files.deleteIfExists(tmp);
        }
    }

    @Test
    void exportHasHeaderTypedRowsAndTotalsThatMatchTheScreens() throws Exception {
        TestOwner o = newOwner();
        String p = createProperty(o.token(), "Seaside Villas", 2);
        List<String> rooms = roomIds(o.token(), p);
        createReservation(o.token(), rooms.get(0), "2031-01-10", "2031-01-13", "\"status\":\"PAID\",\"totalAmount\":1250.5,\"guestName\":\"Ana\"");
        createReservation(o.token(), rooms.get(1), "2031-01-11", "2031-01-12", "\"guestName\":\"Bojan\"");
        createReservation(o.token(), rooms.get(0), "2031-01-20", "2031-01-27", "\"totalAmount\":700,\"guestName\":\"Cvetan\"");
        createReservation(o.token(), rooms.get(1), "2031-02-01", "2031-02-02", "\"status\":\"BLOCK\",\"totalAmount\":5");
        insertRaw(rooms.get(1), "2031-01-25", "2031-01-27", "CONFIRMED", "BOOKING", "CLOSED - Not available", null);

        MockHttpServletResponse res = download(o.token(), p, "?from=2031-01-01&to=2031-01-31");
        assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", res.getContentType());
        assertTrue(res.getHeader("Content-Disposition").contains("invoices_2031-01-01_2031-01-31.xlsx"), res.getHeader("Content-Disposition"));
        assertTrue(res.getHeader("Cache-Control").contains("no-store"));
        List<Row> rows = rows(res.getContentAsByteArray());

        assertEquals(2 + 4 + 1, rows.size()); // title, header, 4 bookings (BLOCK left out), total
        assertEquals("Seaside Villas", rows.get(0).getCellText(0));
        assertEquals(List.of("Room", "Guest", "Check-in", "Check-out", "Nights", "Status", "Source", "Amount"),
                rows.get(1).stream().map(Cell::getText).toList());

        Row ana = rows.get(2); // ordered by check-in
        assertEquals("Room 1", ana.getCellText(0));
        assertEquals("Ana", ana.getCellText(1));
        assertEquals(LocalDate.of(2031, 1, 10), ana.getCellAsDate(2).orElseThrow().toLocalDate());
        assertEquals(LocalDate.of(2031, 1, 13), ana.getCellAsDate(3).orElseThrow().toLocalDate());
        assertEquals("d mmm yyyy", ana.getCell(2).getDataFormatString());
        assertEquals(CellType.NUMBER, ana.getCell(4).getType());
        assertEquals(0, new BigDecimal("3").compareTo(ana.getCellAsNumber(4).orElseThrow()));
        assertEquals("Paid", ana.getCellText(5));
        assertEquals("Direct", ana.getCellText(6));
        assertEquals(CellType.NUMBER, ana.getCell(7).getType());
        assertEquals(0, new BigDecimal("1250.50").compareTo(ana.getCellAsNumber(7).orElseThrow()));
        assertEquals("#,##0.00", ana.getCell(7).getDataFormatString());

        Row bojan = rows.get(3);
        assertEquals("Bojan", bojan.getCellText(1));
        assertEquals("Confirmed", bojan.getCellText(5));
        assertTrue(bojan.getCellAsNumber(7).isEmpty()); // missing amount: an empty cell, not 0

        Row imported = rows.get(5);
        assertEquals("CLOSED - Not available", imported.getCellText(1));
        assertEquals("Booking.com", imported.getCellText(6));

        Row total = rows.get(6);
        assertEquals("Total", total.getCellText(0));
        assertEquals("SUM(E3:E6)", total.getCell(4).getFormula());
        assertEquals("SUM(H3:H6)", total.getCell(7).getFormula());

        // The figures in the sheet add up to the same as the screen for the same filters
        BigDecimal sum = BigDecimal.ZERO;
        long nights = 0;
        for (Row r : rows.subList(2, 6)) {
            nights += r.getCellAsNumber(4).orElseThrow().longValue();
            sum = sum.add(r.getCellAsNumber(7).orElse(BigDecimal.ZERO));
        }
        String screen = getJson("/api/invoices/properties/" + p + "/units?from=2031-01-01&to=2031-01-31", o.token());
        assertEquals(((Number) com.jayway.jsonpath.JsonPath.read(screen, "$.grandTotal.totalDays")).longValue(), nights);
        assertEquals(0, decAt(screen, "$.grandTotal.earnings").compareTo(sum));
        assertEquals(0, new BigDecimal("1950.50").compareTo(sum));

        // a single-room export and the filename variants
        List<Row> room2 = rows(download(o.token(), p, "?unitId=" + rooms.get(1)).getContentAsByteArray());
        assertEquals(2 + 2 + 1, room2.size());
        assertTrue(download(o.token(), p, "").getHeader("Content-Disposition").contains("invoices_all-time.xlsx"));
        assertTrue(download(o.token(), p, "?from=2031-01-01").getHeader("Content-Disposition").contains("invoices_from_2031-01-01.xlsx"));
    }

    @Test
    void anEmptyPeriodGivesTitleAndHeaderOnly() throws Exception {
        TestOwner o = newOwner();
        String p = createProperty(o.token(), "Quiet", 1);
        List<Row> rows = rows(download(o.token(), p, "?from=2040-01-01&to=2040-01-31").getContentAsByteArray());
        assertEquals(2, rows.size());
        send(get("/api/invoices/properties/" + p + "/export?from=2040-02-01&to=2040-01-01"), o.token(), null)
                .andExpect(status().isBadRequest());
    }

    /**
     * Formula injection. Every user-controlled text (property, room, guest names) is written as a STRING cell, never as
     * a formula, so Excel/LibreOffice/Google Sheets show it as text when the .xlsx is opened. No "'" prefix is added:
     * the text arrives unchanged (see business.md, BIZ-10 for the remaining CSV/copy-paste risk).
     */
    @Test
    void textThatLooksLikeAFormulaStaysTextAndIsNotRewritten() throws Exception {
        List<String> payloads = List.of("=1+1", "+1+1", "-2+3", "@SUM(1,1)", "\t=1+1", "=HYPERLINK(\"http://evil.example\",\"Click\")",
                "=cmd|' /C calc'!A0", "=DDE(\"cmd\";\"/C calc\";\"x\")", "<b>&amp;</b>", "Ana \"Ani\" O'Neil");
        TestOwner o = newOwner();
        String p = createPropertyNamed(o.token(), "=IMPORTXML(\"http://evil.example\",\"//a\")", payloads.size());
        List<String> rooms = roomIds(o.token(), p);
        for (int i = 0; i < payloads.size(); i++) {
            renameRoom(o.token(), rooms.get(i), i % 2 == 0 ? "-" + i + "+1" : "@room" + i);
            send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/reservations"), o.token(),
                    "{\"unitId\":\"" + rooms.get(i) + "\",\"checkIn\":\"2031-03-" + String.format("%02d", i + 1)
                            + "\",\"checkOut\":\"2031-03-" + String.format("%02d", i + 2) + "\",\"guestName\":" + js(payloads.get(i))
                            + ",\"notes\":" + js("=1+1") + ",\"totalAmount\":10}")
                    .andExpect(status().isOk());
        }
        byte[] xlsx = download(o.token(), p, "").getContentAsByteArray();
        List<Row> rows = rows(xlsx);

        Cell title = rows.get(0).getCell(0);
        assertEquals(CellType.STRING, title.getType());
        assertNull(title.getFormula());
        assertEquals("=IMPORTXML(\"http://evil.example\",\"//a\")", title.getText()); // unchanged, no ' prefix
        List<String> guests = new ArrayList<>();
        for (Row r : rows.subList(2, 2 + payloads.size())) {
            for (int c : new int[]{0, 1, 5, 6}) {
                assertEquals(CellType.STRING, r.getCell(c).getType(), "column " + c + " of " + r);
                assertNull(r.getCell(c).getFormula());
            }
            guests.add(r.getCellText(1));
            assertTrue(r.getCellText(0).startsWith("-") || r.getCellText(0).startsWith("@"));
        }
        assertEquals(payloads, guests); // exact text, nothing escaped or prefixed

        // In the sheet XML the only formulas are the two SUMs of the total row; every name is a string cell
        String sheet = part(xlsx, "xl/worksheets/sheet1.xml");
        Matcher f = Pattern.compile("<f>(.*?)</f>").matcher(sheet);
        List<String> formulas = new ArrayList<>();
        while (f.find()) formulas.add(f.group(1));
        int last = 2 + payloads.size();
        assertEquals(List.of("SUM(E3:E" + last + ")", "SUM(H3:H" + last + ")"), formulas);
        assertFalse(sheet.contains("<f>="), "a payload became a formula");
    }

    @Test
    void controlCharactersInNamesDoNotBreakTheFile() throws Exception {
        TestOwner o = newOwner();
        String p = createProperty(o.token(), "Ctl", 1);
        String room = roomIds(o.token(), p).getFirst();
        createReservation(o.token(), room, "2031-04-01", "2031-04-02", "\"guestName\":" + js("A\u0001B\u001FC\u000BD") + ",\"totalAmount\":1");
        createReservation(o.token(), room, "2031-04-02", "2031-04-03", "\"guestName\":" + js("Line1\nLine2\tTab") + ",\"totalAmount\":1");
        List<Row> rows = rows(download(o.token(), p, "").getContentAsByteArray()); // parses: no invalid XML characters
        assertEquals("ABCD", rows.get(2).getCellText(1)); // characters XML 1.0 cannot hold are dropped
        assertEquals("Line1\nLine2\tTab", rows.get(3).getCellText(1));
    }

    @Test
    void fiveThousandBookingsExportInReasonableTime() throws Exception {
        TestOwner o = newOwner();
        String p = createProperty(o.token(), "Big", 10);
        List<String> rooms = roomIds(o.token(), p);
        List<Object[]> batch = new ArrayList<>();
        LocalDate start = LocalDate.of(2040, 1, 1);
        for (int i = 0; i < 5000; i++) {
            String room = rooms.get(i % 10);
            LocalDate in = start.plusDays(i / 10);
            batch.add(new Object[]{room, room, in.toString(), in.plusDays(1).toString(), "Guest " + i,
                    i % 7 == 0 ? null : new BigDecimal(i % 500).add(new BigDecimal("0.25"))});
        }
        jdbc.batchUpdate("""
                INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guest_name, guests_count, total_amount)
                VALUES (gen_random_uuid(), ?::uuid, (SELECT owner_id FROM unit WHERE id = ?::uuid),
                        daterange(?::date, ?::date, '[)'), 'CONFIRMED', 'DIRECT', ?, 2, ?)""", batch,
                new int[]{java.sql.Types.VARCHAR, java.sql.Types.VARCHAR, java.sql.Types.VARCHAR, java.sql.Types.VARCHAR,
                        java.sql.Types.VARCHAR, java.sql.Types.NUMERIC});

        long t0 = System.nanoTime();
        MockHttpServletResponse res = download(o.token(), p, "");
        long ms = (System.nanoTime() - t0) / 1_000_000;
        byte[] xlsx = res.getContentAsByteArray();
        List<Row> rows = rows(xlsx);
        assertEquals(5000 + 3, rows.size());
        assertEquals("SUM(H3:H5002)", rows.get(5002).getCell(7).getFormula());
        BigDecimal sum = BigDecimal.ZERO;
        for (Row r : rows.subList(2, 5002)) sum = sum.add(r.getCellAsNumber(7).orElse(BigDecimal.ZERO));
        String screen = getJson("/api/invoices/properties/" + p + "/units", o.token());
        assertEquals(0, decAt(screen, "$.grandTotal.earnings").compareTo(sum));
        System.out.printf("[audit] 5000-row export: %d ms, %d bytes%n", ms, xlsx.length);
        assertTrue(ms < 15_000, "export took " + ms + " ms");
    }
}
