package com.naumvlavceski.bookingbackend.config.openapi;

import io.swagger.v3.oas.annotations.media.Schema;

/** Documentation only: the {"message": ...} answers some endpoints build as a map. Never instantiated. */
@Schema(name = "Message", description = "A short text that is safe to show to the user")
public record MessageSchema(
        @Schema(example = "If an account with this email exists, we sent a code.") String message
) {
}
