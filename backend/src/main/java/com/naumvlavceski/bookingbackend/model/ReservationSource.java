package com.naumvlavceski.bookingbackend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Where the booking came from. DIRECT: entered in RoomTrack (only these go out in the unit's "
        + "calendar feed). BOOKING: imported from a Booking.com calendar link. AIRBNB: reserved; Airbnb links are "
        + "not accepted at the moment.")
public enum ReservationSource {
    DIRECT,BOOKING, AIRBNB
}
