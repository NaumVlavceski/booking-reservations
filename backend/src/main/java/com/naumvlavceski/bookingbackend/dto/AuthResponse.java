package com.naumvlavceski.bookingbackend.dto;

public record AuthResponse(String token, String email, String fullName) {}
