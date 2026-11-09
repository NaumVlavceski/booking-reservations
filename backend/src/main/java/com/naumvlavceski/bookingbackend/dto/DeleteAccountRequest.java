package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Deleting the account needs the current password and the typed word DELETE. */
public record DeleteAccountRequest(
        @NotBlank @Size(max = 200) String password,
        @NotBlank @Size(max = 20) String confirmation
) {
}
