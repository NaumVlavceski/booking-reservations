package com.naumvlavceski.bookingbackend.util;

import java.util.regex.Pattern;

/**
 * Error text that is safe to store for the admin panel (email_log.error, external_calendar.last_error_message):
 * no links (calendar import links and reset links work like passwords), nothing that looks like a token or a key,
 * one line, at most {@link #MAX_LENGTH} characters.
 */
public final class SafeErrorText {
    public static final int MAX_LENGTH = 300;

    /** Anything with a scheme ("https://…", "webcal://…"), up to the next whitespace. */
    private static final Pattern URL = Pattern.compile("(?i)\\b[a-z][a-z0-9+.-]*://\\S+");
    /** key=value pairs whose key names a secret (token=…, key=…, secret=…, signature=…, code=…, t=…). */
    private static final Pattern SECRET_PARAM = Pattern.compile(
            "(?i)\\b(token|access_token|key|api_key|apikey|secret|signature|sig|code|password|t)=[^\\s&;,]+");
    /** Long runs of letters/digits (hex tokens, base64, Resend/JWT-like strings). */
    private static final Pattern LONG_TOKEN = Pattern.compile("[A-Za-z0-9_\\-+/=.]{24,}");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private SafeErrorText() {}

    /**
     * @param raw the error message (may be null)
     * @param secrets exact strings that must never appear (for example the calendar's own URL); null entries ignored
     */
    public static String of(String raw, String... secrets) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw;
        if (secrets != null) {
            for (String secret : secrets) {
                if (secret != null && !secret.isBlank()) s = s.replace(secret, "[link]");
            }
        }
        s = URL.matcher(s).replaceAll("[link]");
        s = SECRET_PARAM.matcher(s).replaceAll("$1=[hidden]");
        s = LONG_TOKEN.matcher(s).replaceAll("[hidden]");
        s = WHITESPACE.matcher(s).replaceAll(" ").trim();
        if (s.length() > MAX_LENGTH) s = s.substring(0, MAX_LENGTH - 1) + "…";
        return s;
    }
}
