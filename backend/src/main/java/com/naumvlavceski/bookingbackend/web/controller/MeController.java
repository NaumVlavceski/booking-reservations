package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUser;
import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.dto.ChangePasswordRequest;
import com.naumvlavceski.bookingbackend.dto.DeleteAccountRequest;
import com.naumvlavceski.bookingbackend.dto.MeResponse;
import com.naumvlavceski.bookingbackend.service.AccountService;
import com.naumvlavceski.bookingbackend.service.AuthService;
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
public class MeController {

    private final AuthService authService;
    private final AccountService accountService;

    @GetMapping
    public MeResponse me(@AuthenticationPrincipal CurrentUser currentUser) {
        return authService.me(currentUser.userId());
    }

    /** Signs out every other session; the response carries a fresh token for this one. */
    @PostMapping("/password")
    public AuthResponse changePassword(@AuthenticationPrincipal CurrentUser currentUser,
                                       @Valid @RequestBody ChangePasswordRequest request) {
        return authService.changePassword(currentUser.userId(), request.currentPassword(), request.newPassword());
    }

    /** "Download my data": everything in this account as one JSON file (limited to app.rate-limit.data-export). */
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal CurrentUser currentUser) {
        String filename = "roomtrack-data-" + LocalDate.now() + ".json";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .cacheControl(CacheControl.noStore())
                .body(accountService.export(currentUser.userId(), currentUser.ownerId()));
    }

    /** "Delete my account": immediate and permanent. 204, after which every token of this account stops working. */
    @PostMapping("/delete")
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal CurrentUser currentUser,
                                              @Valid @RequestBody DeleteAccountRequest request) {
        accountService.deleteAccount(currentUser.userId(), request.password(), request.confirmation());
        return ResponseEntity.noContent().build();
    }
}
