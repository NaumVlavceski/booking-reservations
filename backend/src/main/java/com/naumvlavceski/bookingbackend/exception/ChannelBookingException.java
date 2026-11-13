package com.naumvlavceski.bookingbackend.exception;

/**
 * 409 CHANNEL_BOOKING: the booking is still listed in its channel's feed (Booking.com), so it can only be cancelled
 * there; the next sync then cancels it here too. Owner's decision for audit finding ICAL-01.
 */
public class ChannelBookingException extends RuntimeException {
    public ChannelBookingException(String message) {
        super(message);
    }
}
