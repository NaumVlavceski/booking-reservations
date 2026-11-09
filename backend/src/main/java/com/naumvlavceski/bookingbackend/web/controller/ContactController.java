package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.openapi.MessageSchema;
import com.naumvlavceski.bookingbackend.dto.ContactRequest;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.service.ContactService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** The public contact form: anyone may write to the owner without seeing the owner's address. */
@RestController
@RequestMapping("/api/contact")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_CONTACT)
public class ContactController {
    static final String SENT = "Thanks, your message was sent. We'll reply to the email address you gave.";

    private final ContactService contactService;
    private final RateLimits rateLimits;

    @Operation(summary = "Send a message",
            description = "Emails the message to RoomTrack; the reply goes to the address given. No token needed. "
                    + "5 per hour per IP, and 30 per hour for everyone together. 503 `CONTACT_UNAVAILABLE` when the "
                    + "form is switched off, `CONTACT_FAILED` when the email could not be sent; try again later.")
    @ApiResponse(responseCode = "200", description = "Sent",
            content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @ApiResponse(responseCode = "503", description = "Not sent (`CONTACT_UNAVAILABLE` or `CONTACT_FAILED`)",
            content = @Content(schema = @Schema(ref = "#/components/schemas/ApiError")))
    @PostMapping
    public ResponseEntity<Map<String, String>> send(@Valid @RequestBody ContactRequest request,
                                                    HttpServletRequest http) {
        rateLimits.enforce("contact-ip:" + RateLimits.clientIp(http), rateLimits.limits().contactPerIp());
        // Spam trap filled in: the same answer as a real send, so the bot learns nothing, but nothing is sent
        if (request.website() != null && !request.website().isBlank()) return ResponseEntity.ok(Map.of("message", SENT));
        rateLimits.enforce("contact-total", rateLimits.limits().contactTotal());
        contactService.send(request);
        return ResponseEntity.ok(Map.of("message", SENT));
    }
}
