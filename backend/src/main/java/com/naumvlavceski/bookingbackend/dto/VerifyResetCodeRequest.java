package com.naumvlavceski.bookingbackend.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VerifyResetCodeRequest(
        @Schema(example = "owner@example.com") @NotBlank @Email @Size(max = 255) String email,
        @Schema(description = "The 6-digit code from the email", example = "482913") @NotBlank @Size(max = 12) String code
) {}
