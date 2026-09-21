package com.naumvlavceski.bookingbackend.config.security;


import java.util.UUID;

public record CurrentUser(UUID userId, UUID ownerId, String email, String role) {}
