package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;

import java.time.format.DateTimeFormatter;
import java.util.List;


public class ICalBuilder {
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    public static String build(Unit unit, List<Reservation> reservations) {
        StringBuilder sb = new StringBuilder();
        sb.append("BEGIN:VCALENDAR\r\n");
        sb.append("VERSION:2.0\r\n");
        sb.append("PRODID:-//Staytrack//Booking Calendar//EN\r\n");
        sb.append("CALSCALE:GREGORIAN\r\n");
        sb.append("X-WR-CALNAME:").append(escape(unit.getName())).append("\r\n");
        for (Reservation r : reservations) {
            if (r.getStatus() == ReservationStatus.CANCELLED) continue;
            if (r.getSource() != ReservationSource.DIRECT) continue;
            sb.append("BEGIN:VEVENT\r\n");
            sb.append("UID:").append(r.getId()).append("@staytrack\r\n");
            sb.append("DTSTART;VALUE=DATE:").append(r.getStayRange().lower().format(DATE_FMT)).append("\r\n");
            sb.append("DTEND;VALUE=DATE:").append(r.getStayRange().upper().format(DATE_FMT)).append("\r\n");
            String summary = (r.getGuestName() != null && !r.getGuestName().isBlank())
                    ? r.getGuestName()
                    : "Reserved";
            sb.append("SUMMARY:").append(summary).append("\r\n");
            sb.append("END:VEVENT\r\n");
        }
        sb.append("END:VCALENDAR\r\n");
        return sb.toString();
    }
    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;");
    }
}
