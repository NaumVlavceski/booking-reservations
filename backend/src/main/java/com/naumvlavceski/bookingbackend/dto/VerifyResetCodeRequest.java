package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VerifyResetCodeRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 12) String code
) {}
