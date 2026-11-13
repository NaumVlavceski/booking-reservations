package com.naumvlavceski.bookingbackend.audit.api;

/**
 * Owner A's data as seen by the isolation tests: one property with two rooms, a live and a cancelled reservation
 * (guest names chosen so a LIKE-wildcard search would hit them), a connected calendar and an open conflict.
 */
public record TenantFixture(String email, String token, String propertyId, String unitId, String unit2Id,
                            String reservationId, String cancelledId, String calendarId, String conflictId,
                            String feedToken) {
}
