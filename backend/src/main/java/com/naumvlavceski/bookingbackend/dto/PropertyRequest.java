package com.naumvlavceski.bookingbackend.dto;

public record PropertyRequest(
        String name,
        String address,
        String timezone,
        Integer unitCount
) {
}
