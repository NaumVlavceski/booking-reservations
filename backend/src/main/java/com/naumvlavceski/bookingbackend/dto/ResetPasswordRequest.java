package com.naumvlavceski.bookingbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Size(max = 128) String resetToken,
        @ValidPassword String newPassword
) {}
