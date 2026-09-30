package com.naumvlavceski.bookingbackend.config.security;

import com.naumvlavceski.bookingbackend.ical.IcalFetchException;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

public class IcalUrlGuard {
    public static void validate(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IcalFetchException("Invalid feed URL");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            throw new IcalFetchException("Feed URL must be a valid https address");
        }
        try {
            for (InetAddress a : InetAddress.getAllByName(uri.getHost())) {
                boolean ipv6UniqueLocal = a.getAddress().length == 16 && (a.getAddress()[0] & 0xFE) == 0xFC;
                if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
                        || a.isSiteLocalAddress() || a.isMulticastAddress() || ipv6UniqueLocal) {
                    throw new IcalFetchException("Feed URL points to a private address");
                }
            }
        } catch (UnknownHostException e) {
            throw new IcalFetchException("Feed host could not be resolved");
        }
    }
}
