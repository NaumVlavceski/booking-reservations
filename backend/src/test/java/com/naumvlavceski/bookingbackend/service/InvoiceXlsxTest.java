package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.repository.InvoiceRepository.ExportRow;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvoiceXlsxTest {

    private record Booking(String getUnitName, String getGuestName, LocalDate getCheckIn, LocalDate getCheckOut,
                           Integer getNights, String getStatus, String getSource, BigDecimal getTotalAmount)
            implements ExportRow {
    }

    static List<Row> rows(byte[] xlsx) throws IOException {
        try (ReadableWorkbook wb = new ReadableWorkbook(new ByteArrayInputStream(xlsx))) {
            return wb.getFirstSheet().read();
        }
    }

    @Test
    void writesTitleHeaderTypedCellsAndTotal() throws IOException {
        byte[] xlsx = InvoiceXlsx.write("Beach House, Ohrid", List.of(
                new Booking("Room 1", "Anna \"Ani\" Petrova", LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 4),
                        3, "PAID", "BOOKING", new BigDecimal("1250.5")),
                new Booking("Room 2", "=HYPERLINK(\"x\")", LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 6),
                        1, "CONFIRMED", "DIRECT", null)));
        List<Row> rows = rows(xlsx);

        assertEquals(5, rows.size());
        assertEquals("Beach House, Ohrid", rows.get(0).getCellText(0)); // title row, merged across the table
        for (int c = 0; c < InvoiceXlsx.HEADER.size(); c++) {
            assertEquals(InvoiceXlsx.HEADER.get(c), rows.get(1).getCellText(c));
        }
        Row anna = rows.get(2);
        assertEquals("Room 1", anna.getCellText(0));
        assertEquals("Anna \"Ani\" Petrova", anna.getCellText(1));
        assertEquals(LocalDate.of(2026, 10, 1), anna.getCellAsDate(2).orElseThrow().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 4), anna.getCellAsDate(3).orElseThrow().toLocalDate());
        assertEquals(0, new BigDecimal("3").compareTo(anna.getCellAsNumber(4).orElseThrow()));
        assertEquals("Paid", anna.getCellText(5));
        assertEquals("Booking.com", anna.getCellText(6));
        assertEquals(0, new BigDecimal("1250.50").compareTo(anna.getCellAsNumber(7).orElseThrow()));

        Row second = rows.get(3);
        assertEquals("=HYPERLINK(\"x\")", second.getCellAsString(1).orElseThrow()); // a text cell, not a formula
        assertEquals(null, second.getCell(1).getFormula());
        assertTrue(second.getCellAsNumber(7).isEmpty()); // no amount: empty cell

        Row total = rows.get(4);
        assertEquals("Total", total.getCellText(0));
        assertEquals("SUM(E3:E4)", total.getCell(4).getFormula());
        assertEquals("SUM(H3:H4)", total.getCell(7).getFormula());
    }

    @Test
    void emptyExportIsTitleAndHeader() throws IOException {
        List<Row> rows = rows(InvoiceXlsx.write("Lodge", List.of()));
        assertEquals(2, rows.size());
        assertEquals("Lodge", rows.get(0).getCellText(0));
        assertEquals("Room", rows.get(1).getCellText(0));
    }

    @Test
    void filenameFollowsTheDateRange() {
        LocalDate from = LocalDate.of(2026, 10, 1), to = LocalDate.of(2026, 10, 31);
        assertEquals("invoices_2026-10-01_2026-10-31.xlsx", InvoiceXlsx.filename(from, to));
        assertEquals("invoices_from_2026-10-01.xlsx", InvoiceXlsx.filename(from, null));
        assertEquals("invoices_until_2026-10-31.xlsx", InvoiceXlsx.filename(null, to));
        assertEquals("invoices_all-time.xlsx", InvoiceXlsx.filename(null, null));
    }
}
