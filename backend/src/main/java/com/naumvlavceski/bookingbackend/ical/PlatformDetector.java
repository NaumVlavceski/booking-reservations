package com.naumvlavceski.bookingbackend.ical;

import com.naumvlavceski.bookingbackend.model.ReservationSource;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

public final class PlatformDetector {
    private static final Pattern AIRBNB_HOST = Pattern.compile("^([a-z0-9-]+\\.)*airbnb\\.[a-z]{2,3}(\\.[a-z]{2})?$");

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
        if (AIRBNB_HOST.matcher(host).matches()) return Optional.of(ReservationSource.AIRBNB);
        return Optional.empty();
    }

    public static String displayName(ReservationSource platform) {
        return platform == ReservationSource.AIRBNB ? "Airbnb" : "Booking.com";
    }

    public static String withArticle(ReservationSource platform) {
        return (platform == ReservationSource.AIRBNB ? "an " : "a ") + displayName(platform);
    }
}
