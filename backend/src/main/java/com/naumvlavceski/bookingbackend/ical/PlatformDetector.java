package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.ReservationSource;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;

public final class PlatformDetector {
    private PlatformDetector() {}

    public static String normalize(String raw) {
        if (raw == null) return "";
        String link = raw.trim();
        if (link.regionMatches(true, 0, "webcal://", 0, "webcal://".length())) {
            return "https://" + link.substring("webcal://".length());
        }
        return link;
    }

    public static Optional<ReservationSource> detect(String url) {
        String host;
        try {
            host = URI.create(url).getHost();
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        if (host == null) return Optional.empty();
        host = host.toLowerCase(Locale.ROOT);

        if (host.equals("booking.com") || host.endsWith(".booking.com")) return Optional.of(ReservationSource.BOOKING);
        return Optional.empty();
    }

}
