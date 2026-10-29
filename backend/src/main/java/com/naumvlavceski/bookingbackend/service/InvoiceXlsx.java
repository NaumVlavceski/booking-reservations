package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.repository.InvoiceRepository.ExportRow;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The invoices export as an Excel workbook: the property name on top, then one row per booking under a bold,
 * frozen header, and a total row (nights and amount as SUM formulas). Dates and amounts are real date / number cells, and every column is
 * sized to its widest value, so nothing opens as "####" and the file reads the same in any Excel language.
 * Text is always written as text, never as a formula, so guest names from imported calendars are safe.
 */
public final class InvoiceXlsx {

    public record Export(String filename, byte[] content) {
    }

    public static final String MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    static final List<String> HEADER = List.of("Room", "Guest", "Check-in", "Check-out", "Nights", "Status", "Source",
            "Amount");

    private static final String DATE_FORMAT = "d mmm yyyy";
    private static final DateTimeFormatter DATE_WIDTH = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final String AMOUNT_FORMAT = "#,##0.00";
    private static final int CHECK_IN = 2, CHECK_OUT = 3, NIGHTS = 4, AMOUNT = 7;
    private static final Map<String, String> LABELS = Map.of(
            "CONFIRMED", "Confirmed", "PAID", "Paid",
            "DIRECT", "Direct", "BOOKING", "Booking.com", "AIRBNB", "Airbnb");

    private InvoiceXlsx() {
    }

    static String filename(LocalDate from, LocalDate to) {
        if (from != null && to != null) return "invoices_" + from + "_" + to + ".xlsx";
        if (from != null) return "invoices_from_" + from + ".xlsx";
        if (to != null) return "invoices_until_" + to + ".xlsx";
        return "invoices_all-time.xlsx";
    }

    static byte[] write(String propertyName, List<ExportRow> rows) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            Workbook wb = new Workbook(out, "RoomTrack", "1.0");
            Worksheet ws = wb.newWorksheet("Invoices");
            int last = HEADER.size() - 1;
            int[] width = new int[HEADER.size()];

            ws.value(0, 0, propertyName);
            ws.range(0, 0, 0, last).merge();
            ws.range(0, 0, 0, last).style().horizontalAlignment("center").set();

            for (int c = 0; c <= last; c++) {
                ws.value(1, c, HEADER.get(c));
                width[c] = HEADER.get(c).length();
            }
            ws.range(1, 0, 1, last).style().bold().fillColor("F2F2F2").set();
            ws.freezePane(0, 2);

            int r = 2;
            BigDecimal total = BigDecimal.ZERO;
            for (ExportRow row : rows) {
                String[] text = {row.getUnitName(), row.getGuestName(), null, null, null,
                        LABELS.getOrDefault(row.getStatus(), row.getStatus()),
                        LABELS.getOrDefault(row.getSource(), row.getSource()), null};
                for (int c = 0; c < text.length; c++) {
                    if (text[c] != null) {
                        ws.value(r, c, text[c]);
                        width[c] = Math.max(width[c], text[c].length());
                    }
                }
                ws.value(r, CHECK_IN, row.getCheckIn());
                ws.value(r, CHECK_OUT, row.getCheckOut());
                ws.range(r, CHECK_IN, r, CHECK_OUT).style().format(DATE_FORMAT).set();
                width[CHECK_IN] = Math.max(width[CHECK_IN], DATE_WIDTH.format(row.getCheckIn()).length());
                width[CHECK_OUT] = Math.max(width[CHECK_OUT], DATE_WIDTH.format(row.getCheckOut()).length());
                ws.value(r, NIGHTS, row.getNights());
                if (row.getTotalAmount() != null) {
                    BigDecimal amount = row.getTotalAmount().setScale(2, RoundingMode.HALF_UP);
                    ws.value(r, AMOUNT, amount);
                    ws.style(r, AMOUNT).format(AMOUNT_FORMAT).set();
                    total = total.add(amount);
                }
                r++;
            }

            if (!rows.isEmpty()) {
                // Bookings are on sheet rows 3..r (r counts from 0, so the last booking is sheet row r).
                ws.value(r, 0, "Total");
                ws.formula(r, NIGHTS, "SUM(E3:E" + r + ")");
                ws.formula(r, AMOUNT, "SUM(H3:H" + r + ")");
                ws.range(r, 0, r, last).style().bold().fillColor("F2F2F2").set();
                ws.style(r, AMOUNT).bold().fillColor("F2F2F2").format(AMOUNT_FORMAT).set();
                // The total is the widest amount; sized as Excel shows it, "12,345.67".
                width[AMOUNT] = Math.max(width[AMOUNT], String.format(Locale.ENGLISH, "%,.2f", total).length());
            }

            for (int c = 0; c < width.length; c++) {
                ws.width(c, Math.min(width[c], 60) + 3);
            }
            wb.finish();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
