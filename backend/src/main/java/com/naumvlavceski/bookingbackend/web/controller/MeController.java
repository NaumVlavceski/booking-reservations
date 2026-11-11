package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.openapi.MessageSchema;
import com.naumvlavceski.bookingbackend.config.security.CurrentUser;
import com.naumvlavceski.bookingbackend.demo.DemoGuard;
import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.ChangePasswordRequest;
import com.naumvlavceski.bookingbackend.dto.DeleteAccountRequest;
import com.naumvlavceski.bookingbackend.dto.MeResponse;
import com.naumvlavceski.bookingbackend.dto.SupportRequest;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import com.naumvlavceski.bookingbackend.service.AccountService;
import com.naumvlavceski.bookingbackend.service.AuthService;
import com.naumvlavceski.bookingbackend.service.ContactService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Map;

// Lives outside /api/auth/** on purpose — that prefix is permitAll, this needs a logged-in user.
@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_ACCOUNT)
public class MeController {

    private final AuthService authService;
    private final AccountService accountService;
    private final ContactService contactService;
    private final DemoGuard demoGuard;
    private final RateLimits rateLimits;

    @Operation(summary = "The signed-in account",
            description = "Email, name, and which versions of the Terms and Privacy Policy were accepted.")
    @GetMapping
    public MeResponse me(@AuthenticationPrincipal CurrentUser currentUser) {
        return authService.me(currentUser.userId());
    }

    /** Signs out every other session; the response carries a fresh token for this one. */
    @Operation(summary = "Change my password",
            description = "Needs the current password. Every other session is signed out; the answer has a fresh "
                    + "token for this one. At most 5 tries per 15 minutes.")
    @ApiResponse(responseCode = "200", description = "Changed; use the new token")
    @ApiResponse(responseCode = "400", description = "Current password wrong (`WRONG_PASSWORD`), or invalid input",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/password")
    public AuthResponse changePassword(@AuthenticationPrincipal CurrentUser currentUser,
                                       @Valid @RequestBody ChangePasswordRequest request) {
        return authService.changePassword(currentUser.userId(), request.currentPassword(), request.newPassword());
    }

    /** "Download my data": everything in this account as one JSON file (limited to app.rate-limit.data-export). */
    @Operation(summary = "Download my data",
            description = "Everything stored for this account as one JSON file (format `roomtrack-export-v1`): "
                    + "account, properties, units, reservations with guest details, conflicts and the email log. "
                    + "Password and code hashes and calendar links are left out, because they work like passwords. "
                    + "At most 5 per hour.")
    @ApiResponse(responseCode = "200", description = "The JSON file (sent as a download)",
            content = @Content(mediaType = "application/json", schema = @Schema(type = "object")))
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal CurrentUser currentUser) {
        String filename = "roomtrack-data-" + LocalDate.now() + ".json";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .cacheControl(CacheControl.noStore())
                .body(accountService.export(currentUser.userId(), currentUser.ownerId()));
    }

    /** "Contact support" in the app's menu: the message goes to the contact inbox, Reply-To this account's email. */
    @Operation(summary = "Contact support",
            description = "Emails the message to RoomTrack, like the contact form, but the reply goes to this "
                    + "account's own email (no email or subject in the request). Not available in the demo. "
                    + "5 per hour per account, and counts toward the contact form's 30 per hour for everyone. "
                    + "503 `CONTACT_UNAVAILABLE` or `CONTACT_FAILED` when it could not be sent.")
    @ApiResponse(responseCode = "200", description = "Sent",
            content = @Content(schema = @Schema(implementation = MessageSchema.class)))
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @ApiResponse(responseCode = "503", description = "Not sent (`CONTACT_UNAVAILABLE` or `CONTACT_FAILED`)",
            content = @Content(schema = @Schema(ref = "#/components/schemas/ApiError")))
    @PostMapping("/support")
    public Map<String, String> contactSupport(@AuthenticationPrincipal CurrentUser currentUser,
                                              @Valid @RequestBody SupportRequest request) {
        demoGuard.requireNotDemo(currentUser.ownerId());
        rateLimits.enforce("support-account:" + currentUser.userId(), rateLimits.limits().contactPerIp());
        rateLimits.enforce("contact-total", rateLimits.limits().contactTotal());
        MeResponse me = authService.me(currentUser.userId());
        contactService.sendSupport(me.email(), me.fullName(), request.message());
        return Map.of("message", "Thanks, your message was sent. We'll reply to " + me.email() + ".");
    }

    /** "Delete my account": immediate and permanent. 204, after which every token of this account stops working. */
    @Operation(summary = "Delete my account",
            description = "Immediate and permanent: properties, units, reservations with guest details, connected "
                    + "calendars, email log and the account itself. Needs the password and `confirmation: \"DELETE\"`. "
                    + "Every token of the account stops working. At most 5 tries per 15 minutes.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "400", description = "Wrong password (`WRONG_PASSWORD`) or confirmation is not DELETE",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "403", ref = OpenApiConfig.FORBIDDEN)
    @ApiResponse(responseCode = "429", ref = OpenApiConfig.TOO_MANY_REQUESTS)
    @PostMapping("/delete")
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal CurrentUser currentUser,
                                              @Valid @RequestBody DeleteAccountRequest request) {
        accountService.deleteAccount(currentUser.userId(), request.password(), request.confirmation());
        return ResponseEntity.noContent().build();
    }
}
