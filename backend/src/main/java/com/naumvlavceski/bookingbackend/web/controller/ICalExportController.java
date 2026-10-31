package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.ical.ICalBuilder;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.ratelimit.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

@RestController
@RequestMapping("/api/ical")
@RequiredArgsConstructor
public class ICalExportController {
    private static final int MAX_TOKEN_LENGTH = 128;

    private final UnitRepository unitRepository;
    private final ReservationRepository reservationRepository;
    private final RateLimits rateLimits;

    /**
     * Limited per feed (app.rate-limit.feed-per-token), not per IP: Booking.com fetches every owner's feed through
     * the same few Netlify proxy addresses. Unknown tokens are limited per IP (feed-misses-per-ip) to slow guessing,
     * and only misses count there, so a guesser behind a shared address cannot block the real fetches.
     */
    @GetMapping(value = "/{token}.ics", produces = "text/calendar")
    public ResponseEntity<String> exportFeed(@PathVariable String token, HttpServletRequest request) {
        Optional<Unit> found = token.length() > MAX_TOKEN_LENGTH ? Optional.empty() : unitRepository.findByIcalToken(token);
        if (found.isEmpty()) {
            rateLimits.enforce("feed-miss:" + RateLimits.clientIp(request), rateLimits.limits().feedMissesPerIp());
            throw new NoSuchElementException("Feed not found");
        }
        Unit unit = found.get();
        rateLimits.enforce("feed:" + unit.getId(), rateLimits.limits().feedPerToken());
        List<Reservation> reservations = reservationRepository
                .findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED);
        String ics = ICalBuilder.build(unit, reservations);
        return ResponseEntity.ok()
                // private: the URL is a secret, so shared caches (CDN, the Netlify proxy) must not keep a copy
                .header("Cache-Control", "private, max-age=1800")
                .body(ics);

    }
}
