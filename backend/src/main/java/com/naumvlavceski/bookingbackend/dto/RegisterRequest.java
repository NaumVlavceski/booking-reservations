package com.naumvlavceski.bookingbackend.dto;

public record RegisterRequest(
        String businessName,
        String contactEmail,
        String email,
        String password,
        String fullName
) {
}
