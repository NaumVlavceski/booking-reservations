package com.naumvlavceski.bookingbackend.dto;

/** Proof that the emailed code was right; needed (once, within minutes) to set the new password. */
public record ResetTokenResponse(String resetToken) {}
