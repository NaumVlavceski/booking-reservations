package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.mail.UnsubscribeLinks;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/**
 * Public (no login) unsubscribe for booking notification emails.
 * GET only shows a confirmation page: mail scanners and link previewers open links automatically,
 * and must not be able to unsubscribe someone. The POST does the work, and is also what mail
 * clients call for one-click unsubscribe (RFC 8058).
 */
@RestController
@RequestMapping("/api/notifications/unsubscribe")
@RequiredArgsConstructor
public class UnsubscribeController {
    private final UnsubscribeLinks links;
    private final OwnerRepository ownerRepository;

    @GetMapping(produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> confirmPage(@RequestParam String token) {
        if (links.verify(token).isEmpty()) return page(400, "Invalid link", "This unsubscribe link is not valid.", null);
        return page(200, "Unsubscribe from RoomTrack emails",
                "You will stop receiving booking notification emails (new, changed and cancelled reservations, calendar problems).",
                token);
    }

    @PostMapping(produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> unsubscribe(@RequestParam String token) {
        var ownerId = links.verify(token);
        if (ownerId.isEmpty()) return page(400, "Invalid link", "This unsubscribe link is not valid.", null);
        ownerRepository.findById(ownerId.get()).ifPresent(owner -> {
            if (owner.isNotificationsEnabled()) {
                owner.setNotificationsEnabled(false);
                ownerRepository.save(owner);
            }
        });
        return page(200, "You are unsubscribed",
                "You will no longer receive booking notification emails. You can turn them back on any time in RoomTrack settings.",
                null);
    }

    private static ResponseEntity<String> page(int status, String title, String message, String confirmToken) {
        String form = confirmToken == null ? "" :
                "<form method=\"post\" action=\"?token=" + HtmlUtils.htmlEscape(confirmToken) + "\">"
                        + "<button type=\"submit\">Unsubscribe</button></form>";
        String html = "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>" + HtmlUtils.htmlEscape(title) + "</title>"
                + "<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}"
                + "button{font:inherit;padding:.6rem 1.2rem;border:0;border-radius:.4rem;background:#222;color:#fff;cursor:pointer}</style>"
                + "</head><body><h1>" + HtmlUtils.htmlEscape(title) + "</h1><p>" + HtmlUtils.htmlEscape(message) + "</p>"
                + form + "</body></html>";
        return ResponseEntity.status(status).contentType(MediaType.TEXT_HTML).body(html);
    }
}
