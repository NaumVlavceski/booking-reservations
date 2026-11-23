package com.naumvlavceski.bookingbackend.exception;

/**
 * 409 CHANNEL_BOOKING: the booking is still listed in its channel's feed (Booking.com), so it can only be cancelled
 * there; the sync then cancels it here too. Owner's decision (2026-11-14, ICAL-01 revisited): cancelling it only in
 * RoomTrack frees its dates here and in RoomTrack's own calendar link, while the guest still holds them.
 */
public class ChannelBookingException extends RuntimeException {
    public ChannelBookingException(String message) {
        super(message);
    }
}
