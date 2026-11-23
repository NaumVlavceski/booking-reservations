package com.naumvlavceski.bookingbackend.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SafeErrorTextTest {

    @Test
    void removesLinksTokensAndTheGivenSecrets() {
        String url = "https://ical.booking.com/v1/export?t=6f1e2d3c-aaaa-bbbb";
        String s = SafeErrorText.of("Failed after 3 attempts: connect to " + url + " timed out; key=sk_live_x; "
                + "id 0123456789abcdef0123456789abcdef", url);
        assertFalse(s.contains("booking.com/v1"));
        assertFalse(s.contains("6f1e2d3c"));
        assertFalse(s.contains("sk_live_x"));
        assertFalse(s.contains("0123456789abcdef0123456789abcdef"));
        assertTrue(s.startsWith("Failed after 3 attempts: connect to [link] timed out"));
    }

    @Test
    void keepsOrdinaryMessagesAndCutsLongOnes() {
        assertEquals("Feed returned HTTP 500", SafeErrorText.of("Feed returned HTTP 500"));
        assertEquals(300, SafeErrorText.of("word ".repeat(200)).length());
        assertNull(SafeErrorText.of("  "));
        assertNull(SafeErrorText.of(null));
    }
}
