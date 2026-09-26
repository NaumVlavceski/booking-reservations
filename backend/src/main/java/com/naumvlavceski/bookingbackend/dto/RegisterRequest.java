package com.naumvlavceski.bookingbackend.dto;

public record RegisterRequest(
        String businessName,
        String contactPhone,
        String email,
        String password,
        String fullName
) {
}
