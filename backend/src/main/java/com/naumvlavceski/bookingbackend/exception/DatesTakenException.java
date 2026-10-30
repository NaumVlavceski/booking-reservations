package com.naumvlavceski.bookingbackend.exception;

import java.time.LocalDate;

/** A room already has a booking on (part of) the requested dates. Carries which room and which dates, so the frontend can say so. */
public class DatesTakenException extends RuntimeException {
    private final String room;
    private final LocalDate takenFrom;
    private final LocalDate takenTo;

    public DatesTakenException(String room, LocalDate takenFrom, LocalDate takenTo) {
        super(room + " is already booked on some of these dates.");
        this.room = room;
        this.takenFrom = takenFrom;
        this.takenTo = takenTo;
    }

    public String getRoom() {
        return room;
    }

    public LocalDate getTakenFrom() {
        return takenFrom;
    }

    public LocalDate getTakenTo() {
        return takenTo;
    }
}
